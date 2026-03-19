"""Projection runner: generates projections for a model and upserts to DB."""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import pandas as pd

# Setup paths
script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

from config import get_supabase_client, MIN_GAMES
from analysis_utils import fetch_multi_season_stats
from scripts.feature_projections.features import FEATURE_REGISTRY
from scripts.feature_projections.model_config import ModelDefinition, PositionOverride, get_model
from scripts.feature_projections.combiner import combine_features


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

    # Compute union of all feature names (default + all overrides)
    all_feature_names = set(model_def.features)
    for override in model_def.position_overrides.values():
        all_feature_names.update(override.features)

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

    # Fetch players table
    players_res = supabase.table("players").select("id, position, nfl_team, birth_date, is_college").execute()
    players_df = pd.DataFrame(players_res.data or [])
    players_df = players_df.rename(columns={"id": "player_id_ref"})

    total_records = 0

    for target_season in seasons:
        historical_seasons = list(range(target_season - max_history, target_season))
        print(f"\nGenerating {target_season} projections using history from {historical_seasons}...")

        # Fetch historical player_stats
        history_df = fetch_multi_season_stats(historical_seasons)
        if history_df.empty:
            print(f"  No historical player_stats data for {historical_seasons}")
            continue

        # Fetch historical nfl_stats
        nfl_stats_res = (
            supabase.table("nfl_stats")
            .select("*")
            .in_("season", historical_seasons)
            .execute()
        )
        nfl_stats_all = pd.DataFrame(nfl_stats_res.data or [])
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
            )

            # Resolve position-specific features
            effective_features, effective_weights = _resolve_features_for_position(
                model_def, position
            )
            player_feature_instances = [
                feature_pool[f] for f in effective_features if f in feature_pool
            ]

            # Run combiner
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
                records.append({
                    "model_id": model_id,
                    "player_id": player_id_str,
                    "season": target_season,
                    "projected_ppg": round(float(projected_ppg), 4),
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
