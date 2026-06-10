"""Held-out evaluation of every projection model on a clean window (GH #572).

Finding 1 of the methodology audit
(docs/exec-plans/projection-methodology-audit.md) showed that learned/residual
models (v20–v31) are trained on the same seasons the standard backtest scores
them on, so their headline MAE is in-sample. This script re-ranks the whole
model history on a *shared held-out window* where every model — additive,
learned, residual, external — is judged out-of-sample on the same untouched
seasons.

Design:
- Learned/residual models are **retrained on the training window only**
  (default 2021–2023) and then predict the eval seasons (default 2024–2025)
  in memory. Their coefficients never see the eval seasons.
- Retraining writes to a temporary directory and monkeypatches
  ``learned_combiner.TRAINED_MODELS_DIR`` for the duration of the run, so the
  production ``trained_models/*.json`` files and ``model_projections`` table are
  never touched. Residual models load their (also-held-out) base from the temp
  dir, so the whole stack is clean.
- Additive and external (FantasyPros) models are parameter-free w.r.t. our
  training seasons — a model's projection for 2024 depends only on 2021–2023
  history — so their existing ``model_projections`` rows are already the
  held-out values and are read straight from the DB.
- Every model is then scored through the **identical** filter used by
  ``backtest_model``: target-season games ≥ MIN_GAMES and true rookies excluded.

Usage:
    venv/bin/python scripts/feature_projections/holdout_eval.py \
        --train-seasons 2021,2022,2023 --eval-seasons 2024,2025 \
        --output docs/generated/projection-holdout-eval.md
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd

from scripts.config import get_supabase_client, fetch_all_rows, POSITIONS, MIN_GAMES
from scripts.feature_projections import learned_combiner
from scripts.feature_projections.learned_combiner import predict, predict_residual
from scripts.feature_projections.model_config import MODELS, get_model
from scripts.feature_projections.backtest import (
    _compute_metrics,
    _fetch_season_rows,
)

repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _dependency_order(model_names: list[str]) -> list[str]:
    """Order learned/residual models so a residual's base is trained first."""
    ordered: list[str] = []
    remaining = list(model_names)
    # Iterate until every model lands after its base (bases are also in the set).
    guard = 0
    while remaining and guard < 1000:
        guard += 1
        for name in list(remaining):
            base = get_model(name).base_model_name
            if base is None or base in ordered or base not in model_names:
                ordered.append(name)
                remaining.remove(name)
    ordered.extend(remaining)  # any cycle/leftover — shouldn't happen
    return ordered


def _build_actuals_and_rookies(
    supabase, season: int, all_stats: list[dict], min_games: int
) -> tuple[dict[str, float], set]:
    """Return (actual PPG by player for qualifying non-rookies, had_prior_stats set).

    Mirrors backtest_model exactly: a player counts only if they cleared
    min_games this season AND had ≥1 game in some prior season (excludes true
    rookies, whose projection path is shared across models).
    """
    actuals_rows = _fetch_season_rows(
        supabase, "player_stats", "player_id, ppg, games_played", season
    )
    had_prior: set = {
        r["player_id"]
        for r in all_stats
        if r.get("season") is not None
        and int(r["season"]) < int(season)
        and (r.get("games_played") or 0) > 0
    }
    actuals: dict[str, float] = {}
    for r in actuals_rows:
        if int(r.get("games_played", 0) or 0) < min_games:
            continue
        if r["player_id"] not in had_prior:
            continue
        if r.get("ppg") is None:
            continue
        actuals[r["player_id"]] = float(r["ppg"])
    return actuals, had_prior


def _metrics_from_preds(
    preds: dict[str, float],
    actuals: dict[str, float],
    pos_map: dict[str, str],
) -> dict[str, dict]:
    """Compute ALL + per-position metrics for one model on one season."""
    all_proj: list[float] = []
    all_act: list[float] = []
    by_pos: dict[str, tuple[list[float], list[float]]] = {p: ([], []) for p in POSITIONS}

    for pid, actual in actuals.items():
        if pid not in preds:
            continue
        p = preds[pid]
        all_proj.append(p)
        all_act.append(actual)
        pos = pos_map.get(pid)
        if pos in by_pos:
            by_pos[pos][0].append(p)
            by_pos[pos][1].append(actual)

    out = {"ALL": _compute_metrics(all_proj, all_act)}
    for pos in POSITIONS:
        proj, act = by_pos[pos]
        if proj:
            out[pos] = _compute_metrics(proj, act)
    return out


def _learned_preds_for_eval(
    model_name: str,
    train_seasons: list[int],
    eval_seasons: list[int],
    temp_dir: Path,
) -> dict[int, dict[str, float]]:
    """Retrain a learned/residual model on train_seasons; predict eval_seasons.

    Returns {season: {player_id: predicted_ppg}}. Saves the held-out params to
    temp_dir so dependent residual models can load this as their base.
    """
    # Imported here so the monkeypatched TRAINED_MODELS_DIR is in effect when
    # train_ridge_residual calls load_model_params.
    from scripts.feature_projections.train_model import (
        collect_training_data,
        train_ridge_loso,
        train_ridge_residual,
    )

    model_def = get_model(model_name)
    td = collect_training_data(model_name, train_seasons + eval_seasons)
    if td.empty:
        print(f"  {model_name}: no training data, skipping")
        return {}

    train_df = td[td["season"].isin(train_seasons)]
    if train_df.empty:
        print(f"  {model_name}: no rows in training window {train_seasons}, skipping")
        return {}

    is_residual = model_def.combiner_type == "residual"
    if is_residual:
        params = train_ridge_residual(
            train_df,
            base_model_name=model_def.base_model_name,
            residual_features=model_def.features,
            interaction_terms=model_def.interaction_terms,
            training_filter=model_def.training_filter,
        )
    else:
        params = train_ridge_loso(train_df, model_def.interaction_terms)

    # Persist so a dependent residual can use this held-out model as its base.
    (temp_dir / f"{model_name}.json").write_text(json.dumps(params))

    preds_by_season: dict[int, dict[str, float]] = {}
    for season in eval_seasons:
        rows = td[td["season"] == season]
        season_preds: dict[str, float] = {}
        for _, r in rows.iterrows():
            fv = r["feature_values"]
            pos = r["position"]
            pred = (
                predict_residual(fv, pos, params)
                if is_residual
                else predict(fv, pos, params)
            )
            if pred is not None:
                season_preds[str(r["player_id"])] = float(pred)
        preds_by_season[season] = season_preds
    return preds_by_season


def _db_preds_for_eval(
    supabase, model_id: int, eval_seasons: list[int]
) -> dict[int, dict[str, float]]:
    """Read existing model_projections (already held-out for parameter-free models)."""
    out: dict[int, dict[str, float]] = {}
    for season in eval_seasons:
        rows = _fetch_season_rows(
            supabase,
            "model_projections",
            "player_id, projected_ppg",
            season,
            extra_eq=("model_id", model_id),
        )
        out[season] = {
            r["player_id"]: float(r["projected_ppg"])
            for r in rows
            if r.get("projected_ppg") is not None
        }
    return out


def _combined_metrics(
    model_preds: dict[int, dict[str, float]],
    actuals_by_season: dict[int, dict[str, float]],
    pos_map: dict[str, str],
) -> dict[str, dict]:
    """Combined ALL + per-position metrics for one model, POOLED across seasons.

    R² is not a weighted average of per-season R² (each season's R² uses its own
    actual-variance denominator), so pooling the raw (pred, actual) pairs and
    computing one R²/MAE/RMSE over the pooled set is the only correct combine
    (GH #576, Finding 5). MAE/bias/RMSE happen to be identical to the old
    N-weighted aggregate; R² is the one that was wrong.
    """
    buckets: dict[str, tuple[list[float], list[float]]] = {
        p: ([], []) for p in ["ALL"] + list(POSITIONS)
    }
    for season, actuals in actuals_by_season.items():
        sp = model_preds.get(season, {})
        for pid, actual in actuals.items():
            if pid not in sp:
                continue
            pred = sp[pid]
            buckets["ALL"][0].append(pred)
            buckets["ALL"][1].append(actual)
            pos = pos_map.get(pid)
            if pos in buckets:
                buckets[pos][0].append(pred)
                buckets[pos][1].append(actual)
    out: dict[str, dict] = {}
    for pos, (proj, act) in buckets.items():
        if proj:
            out[pos] = _compute_metrics(proj, act)
    return out


def _fmt(val, fmt: str) -> str:
    if val is None:
        return "—"
    try:
        return format(val, fmt)
    except (ValueError, TypeError):
        return str(val)


# Positions used for the balanced MAE. K is excluded: it is essentially random
# (R² < 0 for every model) and not all models project it (FantasyPros has none),
# so including it would add noise and break cross-model comparability.
BALANCED_POSITIONS = ("QB", "RB", "WR", "TE")


def _balanced_mae(pos_metrics: dict[str, dict]) -> Optional[float]:
    """Position-balanced MAE: unweighted mean of per-position MAE (GH #577).

    The pooled `ALL` MAE weights positions by how many cleared the games filter,
    a mix that drifts season to season and lets a model look better just by
    having more easy (low-MAE) players in the qualifier pool. Averaging the
    per-position MAEs with equal weight over a fixed position set
    (`BALANCED_POSITIONS`) neutralises that.
    """
    maes = [
        pos_metrics[p]["mae"]
        for p in BALANCED_POSITIONS
        if p in pos_metrics and pos_metrics[p].get("mae") is not None
    ]
    return sum(maes) / len(maes) if maes else None


def gather_predictions(
    train_seasons: list[int],
    eval_seasons: list[int],
    only_models: Optional[list[str]] = None,
) -> tuple[dict[str, dict[int, dict[str, float]]], dict[int, dict[str, float]], dict[str, str]]:
    """Produce held-out predictions for every model on the eval seasons.

    Returns (preds, actuals_by_season, pos_map) where
    preds = {model_name: {season: {player_id: predicted_ppg}}}. Learned/residual
    models are retrained on train_seasons in a sandboxed temp dir; parameter-free
    models are read from their already-held-out model_projections. This is the
    shared machinery behind both the held-out report and the significance test.
    """
    supabase = get_supabase_client()

    players_data = fetch_all_rows(supabase, "players", "id, position")
    pos_map = {row["id"]: row["position"] for row in players_data}
    all_stats = fetch_all_rows(supabase, "player_stats", "player_id, games_played, season")

    # Shared actuals + rookie filter per eval season — identical for every model.
    actuals_by_season: dict[int, dict[str, float]] = {}
    for season in eval_seasons:
        actuals, _ = _build_actuals_and_rookies(supabase, season, all_stats, MIN_GAMES)
        actuals_by_season[season] = actuals
        print(f"Eval season {season}: {len(actuals)} qualifying non-rookie players")

    model_names = list(MODELS.keys()) if only_models is None else only_models
    learned = [m for m in model_names if get_model(m).combiner_type in ("learned", "residual")]
    others = [m for m in model_names if m not in learned]

    preds: dict[str, dict[int, dict[str, float]]] = {}

    # --- Parameter-free models: read held-out projections from the DB ---
    for model_name in others:
        res = supabase.table("projection_models").select("id").eq("name", model_name).execute()
        if not res.data:
            continue
        model_id = res.data[0]["id"]
        preds[model_name] = _db_preds_for_eval(supabase, model_id, eval_seasons)

    # --- Learned/residual models: retrain on the held-out window in a temp dir ---
    temp_dir = Path(tempfile.mkdtemp(prefix="holdout_models_"))
    orig_dir = learned_combiner.TRAINED_MODELS_DIR
    learned_combiner.TRAINED_MODELS_DIR = temp_dir
    try:
        for model_name in _dependency_order(learned):
            print(f"\n=== Held-out retrain: {model_name} (train {train_seasons}) ===")
            preds_by_season = _learned_preds_for_eval(
                model_name, train_seasons, eval_seasons, temp_dir
            )
            if preds_by_season:
                preds[model_name] = preds_by_season
    finally:
        learned_combiner.TRAINED_MODELS_DIR = orig_dir
        shutil.rmtree(temp_dir, ignore_errors=True)

    return preds, actuals_by_season, pos_map


def _restrict_to_common_players(
    preds: dict[str, dict[int, dict[str, float]]],
    actuals_by_season: dict[int, dict[str, float]],
) -> dict[int, dict[str, float]]:
    """Intersect actuals down to players EVERY model projected, per season.

    Matched-sample mode (Finding 4): the ALL ranking is only apples-to-apples if
    all models are scored on the same players. FantasyPros projects a smaller,
    more-fantasy-relevant set than the internal models, so the default report's
    ALL rows aren't on a common sample. Restricting to the intersection (≈ FP's
    set) makes the comparison fair, at the cost of a smaller N.
    """
    matched: dict[int, dict[str, float]] = {}
    for season, actuals in actuals_by_season.items():
        common = set(actuals.keys())
        for model_preds in preds.values():
            common &= set(model_preds.get(season, {}).keys())
        matched[season] = {pid: actuals[pid] for pid in common}
    return matched


def run(
    train_seasons: list[int],
    eval_seasons: list[int],
    only_models: Optional[list[str]] = None,
    matched: bool = False,
) -> str:
    preds, actuals_by_season, pos_map = gather_predictions(
        train_seasons, eval_seasons, only_models
    )

    if matched:
        actuals_by_season = _restrict_to_common_players(preds, actuals_by_season)
        for s in eval_seasons:
            print(f"Matched-sample season {s}: {len(actuals_by_season[s])} common players")

    # Per-season metrics (for the per-season tables).
    results: dict[str, dict[int, dict[str, dict]]] = {
        model_name: {
            s: _metrics_from_preds(model_preds.get(s, {}), actuals_by_season[s], pos_map)
            for s in eval_seasons
        }
        for model_name, model_preds in preds.items()
    }
    # Combined metrics pooled across seasons (proper R² — see _combined_metrics).
    combined: dict[str, dict[str, dict]] = {
        model_name: _combined_metrics(model_preds, actuals_by_season, pos_map)
        for model_name, model_preds in preds.items()
    }

    return _render(results, combined, train_seasons, eval_seasons, matched=matched)


def _render(
    results: dict[str, dict[int, dict[str, dict]]],
    combined: dict[str, dict[str, dict]],
    train_seasons: list[int],
    eval_seasons: list[int],
    matched: bool = False,
) -> str:
    metric_cols = [("mae", "MAE", ".3f"), ("bias", "Bias", "+.3f"),
                   ("r_squared", "R²", ".3f"), ("rmse", "RMSE", ".3f"),
                   ("player_count", "N", "d")]
    report_positions = ["ALL"] + list(POSITIONS)

    lines: list[str] = []
    title_suffix = " — matched-sample (common players only)" if matched else ""
    lines.append(f"# Projection Held-Out Evaluation (GH #572){title_suffix}\n")
    lines.append(f"_Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}_\n")
    if matched:
        lines.append(
            "**Matched-sample mode (Finding 4):** every model is scored on the *same* players "
            "— the intersection of players all evaluated models projected, per season. This makes "
            "the FantasyPros comparison apples-to-apples (FP projects a smaller, more-available "
            "set), at the cost of a smaller N. Run without `--matched` for the full-coverage report.\n"
        )
    lines.append(
        f"**Every model is evaluated out-of-sample on a shared held-out window.** "
        f"Learned/residual models were retrained on **{','.join(map(str, train_seasons))}** "
        f"and never saw the eval seasons **{','.join(map(str, eval_seasons))}**; additive and "
        f"external models are parameter-free w.r.t. training seasons, so their existing "
        f"projections are already held-out. All models are scored through the identical "
        f"`backtest_model` filter (target-season games ≥ {MIN_GAMES}, true rookies excluded). "
        f"Unlike [projection-accuracy.md](projection-accuracy.md), **no model here is scored "
        f"on data it trained on** — this is the honest ranking. See "
        f"[docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md) "
        f"(Finding 1b).\n"
    )

    # --- Ranking by combined ALL MAE ---
    lines.append("## Ranking — combined held-out ALL (lower MAE = better)\n")
    lines.append(
        "_**MAE** is the pooled-over-players ALL error. **Bal MAE** is the position-balanced "
        "MAE — the unweighted mean of the per-position MAEs over a fixed set (QB/RB/WR/TE; K "
        "excluded as essentially random and not projected by every model) — which neutralises the "
        "drifting position mix of the qualifier pool (GH #577). They can disagree: a model can win "
        "the pooled MAE while losing the balanced one if it's strong only where players are easy/"
        "plentiful._\n"
    )
    lines.append("| Rank | Model | MAE | Bal MAE | Bias | R² | RMSE | N |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
    ranked = sorted(
        (m for m in combined if combined[m].get("ALL") and combined[m]["ALL"].get("mae") is not None),
        key=lambda m: combined[m]["ALL"]["mae"],
    )
    best_mae = combined[ranked[0]]["ALL"]["mae"] if ranked else None
    best_bal = min(
        (b for b in (_balanced_mae(combined[m]) for m in ranked) if b is not None),
        default=None,
    )
    for i, model_name in enumerate(ranked, 1):
        row = combined[model_name]["ALL"]
        mae_str = _fmt(row["mae"], ".3f")
        if best_mae is not None and row["mae"] == best_mae:
            mae_str = f"**{mae_str}**"
        bal = _balanced_mae(combined[model_name])
        bal_str = _fmt(bal, ".3f")
        if best_bal is not None and bal == best_bal:
            bal_str = f"**{bal_str}**"
        lines.append(
            f"| {i} | `{model_name}` | {mae_str} | {bal_str} | {_fmt(row['bias'], '+.3f')} "
            f"| {_fmt(row['r_squared'], '.3f')} | {_fmt(row['rmse'], '.3f')} "
            f"| {_fmt(row['player_count'], 'd')} |"
        )
    lines.append("")

    # --- Combined per-position tables ---
    lines.append("## Combined across eval seasons — by position\n")
    for pos in report_positions:
        lines.append(f"### {pos}\n")
        lines.append("| Model | " + " | ".join(n for _, n, _ in metric_cols) + " |")
        lines.append("| " + " | ".join(["---"] * (len(metric_cols) + 1)) + " |")
        # Sort each position table by MAE for readability.
        pos_models = sorted(
            (m for m in combined if combined[m].get(pos) and combined[m][pos].get("mae") is not None),
            key=lambda m: combined[m][pos]["mae"],
        )
        for model_name in pos_models:
            row = combined[model_name][pos]
            cells = [_fmt(row.get(k), fmt) for k, _, fmt in metric_cols]
            lines.append(f"| `{model_name}` | " + " | ".join(cells) + " |")
        lines.append("")

    # --- Per-season ALL ---
    for season in eval_seasons:
        lines.append(f"## Season {season} — ALL (held-out)\n")
        lines.append("| Model | " + " | ".join(n for _, n, _ in metric_cols) + " |")
        lines.append("| " + " | ".join(["---"] * (len(metric_cols) + 1)) + " |")
        season_models = sorted(
            (m for m in results if results[m].get(season, {}).get("ALL", {}).get("mae") is not None),
            key=lambda m: results[m][season]["ALL"]["mae"],
        )
        for model_name in season_models:
            row = results[model_name][season]["ALL"]
            cells = [_fmt(row.get(k), fmt) for k, _, fmt in metric_cols]
            lines.append(f"| `{model_name}` | " + " | ".join(cells) + " |")
        lines.append("")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Held-out evaluation of all projection models (#572)")
    parser.add_argument("--train-seasons", default="2021,2022,2023",
                        help="Comma-separated training seasons (must precede eval seasons)")
    parser.add_argument("--eval-seasons", default="2024,2025",
                        help="Comma-separated held-out evaluation seasons")
    parser.add_argument("--models", default=None,
                        help="Optional comma-separated subset of models (default: all)")
    parser.add_argument("--matched", action="store_true",
                        help="Matched-sample mode: score all models on the common player set "
                             "(apples-to-apples FantasyPros comparison, #575). Writes to a "
                             "-matched output path unless --output is given.")
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    train_seasons = [int(s) for s in args.train_seasons.split(",")]
    eval_seasons = [int(s) for s in args.eval_seasons.split(",")]
    if set(train_seasons) & set(eval_seasons):
        parser.error("train-seasons and eval-seasons must not overlap")
    if max(train_seasons) >= min(eval_seasons):
        parser.error("all train-seasons must precede all eval-seasons (no future leakage)")

    only_models = [m.strip() for m in args.models.split(",")] if args.models else None

    output = args.output or os.path.join(
        repo_root, "docs", "generated",
        "projection-holdout-eval-matched.md" if args.matched else "projection-holdout-eval.md",
    )

    table = run(train_seasons, eval_seasons, only_models, matched=args.matched)

    os.makedirs(os.path.dirname(output), exist_ok=True)
    with open(output, "w") as f:
        f.write(table)
    print(f"\nReport written to: {output}")
    print("\n" + "=" * 80)
    print(table)


if __name__ == "__main__":
    main()
