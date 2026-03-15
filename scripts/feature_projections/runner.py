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
from scripts.feature_projections.model_config import ModelDefinition, get_model
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
                "config": json.dumps({"weights": model_def.weights}),
                "is_baseline": model_def.is_baseline,
                "is_active": False,
            }
        )
        .execute()
    )
    return result.data[0]["id"]


def _build_context(
    player_id: str,
    position: str,
    players_df: pd.DataFrame,
    nfl_stats_all: pd.DataFrame,
    target_season: int,
    team_aggregates: dict[str, Any],
) -> dict[str, Any]:
    """Build the context dict for a player's feature computation."""
    context: dict[str, Any] = {"target_season": target_season}

    # Birth date
    player_row = players_df[players_df["player_id_ref"] == player_id]
    if not player_row.empty:
        bd = player_row.iloc[0].get("birth_date")
        if pd.notna(bd):
            context["birth_date"] = bd

    # Team offense rating and usage
    nfl_team = player_row.iloc[0].get("nfl_team") if not player_row.empty else None
    if nfl_team and nfl_team in team_aggregates:
        team_data = team_aggregates[nfl_team]
        context["team_offense_rating"] = team_data.get("offense_rating", 0.0)
        context["team_usage"] = team_data.get("usage_by_season", {})

    return context


def _compute_team_aggregates(
    nfl_stats_all: pd.DataFrame, players_df: pd.DataFrame
) -> dict[str, Any]:
    """Compute team-level aggregates from nfl_stats for team_context and usage_share."""
    if nfl_stats_all.empty or players_df.empty:
        return {}

    # Join nfl_stats with players to get nfl_team
    merged = nfl_stats_all.merge(
        players_df[["player_id_ref", "nfl_team"]],
        left_on="player_id",
        right_on="player_id_ref",
        how="left",
    )

    team_aggregates: dict[str, Any] = {}

    for nfl_team, team_df in merged.groupby("nfl_team"):
        if not nfl_team or pd.isna(nfl_team):
            continue

        # Team total points per season
        season_ppg = {}
        usage_by_season: dict[int, dict[str, float]] = {}

        for season, season_df in team_df.groupby("season"):
            season = int(season)
            total_points = season_df["total_points"].fillna(0).sum()
            season_ppg[season] = float(total_points) / 17.0  # approximate team PPG

            # Aggregate usage stats
            usage_by_season[season] = {
                "targets": float(season_df["targets"].fillna(0).sum()),
                "rushing_attempts": float(season_df["rushing_attempts"].fillna(0).sum()),
                "passing_yards": float(season_df["passing_yards"].fillna(0).sum()),
            }

        # Compute offense rating: recency-weighted deviation from league average
        if season_ppg:
            avg_team_ppg = sum(season_ppg.values()) / len(season_ppg)
            # Simple deviation (will be compared to league-wide average in context)
            team_aggregates[str(nfl_team)] = {
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

    # Instantiate features
    feature_instances = []
    for fname in model_def.features:
        if fname not in FEATURE_REGISTRY:
            print(f"Warning: feature '{fname}' not in registry, skipping")
            continue
        feature_instances.append(FEATURE_REGISTRY[fname]())

    if not feature_instances:
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
                     "offense_snaps"]:
            if col in nfl_stats_all.columns:
                nfl_stats_all[col] = pd.to_numeric(nfl_stats_all[col], errors="coerce").fillna(0)
        if "season" in nfl_stats_all.columns:
            nfl_stats_all["season"] = pd.to_numeric(nfl_stats_all["season"], errors="coerce")

        # Compute team aggregates
        team_aggregates = _compute_team_aggregates(nfl_stats_all, players_df)

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
                target_season, team_aggregates,
            )

            # Run combiner
            projected_ppg, feature_values = combine_features(
                feature_instances,
                player_id_str,
                position,
                player_history,
                player_nfl,
                context,
                model_def.weights or None,
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
