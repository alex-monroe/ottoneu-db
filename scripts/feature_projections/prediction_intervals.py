"""Empirical prediction intervals for player projections (GH: projection uncertainty bands).

The point model gives a single projected PPG per player. This module attaches an
empirical uncertainty band around it, derived from the model's own *held-out*
residuals (actual − projected PPG) on the rolling-origin protocol — the same
leakage-free source the ranking gate uses (GH #594).

Approach — segment-conditional empirical residual quantiles:

  * Bin held-out residuals by segment: position × projected-PPG tier. Both
    conditioning variables are known at projection time (the tier is a function of
    the point projection itself), so the fitted band can be applied to new
    projections without peeking at actuals.
  * For an 80% interval, take the p10 and p90 of the residual distribution within
    each segment. A player's band is ``[pred + lo_offset, pred + hi_offset]``,
    clamped at 0. Heteroscedasticity is captured for free: volatile segments
    (thin tiers, high-variance positions) get wider bands than stable veterans.
  * Thin segments (< ``min_bin`` residuals) fall back to the position-wide
    residual quantiles so a sparse tier never produces a degenerate band.

The honest gate is *coverage*: an 80% band must contain the actual value ~80% of
the time on data the quantiles were **not** fit on. ``coverage_report`` fits on
all-but-the-last eval season and confirms coverage on the held-out last season,
mirroring the confirmation discipline in the methodology audit.

Usage:
    venv/bin/python scripts/feature_projections/prediction_intervals.py \
        --eval-seasons 2023,2024,2025 --min-train-season 2021
    venv/bin/python scripts/feature_projections/prediction_intervals.py \
        --output-json scripts/feature_projections/data/interval_quantiles.json \
        --output-report docs/generated/projection-intervals.md
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import numpy as np

from scripts.feature_projections.holdout_eval import (
    gather_predictions_rolling,
    rolling_folds,
)

# Positions that get intervals. K is essentially random (R² < 0 for every model)
# so a band there is noise; it's excluded from the calibration just like the
# balanced MAE excludes it (holdout_eval.BALANCED_POSITIONS).
INTERVAL_POSITIONS = ("QB", "RB", "WR", "TE")

DEFAULT_INTERVAL_PCT = 80
DEFAULT_N_TIERS = 4
DEFAULT_MIN_BIN = 30


@dataclass(frozen=True)
class Record:
    position: str
    pred: float
    actual: float

    @property
    def residual(self) -> float:
        return self.actual - self.pred


def _quantiles_for_pct(interval_pct: int) -> tuple[float, float]:
    """(lo_q, hi_q) for a centered interval, e.g. 80 -> (0.10, 0.90)."""
    tail = (100 - interval_pct) / 200.0
    return tail, 1.0 - tail


def gather_residuals(
    model: str,
    eval_seasons: list[int],
    min_train_season: int,
    use_cache: bool = True,
) -> list[Record]:
    """Held-out (position, pred, actual) records for one model, rolling-origin."""
    folds = rolling_folds(eval_seasons, min_train_season)
    preds, actuals_by_season, pos_map, _ = gather_predictions_rolling(
        folds, only_models=[model], use_cache=use_cache
    )
    model_preds = preds.get(model, {})
    records: list[Record] = []
    for season, actuals in actuals_by_season.items():
        season_preds = model_preds.get(season, {})
        for pid, actual in actuals.items():
            pred = season_preds.get(pid)
            if pred is None:
                continue
            pos = pos_map.get(pid)
            if pos not in INTERVAL_POSITIONS:
                continue
            records.append(Record(position=pos, pred=float(pred), actual=float(actual)))
    return records


def _tier_edges(preds: list[float], n_tiers: int) -> list[float]:
    """Interior quantile edges of predicted PPG (n_tiers-1 cut points)."""
    if len(preds) < n_tiers or n_tiers < 2:
        return []
    qs = [i / n_tiers for i in range(1, n_tiers)]
    return [float(v) for v in np.quantile(preds, qs)]


def _assign_tier(pred: float, edges: list[float]) -> int:
    """Tier index for a prediction given interior edges (0..len(edges))."""
    lo = 0
    for edge in edges:
        if pred <= edge:
            return lo
        lo += 1
    return lo


def fit_calibration(
    records: list[Record],
    interval_pct: int = DEFAULT_INTERVAL_PCT,
    n_tiers: int = DEFAULT_N_TIERS,
    min_bin: int = DEFAULT_MIN_BIN,
) -> dict:
    """Fit the segment → (lo_offset, hi_offset) residual-quantile table.

    Returns a JSON-serializable calibration object keyed by position, each with
    tier edges (to map a new projection to its tier at apply time), per-tier
    offsets, and a position-wide fallback for thin tiers.
    """
    lo_q, hi_q = _quantiles_for_pct(interval_pct)
    positions: dict[str, dict] = {}
    for pos in INTERVAL_POSITIONS:
        pos_recs = [r for r in records if r.position == pos]
        if len(pos_recs) < min_bin:
            continue
        pos_resids = np.array([r.residual for r in pos_recs])
        fallback = [float(np.quantile(pos_resids, lo_q)), float(np.quantile(pos_resids, hi_q))]

        edges = _tier_edges([r.pred for r in pos_recs], n_tiers)
        n_bins = len(edges) + 1
        tiers: list[list[float]] = []
        for tier in range(n_bins):
            tier_resids = np.array(
                [r.residual for r in pos_recs if _assign_tier(r.pred, edges) == tier]
            )
            if len(tier_resids) < min_bin:
                tiers.append(fallback)  # thin tier → position-wide band
            else:
                tiers.append(
                    [float(np.quantile(tier_resids, lo_q)), float(np.quantile(tier_resids, hi_q))]
                )
        positions[pos] = {"tier_edges": edges, "tiers": tiers, "fallback": fallback}

    return {
        "interval_pct": interval_pct,
        "lo_q": lo_q,
        "hi_q": hi_q,
        "n_tiers": n_tiers,
        "min_bin": min_bin,
        "positions": positions,
    }


def apply_interval(
    pred: float, position: str, calibration: dict
) -> tuple[Optional[float], Optional[float]]:
    """Return (low, high) band for a projection, or (None, None) if uncalibrated.

    Low is clamped at 0 (PPG can't be negative); the band is always ordered.
    """
    pos_cal = calibration.get("positions", {}).get(position)
    if pos_cal is None:
        return None, None
    tier = _assign_tier(pred, pos_cal["tier_edges"])
    lo_off, hi_off = pos_cal["tiers"][tier]
    low = max(0.0, pred + lo_off)
    high = max(low, pred + hi_off)
    return round(low, 3), round(high, 3)


def _coverage_from_split(fit_records: list[Record], confirm_records: list[Record], **kw) -> dict:
    """Honest coverage: fit the band on `fit_records`, confirm on unseen `confirm_records`.

    Returns {position: {"coverage": frac, "n": int}, "ALL": {...}} — the fraction
    of held-out actuals that landed inside a band the quantiles never saw.
    """
    cal = fit_calibration(fit_records, **kw)
    buckets: dict[str, list[int]] = {p: [] for p in ("ALL",) + INTERVAL_POSITIONS}
    for r in confirm_records:
        low, high = apply_interval(r.pred, r.position, cal)
        if low is None:
            continue
        inside = int(low <= r.actual <= high)
        buckets["ALL"].append(inside)
        buckets[r.position].append(inside)
    out: dict[str, dict] = {}
    for pos, hits in buckets.items():
        if hits:
            out[pos] = {"coverage": sum(hits) / len(hits), "n": len(hits)}
    return out


def _gather_by_season(
    model: str, eval_seasons: list[int], min_train_season: int, use_cache: bool
) -> dict[int, list[Record]]:
    """Held-out records grouped by eval season (for the fit/confirm split)."""
    folds = rolling_folds(eval_seasons, min_train_season)
    preds, actuals_by_season, pos_map, _ = gather_predictions_rolling(
        folds, only_models=[model], use_cache=use_cache
    )
    model_preds = preds.get(model, {})
    by_season: dict[int, list[Record]] = {}
    for season, actuals in actuals_by_season.items():
        recs: list[Record] = []
        season_preds = model_preds.get(season, {})
        for pid, actual in actuals.items():
            pred = season_preds.get(pid)
            if pred is None:
                continue
            pos = pos_map.get(pid)
            if pos not in INTERVAL_POSITIONS:
                continue
            recs.append(Record(position=pos, pred=float(pred), actual=float(actual)))
        by_season[season] = recs
    return by_season


DEFAULT_CALIBRATION_PATH = os.path.join(
    os.path.dirname(__file__), "data", "interval_quantiles.json"
)


def load_calibration(path: str = DEFAULT_CALIBRATION_PATH) -> Optional[dict]:
    """Load the checked-in production calibration, or None if absent."""
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def apply_to_model_projections(
    model: str,
    seasons: list[int],
    calibration_path: str = DEFAULT_CALIBRATION_PATH,
) -> int:
    """Attach projected_ppg_low/high to a model's stored model_projections rows.

    Reads the fitted calibration artifact and writes bands back onto the rows the
    active model just generated. Called between projection and promotion so the
    bands ride along into player_projections. Returns rows updated.

    If the calibration was fitted on a *different* model than `model`, the bands
    are skipped (logged) — a band is only honest for the model whose residuals
    produced it.
    """
    from scripts.config import get_supabase_client, fetch_all_rows

    calibration = load_calibration(calibration_path)
    if calibration is None:
        print(f"No interval calibration at {calibration_path}; skipping bands.")
        return 0
    if calibration.get("model") and calibration["model"] != model:
        print(
            f"Calibration was fit on '{calibration['model']}' but active model is "
            f"'{model}'; skipping bands (re-run `just interval-calibration`)."
        )
        return 0

    supabase = get_supabase_client()
    model_res = (
        supabase.table("projection_models").select("id").eq("name", model).execute()
    )
    if not model_res.data:
        raise ValueError(f"Model '{model}' not found in projection_models")
    model_id = model_res.data[0]["id"]

    players = fetch_all_rows(supabase, "players", "id, position")
    pos_map = {p["id"]: p["position"] for p in players}

    rows = fetch_all_rows(
        supabase,
        "model_projections",
        "id, model_id, player_id, season, projected_ppg, projected_games",
        filters=[("eq", "model_id", model_id), ("in_", "season", seasons)],
    )

    records = []
    for row in rows:
        pos = pos_map.get(row["player_id"])
        low, high = apply_interval(float(row["projected_ppg"]), pos, calibration)
        records.append({**row, "projected_ppg_low": low, "projected_ppg_high": high})

    banded = sum(1 for r in records if r["projected_ppg_low"] is not None)
    print(f"Applying interval bands to {banded}/{len(records)} model_projections rows...")
    batch_size = 500
    for i in range(0, len(records), batch_size):
        supabase.table("model_projections").upsert(
            records[i : i + batch_size], on_conflict="id"
        ).execute()
    return banded


def _render_report(model: str, cal: dict, coverage: dict, eval_seasons: list[int], confirm_season: int) -> str:
    lines = [
        "# Projection Prediction Intervals",
        "",
        f"_Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · model `{model}`_",
        "",
        f"Empirical {cal['interval_pct']}% intervals from held-out rolling-origin residuals "
        f"(eval {', '.join(map(str, sorted(set(eval_seasons))))}). Segment = position × "
        f"projected-PPG tier (n={cal['n_tiers']}); thin tiers (< {cal['min_bin']}) fall back to "
        "the position-wide residual band.",
        "",
        "## Held-out coverage (fit on earlier seasons, confirm on last)",
        "",
        f"Nominal coverage: **{cal['interval_pct']}%**. Confirm season: **{confirm_season}**.",
        "",
        "| Position | Coverage | N |",
        "| --- | --- | --- |",
    ]
    for pos in ("ALL",) + INTERVAL_POSITIONS:
        c = coverage.get(pos)
        if c:
            lines.append(f"| {pos} | {c['coverage'] * 100:.1f}% | {c['n']} |")
    lines += ["", "## Fitted band offsets (production calibration, all eval seasons)", ""]
    for pos in INTERVAL_POSITIONS:
        pc = cal["positions"].get(pos)
        if not pc:
            continue
        lines.append(f"### {pos}")
        lines.append("")
        lines.append("| Tier (proj PPG) | Low offset | High offset |")
        lines.append("| --- | --- | --- |")
        edges = pc["tier_edges"]
        for tier, (lo, hi) in enumerate(pc["tiers"]):
            if not edges:
                label = "all"
            elif tier == 0:
                label = f"≤ {edges[0]:.1f}"
            elif tier == len(edges):
                label = f"> {edges[-1]:.1f}"
            else:
                label = f"{edges[tier - 1]:.1f}–{edges[tier]:.1f}"
            lines.append(f"| {label} | {lo:+.2f} | {hi:+.2f} |")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", default=None, help="Model name (default: active model)")
    ap.add_argument("--eval-seasons", default="2023,2024,2025")
    ap.add_argument("--min-train-season", type=int, default=2021)
    ap.add_argument("--interval-pct", type=int, default=DEFAULT_INTERVAL_PCT)
    ap.add_argument("--n-tiers", type=int, default=DEFAULT_N_TIERS)
    ap.add_argument("--min-bin", type=int, default=DEFAULT_MIN_BIN)
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--output-json", default=None, help="Write production calibration JSON here")
    ap.add_argument("--output-report", default=None, help="Write markdown coverage report here")
    args = ap.parse_args()

    # Lazy import avoids a circular import with update_projections (which imports
    # apply_to_model_projections from this module).
    from scripts.update_projections import get_active_model_name

    model = args.model or get_active_model_name()
    eval_seasons = [int(s) for s in args.eval_seasons.split(",")]
    kw = dict(interval_pct=args.interval_pct, n_tiers=args.n_tiers, min_bin=args.min_bin)

    print(f"Gathering held-out residuals for '{model}' (eval {eval_seasons})...")
    by_season = _gather_by_season(model, eval_seasons, args.min_train_season, not args.no_cache)
    all_records = [r for recs in by_season.values() for r in recs]
    print(f"  {len(all_records)} held-out player-seasons across {len(by_season)} seasons")

    # Honest coverage: fit on all-but-last, confirm on last.
    seasons = sorted(by_season.keys())
    confirm_season = seasons[-1]
    fit_records = [r for s in seasons[:-1] for r in by_season[s]]
    confirm_records = by_season[confirm_season]
    coverage = _coverage_from_split(fit_records, confirm_records, **kw)

    # Production calibration: fit on all eval seasons.
    cal = fit_calibration(all_records, **kw)
    cal["model"] = model
    cal["eval_seasons"] = seasons
    cal["generated_at"] = datetime.now(timezone.utc).isoformat()

    print(f"\nHeld-out coverage (nominal {args.interval_pct}%, confirm season {confirm_season}):")
    for pos in ("ALL",) + INTERVAL_POSITIONS:
        c = coverage.get(pos)
        if c:
            print(f"  {pos:<4} {c['coverage'] * 100:5.1f}%  (n={c['n']})")

    if args.output_json:
        os.makedirs(os.path.dirname(args.output_json), exist_ok=True)
        with open(args.output_json, "w") as f:
            json.dump(cal, f, indent=2)
        print(f"\nWrote calibration → {args.output_json}")
    if args.output_report:
        os.makedirs(os.path.dirname(args.output_report), exist_ok=True)
        with open(args.output_report, "w") as f:
            f.write(_render_report(model, cal, coverage, eval_seasons, confirm_season))
        print(f"Wrote report → {args.output_report}")


if __name__ == "__main__":
    main()
