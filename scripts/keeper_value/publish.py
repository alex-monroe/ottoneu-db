"""Fit the keeper outlook and write ``keeper_outlook`` (``just keeper-publish``).

For each season N and as-of week w, the model is fitted only on seasons whose
next-season outcome was known before N+1 (rows N' ≤ N−1), the same
out-of-fold rule as the backtest. That keeps a historical snapshot honest for
/trades: a 2024 trade is judged by what a model could have known in 2024.

Weeks published: ``AS_OF_WEEKS`` for completed seasons. For the season in
progress, every listed week already played plus the newest week with games, so
the trade builder always reads the latest data.

Usage:
    just keeper-publish                      # the current season, latest week
    just keeper-publish --backfill           # every season from BACKFILL_FROM
    just keeper-publish --seasons 2025 --dry-run
"""

from __future__ import annotations

import argparse
from collections import defaultdict

import numpy as np
import pandas as pd

from scripts.config import fetch_all_rows, get_supabase_client
from scripts.keeper_value import dataset
from scripts.keeper_value.model import GRID, KeeperModel, summary_quantiles
from scripts.name_utils import normalize_player_name

MODEL_VERSION = "keeper_v1"
AS_OF_WEEKS = (0, 3, 6, 9, 12, 15, 18)
# Trade history (both sources) reaches back to 2023; a little earlier is cheap.
BACKFILL_FROM = 2021
PUBLISHED_GRID = (np.arange(20) + 0.5) / 20
BATCH = 500


def weeks_for(data: dataset.SeasonData, season: int) -> list[int]:
    played = data.games.loc[data.games["season"] == season, "week"]
    if played.empty:
        return [0]
    latest = int(played.max())
    if season <= data.complete_through:
        return list(AS_OF_WEEKS)
    return sorted({w for w in AS_OF_WEEKS if w <= latest} | {latest})


def player_index(supabase) -> tuple[dict[tuple[str, str], str], dict[str, list[str]]]:
    """Our players by (normalized name, position), and by name alone."""
    rows = fetch_all_rows(supabase, "players", "id, name, position, is_college")
    by_pos: dict[tuple[str, str], str] = {}
    by_name: dict[str, list[str]] = defaultdict(list)
    for r in rows:
        if r.get("is_college"):
            continue
        norm = normalize_player_name(r["name"])
        by_pos.setdefault((norm, r.get("position") or ""), r["id"])
        by_name[norm].append(r["id"])
    return by_pos, by_name


def match(name: str, position: str, by_pos, by_name) -> str | None:
    norm = normalize_player_name(name)
    if (norm, position) in by_pos:
        return by_pos[(norm, position)]
    ids = by_name.get(norm, [])
    return ids[0] if len(ids) == 1 else None


def outlook_rows(model: KeeperModel, rows: pd.DataFrame) -> pd.DataFrame:
    q = model.predict_quantiles(rows)
    published = np.vstack([np.interp(PUBLISHED_GRID, GRID, r) for r in q])
    summary = summary_quantiles(q)
    out = rows[["player_id", "name", "position", "season", "as_of_week", "years",
                "draft_bucket", "career_games"]].copy()
    out["own_weight"] = model.weights(rows)
    out["value_quantiles"] = [np.round(r, 2).tolist() for r in published]
    out["mean_value"] = q.mean(axis=1)
    out["p10"], out["p50"], out["p90"] = summary[:, 0], summary[:, 1], summary[:, 2]
    out["fit_through"] = model.fit_through
    return out


def build(data: dataset.SeasonData, seasons: list[int]) -> pd.DataFrame:
    first = data.first_season + 1
    fitted: dict[tuple[int, int], KeeperModel] = {}
    frames = []
    for season in seasons:
        cutoff = min(season - 1, data.complete_through - 1)
        for week in weeks_for(data, season):
            key = (cutoff, week)
            if key not in fitted:
                panel = dataset.build_panel(data, list(range(first, cutoff + 1)), week)
                fitted[key] = KeeperModel.fit(panel[panel["latent_next"].notna()])
            rows = dataset.build_rows(data, season, week)
            if rows.empty:
                continue
            frames.append(outlook_rows(fitted[key], rows))
            print(f"  {season} week {week}: {len(rows)} players (fit through {cutoff})")
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seasons", type=int, nargs="+")
    ap.add_argument("--backfill", action="store_true", help=f"every season from {BACKFILL_FROM}")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    from scripts.season import stats_season

    current = stats_season()
    seasons = args.seasons or (list(range(BACKFILL_FROM, current + 1)) if args.backfill else [current])
    data = dataset.load(current)
    out = build(data, seasons)
    if out.empty:
        print("Nothing to publish.")
        return

    supabase = get_supabase_client()
    by_pos, by_name = player_index(supabase)
    out["db_id"] = [match(n, p, by_pos, by_name) for n, p in zip(out["name"], out["position"])]
    matched = out.dropna(subset=["db_id"])
    print(f"Matched {matched['player_id'].nunique()} of {out['player_id'].nunique()} players to `players`.")

    records = [{
        "player_id": r.db_id,
        "season": int(r.season),
        "as_of_week": int(r.as_of_week),
        "value_season": int(r.season) + 1,
        "position": r.position,
        "years_in_league": int(r.years),
        "draft_bucket": r.draft_bucket,
        "career_games": int(r.career_games),
        "own_weight": round(float(r.own_weight), 4),
        "value_quantiles": r.value_quantiles,
        "mean_value": round(float(r.mean_value), 2),
        "p10": round(float(r.p10), 2),
        "p50": round(float(r.p50), 2),
        "p90": round(float(r.p90), 2),
        "fit_through": int(r.fit_through),
        "model_version": MODEL_VERSION,
    } for r in matched.itertuples()]
    # Two nflverse players can normalise to one of ours; keep the first.
    seen, unique = set(), []
    for rec in records:
        k = (rec["player_id"], rec["season"], rec["as_of_week"])
        if k not in seen:
            seen.add(k)
            unique.append(rec)

    if args.dry_run:
        top = matched.sort_values("mean_value", ascending=False).head(10)
        print(top[["name", "position", "season", "as_of_week", "years", "own_weight", "p10", "p50", "p90", "mean_value"]])
        print(f"[dry run] would upsert {len(unique)} rows")
        return
    for i in range(0, len(unique), BATCH):
        supabase.table("keeper_outlook").upsert(
            unique[i:i + BATCH], on_conflict="player_id,season,as_of_week",
        ).execute()
    print(f"Upserted {len(unique)} keeper_outlook rows.")


if __name__ == "__main__":
    main()
