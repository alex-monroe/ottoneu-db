"""Projection runner: generates projections for a model and upserts to DB."""

from __future__ import annotations

import json
from typing import Any

import numpy as np
import pandas as pd

from scripts.config import get_supabase_client, MIN_GAMES, fetch_all_rows
from scripts.analysis_utils import fetch_multi_season_stats, fetch_multi_season_nfl_stats
from scripts.feature_projections.features import FEATURE_REGISTRY
from scripts.feature_projections.model_config import ModelDefinition, PositionOverride, get_model
from scripts.feature_projections.combiner import combine_features
from scripts.feature_projections.learned_combiner import (
    combine_features_learned,
    combine_features_residual,
    load_model_params,
)
from scripts.feature_projections.qb_starters import get_all_starter_ids, is_qb_starter
from scripts.feature_projections.expected_games import build_expected_games


def _ensure_model_in_db(supabase, model_def: ModelDefinition) -> str:
    """Register or fetch model in projection_models table. Returns model_id."""
    existing = (
        supabase.table("projection_models")
        .select("id")
        .eq("name", model_def.name)
        .eq("version", model_def.version)
        .execute()
    )

    if existing.data:
        return existing.data[0]["id"]

    result = (
        supabase.table("projection_models")
        .insert(
            {
                "name": model_def.name,
                "version": model_def.version,
                "description": model_def.description,
                "features": json.dumps(model_def.features),
                "config": json.dumps({
                    "weights": model_def.weights,
                    "position_overrides": {
                        pos: {"features": ov.features, "weights": ov.weights}
                        for pos, ov in model_def.position_overrides.items()
                    },
                }),
                "is_baseline": model_def.is_baseline,
                "is_active": False,
            }
        )
        .execute()
    )
    return result.data[0]["id"]


def _collect_feature_names_recursive(model_def: ModelDefinition) -> set[str]:
    """Union of feature names across a model and all transitively-nested base
    models. Residual stacks like v26 (vegas) → v25 (draft_capital) → v22
    (advanced receiving) need every layer's features instantiated so the
    learned combiner can evaluate the chain. GH #378.
    """
    names: set[str] = set(model_def.features)
    for override in model_def.position_overrides.values():
        names.update(override.features)
    if model_def.combiner_type == "residual" and model_def.base_model_name:
        base_def = get_model(model_def.base_model_name)
        names.update(_collect_feature_names_recursive(base_def))
    return names


def _resolve_residual_base_features(
    model_def: ModelDefinition, position: str
) -> list[str]:
    """Union of position-resolved features across all nested base models."""
    if model_def.combiner_type != "residual" or not model_def.base_model_name:
        return []
    base_def = get_model(model_def.base_model_name)
    base_features, _ = _resolve_features_for_position(base_def, position)
    deeper = _resolve_residual_base_features(base_def, position)
    return list(dict.fromkeys(list(deeper) + list(base_features)))


def _resolve_features_for_position(
    model_def: ModelDefinition, position: str
) -> tuple[list[str], dict[str, float]]:
    """Return (feature_names, weights) for a position, applying overrides if present."""
    override = model_def.position_overrides.get(position)
    if override:
        # Merge model-level weights with override-level weights (override wins)
        merged_weights = {**model_def.weights, **override.weights}
        return override.features, merged_weights
    return model_def.features, model_def.weights


def _compute_positional_mean_ppg(
    history_df: pd.DataFrame,
    players_df: pd.DataFrame,
    min_games: int = MIN_GAMES,
) -> dict[str, float]:
    """Compute mean PPG per position from historical player_stats.

    Only includes players who meet the minimum games threshold.
    Returns dict mapping position -> mean PPG.
    """
    if history_df.empty or players_df.empty:
        return {}

    merged = history_df.merge(
        players_df[["player_id_ref", "position"]],
        left_on="player_id",
        right_on="player_id_ref",
        how="left",
    )

    # Filter to players meeting min games
    merged["games_played"] = pd.to_numeric(merged["games_played"], errors="coerce").fillna(0)
    merged["ppg"] = pd.to_numeric(merged["ppg"], errors="coerce").fillna(0)
    qualified = merged[merged["games_played"] >= min_games]

    if qualified.empty:
        return {}

    # Average PPG per player first (across seasons), then per position
    player_avg = qualified.groupby(["player_id", "position"])["ppg"].mean().reset_index()
    pos_means = player_avg.groupby("position")["ppg"].mean()

    return {str(pos): float(val) for pos, val in pos_means.items()}


def _compute_pooling_k(
    history_df: pd.DataFrame,
    players_df: pd.DataFrame,
    min_games: int = 10,
    min_players: int = 8,
    k_clip: tuple[float, float] = (0.3, 2.0),
) -> dict[str, float]:
    """Empirical-Bayes pooling strength k_g per position (GH #667, L3).

    For the normal–normal hierarchical model behind ``partial_pooling``, the
    shrinkage toward the positional mean is ``k_g / (n_p + k_g)`` with
    ``k_g = σ²_g / τ²_g`` — the within-player season-to-season variance over the
    between-player variance of true means. Estimated by method of moments from
    the training population only (the same leakage-free, before-the-target-season
    history that feeds ``positional_mean_ppg``), so the held-out harness
    re-estimates it per fold. Restricting to full-ish seasons (``games ≥
    min_games``) makes each season ≈ one season-equivalent so σ² is in the same
    units as the feature's ``n_p``.

    Falls back to 1.0 for any position with too few players to estimate, and
    clips to ``k_clip`` to guard against a thin-fold variance blowing up.
    """
    if history_df.empty or players_df.empty:
        return {}

    merged = history_df.merge(
        players_df[["player_id_ref", "position"]],
        left_on="player_id",
        right_on="player_id_ref",
        how="left",
    )
    merged["games_played"] = pd.to_numeric(merged["games_played"], errors="coerce").fillna(0)
    merged["ppg"] = pd.to_numeric(merged["ppg"], errors="coerce")
    qualified = merged[(merged["games_played"] >= min_games) & merged["ppg"].notna()]
    if qualified.empty:
        return {}

    out: dict[str, float] = {}
    for position, pos_rows in qualified.groupby("position"):
        seasons_by_player = pos_rows.groupby("player_id")["ppg"].apply(list)
        if len(seasons_by_player) < min_players:
            out[str(position)] = 1.0
            continue
        player_means = [float(np.mean(v)) for v in seasons_by_player]
        within = [float(np.var(v, ddof=1)) for v in seasons_by_player if len(v) >= 2]
        if len(within) < 2 or len(player_means) < 2:
            out[str(position)] = 1.0
            continue
        sigma2 = float(np.mean(within))
        m_bar = float(np.mean([len(v) for v in seasons_by_player]))
        # Var(observed player means) = τ² + σ²/m̄  ⇒  τ² = Var(means) − σ²/m̄.
        tau2 = max(float(np.var(player_means, ddof=1)) - sigma2 / m_bar, 0.1)
        k = sigma2 / tau2
        out[str(position)] = float(min(max(k, k_clip[0]), k_clip[1]))
    return out


def _compute_positional_starter_floor(
    history_df: pd.DataFrame,
    players_df: pd.DataFrame,
    starter_rank: int = 24,
    min_games: int = MIN_GAMES,
) -> dict[str, float]:
    """Compute the starter-floor PPG per position from historical player_stats.

    The starter floor is the PPG of the Nth-ranked player (by average PPG)
    at each position, where N defaults to 24.  Players below this floor
    are considered bench-tier and should regress more aggressively.

    Returns dict mapping position -> starter-floor PPG.
    """
    if history_df.empty or players_df.empty:
        return {}

    merged = history_df.merge(
        players_df[["player_id_ref", "position"]],
        left_on="player_id",
        right_on="player_id_ref",
        how="left",
    )

    merged["games_played"] = pd.to_numeric(merged["games_played"], errors="coerce").fillna(0)
    merged["ppg"] = pd.to_numeric(merged["ppg"], errors="coerce").fillna(0)
    qualified = merged[merged["games_played"] >= min_games]

    if qualified.empty:
        return {}

    # Average PPG per player first (across seasons), then rank within position
    player_avg = qualified.groupby(["player_id", "position"])["ppg"].mean().reset_index()

    floors: dict[str, float] = {}
    for position, pos_df in player_avg.groupby("position"):
        ranked = pos_df.sort_values("ppg", ascending=False).reset_index(drop=True)
        if len(ranked) >= starter_rank:
            # PPG of the player at the starter_rank boundary (0-indexed)
            floors[str(position)] = float(ranked.iloc[starter_rank - 1]["ppg"])
        else:
            # Fewer than starter_rank players — use the minimum
            floors[str(position)] = float(ranked["ppg"].min())

    return floors


def _build_draft_capital_lookup(supabase) -> dict[str, dict[str, int]]:
    """Fetch draft_capital and return player_id -> {season_drafted, round, overall_pick}."""
    rows = fetch_all_rows(
        supabase, "draft_capital", "player_id, season_drafted, round, overall_pick"
    )
    lookup: dict[str, dict[str, int]] = {}
    for r in rows:
        pid = r.get("player_id")
        if not pid:
            continue
        lookup[pid] = {
            "season_drafted": int(r["season_drafted"]),
            "round": int(r["round"]),
            "overall_pick": int(r["overall_pick"]),
        }
    return lookup


def _build_vegas_lines_lookup(
    supabase,
) -> tuple[dict[tuple[str, int], dict[str, float]], dict[int, float]]:
    """Fetch team_vegas_lines and return ((team, season) -> record, season -> league_mean).

    The first dict powers the implied_team_total_raw feature; the second
    is used to center each team's implied total against the league
    average for that season so the feature is comparable across years.
    """
    rows = fetch_all_rows(
        supabase, "team_vegas_lines", "team, season, implied_total, win_total"
    )
    lookup: dict[tuple[str, int], dict[str, float]] = {}
    season_totals: dict[int, list[float]] = {}
    for r in rows:
        team = r.get("team")
        season = r.get("season")
        implied = r.get("implied_total")
        if not team or season is None or implied is None:
            continue
        season_int = int(season)
        record = {
            "implied_total": float(implied),
            "win_total": float(r["win_total"]) if r.get("win_total") is not None else None,
        }
        lookup[(str(team), season_int)] = record
        season_totals.setdefault(season_int, []).append(record["implied_total"])

    league_means = {
        season: sum(totals) / len(totals)
        for season, totals in season_totals.items()
        if totals
    }
    return lookup, league_means


def _build_depth_charts_lookup(supabase) -> dict[tuple[str, int], int]:
    """Fetch depth_charts and return (player_id, season) -> depth_team (1/2/3).

    Powers the depth_chart_position_raw and role_change_raw features. Keyed by
    the *target* season — the opening-day depth is a forward-looking role signal
    set before the projected season's games, so reading the target season is
    not leakage.
    """
    rows = fetch_all_rows(supabase, "depth_charts", "player_id, season, depth_team")
    lookup: dict[tuple[str, int], int] = {}
    for r in rows:
        pid = r.get("player_id")
        season = r.get("season")
        depth = r.get("depth_team")
        if not pid or season is None or depth is None:
            continue
        lookup[(str(pid), int(season))] = int(depth)
    return lookup


_RED_ZONE_FIELDS = ("rz_carries", "rz_targets", "rz_pass_attempts", "gz_carries", "gz_targets")


def _build_red_zone_lookup(supabase) -> dict[tuple[str, int], dict[str, int]]:
    """Fetch red_zone_usage and return (player_id, season) -> RZ/GZ opportunity counts.

    Powers the weighted_xfp_redzone base feature (#671): each *historical* season's
    realized TDs are replaced with red-zone-usage-expected TDs. Keyed by the
    historical season the feature reads (never the target season), so it is a
    property of completed games — not leakage.
    """
    rows = fetch_all_rows(
        supabase, "red_zone_usage",
        "player_id, season, " + ", ".join(_RED_ZONE_FIELDS),
    )
    lookup: dict[tuple[str, int], dict[str, int]] = {}
    for r in rows:
        pid = r.get("player_id")
        season = r.get("season")
        if not pid or season is None:
            continue
        lookup[(str(pid), int(season))] = {f: int(r.get(f) or 0) for f in _RED_ZONE_FIELDS}
    return lookup


_NGS_PASSING_FIELDS = (
    "attempts",
    "completion_pct_above_expectation",
    "avg_air_yards_to_sticks",
    "aggressiveness",
    "avg_time_to_throw",
    "avg_air_yards_differential",
)


def _build_ngs_passing_lookup(supabase) -> dict[tuple[str, int], dict[str, float]]:
    """Fetch ngs_passing and return (player_id, season) -> NGS passing metrics.

    Powers the QB-only NGS features (#674): stabilized skill/process metrics
    (CPOE, air-yards-to-sticks, aggressiveness, time-to-throw, air-yards
    differential). Keyed by the historical season the feature reads (never the
    target season) — a property of completed games, so not leakage. Only the
    columns the features consume are fetched; missing values stay None.
    """
    rows = fetch_all_rows(
        supabase, "ngs_passing",
        "player_id, season, " + ", ".join(_NGS_PASSING_FIELDS),
    )
    lookup: dict[tuple[str, int], dict[str, float]] = {}
    for r in rows:
        pid = r.get("player_id")
        season = r.get("season")
        if not pid or season is None:
            continue
        lookup[(str(pid), int(season))] = {
            f: r.get(f) for f in _NGS_PASSING_FIELDS
        }
    return lookup


def _build_coaching_lookup(supabase) -> dict[tuple[str, int], dict[str, Any]]:
    """Fetch team_coaching and return (team, season) -> {changed, tenure}.

    Powers the coaching_change_raw / coach_tenure_raw features (spike #651).
    Keyed by the target season: a coaching hire completes by Jan–Feb, before
    the offseason projection run, so reading the target season's record is a
    forward-looking signal set before the season's games — not leakage.
    """
    rows = fetch_all_rows(
        supabase,
        "team_coaching",
        "team, season, head_coach_changed, coach_tenure_years",
    )
    lookup: dict[tuple[str, int], dict[str, Any]] = {}
    for r in rows:
        team = r.get("team")
        season = r.get("season")
        if not team or season is None:
            continue
        lookup[(str(team), int(season))] = {
            "head_coach_changed": r.get("head_coach_changed"),
            "coach_tenure_years": r.get("coach_tenure_years"),
        }
    return lookup


def _build_qb_ecosystem_lookups(
    supabase,
) -> tuple[dict[tuple[str, int], str], dict[tuple[str, int], str]]:
    """Build the depth-chart lookups powering the QB-ecosystem features (#642).

    Returns:
      - ``qb1_by_team``: ``(team, season) -> qb_player_id`` — each team's
        projected QB1 (position QB, lowest depth tier). Opening-day snapshot,
        set before the season's games, so reading the target season is
        forward-looking, not leakage.
      - ``player_team_by_season``: ``(player_id, season) -> team`` — the
        player's depth-chart team for that season (correct for team-changers,
        unlike ``players.nfl_team``).
    """
    rows = fetch_all_rows(
        supabase, "depth_charts", "player_id, season, team, position, depth_team"
    )
    qb_best: dict[tuple[str, int], tuple[int, str]] = {}
    player_team_by_season: dict[tuple[str, int], str] = {}
    for r in rows:
        pid = r.get("player_id")
        season = r.get("season")
        team = r.get("team")
        if not pid or season is None or not team:
            continue
        season = int(season)
        player_team_by_season[(str(pid), season)] = str(team)

        if r.get("position") == "QB" and r.get("depth_team") is not None:
            depth = int(r["depth_team"])
            key = (str(team), season)
            current = qb_best.get(key)
            if current is None or depth < current[0]:
                qb_best[key] = (depth, str(pid))

    qb1_by_team = {key: pid for key, (_, pid) in qb_best.items()}
    return qb1_by_team, player_team_by_season


def _compute_qb_quality_by_team(
    history_df: pd.DataFrame,
    qb1_by_team: dict[tuple[str, int], str],
    target_season: int,
) -> dict[tuple[str, int], float]:
    """Centered recency-weighted prior PPG of each team's projected QB1 (#642).

    For ``target_season``, computes each QB1's weighted PPG from ``history_df``
    (seasons strictly before the target — leakage-free) and centers against the
    mean across all QB1s that season, so ~0 is an average starter. Returns
    ``(team, target_season) -> centered_ppg``.
    """
    # Local import to avoid a module-level cycle through the feature registry.
    from scripts.feature_projections.features.weighted_ppg import (
        WeightedPPGNoQBTrajectoryFeature,
    )

    base = WeightedPPGNoQBTrajectoryFeature()
    raw: dict[tuple[str, int], float] = {}
    for (team, season), qb_id in qb1_by_team.items():
        if season != int(target_season):
            continue
        qb_history = history_df[history_df["player_id"] == qb_id]
        if qb_history.empty:
            continue
        ppg = base.compute(qb_id, "QB", qb_history, pd.DataFrame(), {})
        if ppg is not None:
            raw[(team, season)] = float(ppg)

    if not raw:
        return {}
    league_mean = sum(raw.values()) / len(raw)
    return {key: val - league_mean for key, val in raw.items()}


def _build_player_team_history(
    player_id: str,
    nfl_stats_all: pd.DataFrame,
) -> dict[int, str]:
    """Build a mapping of season -> team for a player from nfl_stats.recent_team.

    Returns dict like {2022: "KC", 2023: "KC", 2024: "NYJ"}.
    """
    if nfl_stats_all.empty or "recent_team" not in nfl_stats_all.columns:
        return {}

    player_rows = nfl_stats_all[nfl_stats_all["player_id"] == player_id]
    if player_rows.empty:
        return {}

    team_history: dict[int, str] = {}
    for _, row in player_rows.iterrows():
        season = int(row["season"]) if pd.notna(row.get("season")) else None
        team = row.get("recent_team")
        if season and team and pd.notna(team):
            team_history[season] = str(team)

    return team_history


def _build_context(
    player_id: str,
    position: str,
    players_df: pd.DataFrame,
    nfl_stats_all: pd.DataFrame,
    target_season: int,
    team_aggregates: dict[str, Any],
    positional_means: dict[str, float] | None = None,
    positional_starter_floors: dict[str, float] | None = None,
    qb_starters: dict[int, dict[str, str | None]] | None = None,
    draft_capital: dict[str, dict[str, int]] | None = None,
    vegas_lines: dict[tuple[str, int], dict[str, float]] | None = None,
    vegas_league_means: dict[int, float] | None = None,
    depth_charts: dict[tuple[str, int], int] | None = None,
    qb1_by_team: dict[tuple[str, int], str] | None = None,
    player_team_by_season: dict[tuple[str, int], str] | None = None,
    qb_quality: dict[tuple[str, int], float] | None = None,
    team_coaching: dict[tuple[str, int], dict[str, Any]] | None = None,
    pooling_k: dict[str, float] | None = None,
    red_zone: dict[tuple[str, int], dict[str, int]] | None = None,
    ngs_passing: dict[tuple[str, int], dict[str, float]] | None = None,
) -> dict[str, Any]:
    """Build the context dict for a player's feature computation."""
    context: dict[str, Any] = {"target_season": target_season}

    # Birth date
    player_row = players_df[players_df["player_id_ref"] == player_id]
    if not player_row.empty:
        bd = player_row.iloc[0].get("birth_date")
        if pd.notna(bd):
            context["birth_date"] = bd

    # Current team and team offense rating
    nfl_team = player_row.iloc[0].get("nfl_team") if not player_row.empty else None
    context["nfl_team"] = nfl_team

    if nfl_team and nfl_team in team_aggregates:
        team_data = team_aggregates[nfl_team]
        context["team_offense_rating"] = team_data.get("offense_rating", 0.0)
        context["team_usage"] = team_data.get("usage_by_season", {})

    # Per-season team history for team_context feature
    team_history = _build_player_team_history(player_id, nfl_stats_all)
    context["team_history"] = team_history

    # Per-team offense ratings (all teams) for historical lookups
    context["all_team_ratings"] = {
        team: data.get("offense_rating", 0.0)
        for team, data in team_aggregates.items()
    }

    # Positional mean PPG for regression-to-mean feature
    if positional_means and position in positional_means:
        context["positional_mean_ppg"] = positional_means[position]

    # Positional starter floor for tiered regression
    if positional_starter_floors and position in positional_starter_floors:
        context["positional_starter_floor"] = positional_starter_floors[position]

    # Empirical-Bayes pooling strength k_g for the partial_pooling_eb feature
    # (GH #667, L3). Per-position; falls back to the feature default if absent.
    if pooling_k and position in pooling_k:
        context["pooling_k"] = pooling_k[position]

    # Draft capital (round + overall pick) for the draft_capital_raw feature.
    if draft_capital is not None:
        record = draft_capital.get(player_id)
        if record:
            context["draft_capital"] = record

    # Vegas implied team totals for the implied_team_total_raw feature. The
    # feature looks up (effective_team, target_season); the league means let
    # it center against the season's league average to remove year-over-year
    # scoring drift.
    if vegas_lines is not None:
        context["vegas_lines"] = vegas_lines
    if vegas_league_means is not None:
        context["vegas_league_mean_implied"] = vegas_league_means

    # Opening-day depth-chart tiers (player_id, season) -> 1/2/3 for the
    # depth_chart_position_raw and role_change_raw features.
    if depth_charts is not None:
        context["depth_charts"] = depth_charts

    # Red-zone / goal-line usage (player_id, season) -> counts for the
    # weighted_xfp_redzone base feature (#671).
    if red_zone is not None:
        context["red_zone"] = red_zone

    # NGS passing (player_id, season) -> stabilized QB skill metrics for the
    # QB-only ngs_*_raw features (#674).
    if ngs_passing is not None:
        context["ngs_passing"] = ngs_passing

    # QB-ecosystem lookups for the team_qb_quality_raw / team_qb_changed_raw
    # features (#642): each team's projected QB1, the player's depth-chart team
    # per season, and the centered QB1 prior PPG keyed by (team, target_season).
    if qb1_by_team is not None:
        context["qb1_by_team"] = qb1_by_team
    if player_team_by_season is not None:
        context["player_team_by_season"] = player_team_by_season
    if qb_quality is not None:
        context["qb_quality"] = qb_quality

    # Per-team-season coaching-change signal for the coaching_change_raw /
    # coach_tenure_raw features (spike #651). The feature joins via the player's
    # depth-chart team (player_team_by_season) for team-changer safety.
    if team_coaching is not None:
        context["team_coaching"] = team_coaching

    # QB starter designation
    if qb_starters and position == "QB":
        # Check if this player is a designated starter in any historical season
        is_starter = any(
            is_qb_starter(player_id, s, qb_starters)
            for s in qb_starters
        )
        context["is_qb_starter"] = is_starter
        context["qb_starters"] = qb_starters

    return context


def _compute_team_aggregates(
    nfl_stats_all: pd.DataFrame, players_df: pd.DataFrame
) -> dict[str, Any]:
    """Compute team-level aggregates from nfl_stats for team_context and usage_share.

    Prefers nfl_stats.recent_team (historical per-season team) when available,
    falling back to players.nfl_team (current team) for backward compatibility.
    """
    if nfl_stats_all.empty or players_df.empty:
        return {}

    # Use recent_team from nfl_stats if available, otherwise fall back to players.nfl_team
    has_recent_team = "recent_team" in nfl_stats_all.columns and nfl_stats_all["recent_team"].notna().any()

    if has_recent_team:
        # Use the historical team directly from nfl_stats
        merged = nfl_stats_all.copy()
        merged["team_for_agg"] = merged["recent_team"]
    else:
        # Fall back to joining with players table (current team — legacy behavior)
        merged = nfl_stats_all.merge(
            players_df[["player_id_ref", "nfl_team"]],
            left_on="player_id",
            right_on="player_id_ref",
            how="left",
        )
        merged["team_for_agg"] = merged["nfl_team"]

    team_aggregates: dict[str, Any] = {}

    for team, team_df in merged.groupby("team_for_agg"):
        if not team or pd.isna(team):
            continue

        # Team total points per season
        season_ppg = {}
        usage_by_season: dict[int, dict[str, float]] = {}

        for season, season_df in team_df.groupby("season"):
            season = int(season)
            total_points = season_df["total_points"].fillna(0).sum()
            season_ppg[season] = float(total_points) / 17.0  # approximate team PPG

            # Aggregate usage stats per team/season
            usage_by_season[season] = {
                "targets": float(season_df["targets"].fillna(0).sum()),
                "rushing_attempts": float(season_df["rushing_attempts"].fillna(0).sum()),
            }

        # Compute offense rating: recency-weighted deviation from league average
        if season_ppg:
            avg_team_ppg = sum(season_ppg.values()) / len(season_ppg)
            team_aggregates[str(team)] = {
                "avg_ppg": avg_team_ppg,
                "offense_rating": 0.0,  # will be set after league average is computed
                "usage_by_season": usage_by_season,
            }

    # Compute league average and set offense_rating as deviation
    if team_aggregates:
        league_avg = sum(t["avg_ppg"] for t in team_aggregates.values()) / len(
            team_aggregates
        )
        for team_data in team_aggregates.values():
            team_data["offense_rating"] = team_data["avg_ppg"] - league_avg

    return team_aggregates


def run_model(
    model_name: str,
    seasons: list[int],
    max_history: int = 3,
) -> int:
    """Generate projections for a model across specified seasons.

    Returns the number of projections generated.
    """
    model_def = get_model(model_name)
    supabase = get_supabase_client()

    # Register model in DB
    model_id = _ensure_model_in_db(supabase, model_def)
    print(f"Model '{model_name}' registered with id={model_id}")

    # Compute union of all feature names across the model and any nested
    # residual base models so every layer of the residual stack can be
    # evaluated.
    all_feature_names = _collect_feature_names_recursive(model_def)

    # Instantiate all features into a dict for lookup
    feature_pool: dict[str, Any] = {}
    for fname in all_feature_names:
        if fname not in FEATURE_REGISTRY:
            print(f"Warning: feature '{fname}' not in registry, skipping")
            continue
        feature_pool[fname] = FEATURE_REGISTRY[fname]()

    if not feature_pool:
        print("No valid features found, aborting.")
        return 0

    # Load trained params for learned/residual models. Residual JSON embeds
    # the full base model under base_model_params.
    learned_params = None
    if model_def.combiner_type in {"learned", "residual"}:
        learned_params = load_model_params(model_name)
        if model_def.combiner_type == "learned":
            print(f"Loaded trained model (alpha={learned_params['alpha']}, "
                  f"features={learned_params['training_metadata']['n_features']})")
        else:
            base_md = learned_params.get("base_model_params", {}).get("training_metadata", {})
            print(f"Loaded residual model (alpha={learned_params['alpha']}, "
                  f"residual_features={learned_params['training_metadata']['n_features']}, "
                  f"base={learned_params['base_model_name']}, "
                  f"base_features={base_md.get('n_features')})")


    # Fetch players table
    players_data = fetch_all_rows(supabase, "players", "id, name, position, nfl_team, birth_date, is_college")
    players_df = pd.DataFrame(players_data)
    players_df = players_df.rename(columns={"id": "player_id_ref"})

    # Fetch draft capital once (used across all target seasons)
    draft_capital_lookup = _build_draft_capital_lookup(supabase)

    # Fetch Vegas implied team totals once (used across all target seasons)
    vegas_lookup, vegas_league_means = _build_vegas_lines_lookup(supabase)

    # Fetch opening-day depth-chart tiers once (used across all target seasons)
    depth_charts_lookup = _build_depth_charts_lookup(supabase)

    # Fetch red-zone usage once (used across all target seasons) for #671.
    red_zone_lookup = _build_red_zone_lookup(supabase)

    # Fetch NGS passing once (used across all target seasons) for #674.
    ngs_passing_lookup = _build_ngs_passing_lookup(supabase)

    # QB-ecosystem lookups for the team_qb_quality_raw / team_qb_changed_raw
    # features (#642). Global; the per-season centered QB1 PPG is computed in
    # the loop from that season's history window.
    qb1_by_team, player_team_by_season = _build_qb_ecosystem_lookups(supabase)

    # Per-team-season coaching-change signal once (spike #651).
    coaching_lookup = _build_coaching_lookup(supabase)

    # Leakage-free expected-games per (player, target season) — the #587 stage-c
    # availability haircut. Built from each player's prior-season games_played
    # (recency-weighted "history" mode); seasons strictly before the target only.
    # Stored as projected_games so consumers can compute availability-inclusive
    # production without disturbing the rate projection (or its significance gate).
    pos_map = dict(zip(players_df["player_id_ref"], players_df["position"]))
    games_stats = fetch_all_rows(supabase, "player_stats", "player_id, games_played, season")
    expected_games = build_expected_games(games_stats, pos_map, seasons, "history")
    print(f"Expected-games (history) estimates: {len(expected_games)} (player, season)")

    total_records = 0

    for target_season in seasons:
        historical_seasons = list(range(target_season - max_history, target_season))
        print(f"\nGenerating {target_season} projections using history from {historical_seasons}...")

        # Fetch historical player_stats
        history_df = fetch_multi_season_stats(historical_seasons)
        if history_df.empty:
            print(f"  No historical player_stats data for {historical_seasons}")
            continue

        # Fetch historical nfl_stats (paginated — a multi-season window exceeds
        # the 1000-row cap and truncation corrupts team aggregates; GH #562).
        nfl_stats_all = fetch_multi_season_nfl_stats(historical_seasons)
        for col in ["total_points", "games_played", "targets", "rushing_attempts",
                     "passing_yards", "passing_tds", "interceptions", "rushing_yards",
                     "rushing_tds", "receptions", "receiving_yards", "receiving_tds",
                     "offense_snaps", "passing_attempts", "completions"]:
            if col in nfl_stats_all.columns:
                nfl_stats_all[col] = pd.to_numeric(nfl_stats_all[col], errors="coerce").fillna(0)
        if "season" in nfl_stats_all.columns:
            nfl_stats_all["season"] = pd.to_numeric(nfl_stats_all["season"], errors="coerce")

        # Compute team aggregates
        team_aggregates = _compute_team_aggregates(nfl_stats_all, players_df)

        # Compute positional mean PPG for regression-to-mean feature
        positional_means = _compute_positional_mean_ppg(history_df, players_df)

        # Compute positional starter floors for tiered regression
        positional_starter_floors = _compute_positional_starter_floor(history_df, players_df)

        # Empirical-Bayes pooling strength per position (#667, L3).
        pooling_k = _compute_pooling_k(history_df, players_df)

        # Centered QB1 prior PPG per team for this target season (#642).
        qb_quality = _compute_qb_quality_by_team(history_df, qb1_by_team, target_season)

        # Load QB starter designations for historical + target seasons
        qb_starters = get_all_starter_ids(
            historical_seasons + [target_season], players_df
        )

        # Generate projections for each player
        records = []
        for player_id, player_history in history_df.groupby("player_id"):
            player_id_str = str(player_id)

            # Look up position
            player_row = players_df[players_df["player_id_ref"] == player_id_str]
            if player_row.empty:
                continue
            position = player_row.iloc[0]["position"]
            if not position:
                continue

            # Get player's nfl_stats
            player_nfl = nfl_stats_all[nfl_stats_all["player_id"] == player_id_str] if not nfl_stats_all.empty else pd.DataFrame()

            # Build context
            context = _build_context(
                player_id_str, position, players_df, nfl_stats_all,
                target_season, team_aggregates, positional_means,
                positional_starter_floors, qb_starters,
                draft_capital=draft_capital_lookup,
                vegas_lines=vegas_lookup,
                vegas_league_means=vegas_league_means,
                depth_charts=depth_charts_lookup,
                qb1_by_team=qb1_by_team,
                player_team_by_season=player_team_by_season,
                qb_quality=qb_quality,
                team_coaching=coaching_lookup,
                pooling_k=pooling_k,
                red_zone=red_zone_lookup,
                ngs_passing=ngs_passing_lookup,
            )

            # Resolve position-specific features. For residual models, the
            # union of every nested base layer's features is computed so the
            # full residual stack can be evaluated without re-loading anything.
            effective_features, effective_weights = _resolve_features_for_position(
                model_def, position
            )
            base_eff = _resolve_residual_base_features(model_def, position)
            if base_eff:
                effective_features = list(
                    dict.fromkeys(list(base_eff) + list(effective_features))
                )
            player_feature_instances = [
                feature_pool[f] for f in effective_features if f in feature_pool
            ]

            # Run combiner
            if model_def.combiner_type == "residual" and learned_params is not None:
                projected_ppg, feature_values = combine_features_residual(
                    player_feature_instances,
                    player_id_str,
                    position,
                    player_history,
                    player_nfl,
                    context,
                    learned_params,
                    effective_weights or None,
                )
            elif learned_params is not None:
                projected_ppg, feature_values = combine_features_learned(
                    player_feature_instances,
                    player_id_str,
                    position,
                    player_history,
                    player_nfl,
                    context,
                    learned_params,
                    effective_weights or None,
                )
            else:
                projected_ppg, feature_values = combine_features(
                    player_feature_instances,
                    player_id_str,
                    position,
                    player_history,
                    player_nfl,
                    context,
                    effective_weights or None,
                )

            if projected_ppg is not None:
                eg = expected_games.get((player_id_str, target_season))
                records.append({
                    "model_id": model_id,
                    "player_id": player_id_str,
                    "season": target_season,
                    "projected_ppg": round(float(projected_ppg), 4),
                    "projected_games": round(float(eg), 2) if eg is not None else None,
                    "feature_values": json.dumps(
                        {k: round(v, 4) if v is not None else None for k, v in feature_values.items()}
                    ),
                })

        if not records:
            print(f"  No projections generated for {target_season}")
            continue

        print(f"  Generated {len(records)} projections for {target_season}")

        # Batch upsert
        batch_size = 500
        for i in range(0, len(records), batch_size):
            batch = records[i : i + batch_size]
            supabase.table("model_projections").upsert(
                batch, on_conflict="model_id,player_id,season"
            ).execute()
            print(f"    Upserted batch {i // batch_size + 1} ({len(batch)} records)")

        total_records += len(records)

    print(f"\nTotal: {total_records} projections generated for model '{model_name}'")
    return total_records
