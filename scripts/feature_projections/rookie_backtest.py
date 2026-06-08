"""Leave-one-season-out backtest for the rookie (0-NFL-history) projection path.

Drafted rookies are projected by ``RookieDraftCapitalPPG`` in the
``update_projections`` fallback path. The standard feature_projections
backtest (``backtest.py``) *excludes* true rookies on purpose — the rookie
path is shared across every model, so including it only adds correlated noise
to cross-model comparisons. That left the rookie path itself unvalidated.

This harness validates it on its own terms. For each holdout season it fits
on rookies drafted *strictly earlier* (leakage-safe) and scores that season's
rookie class against their actual year-1 PPG. Three candidate rookie models
are compared head-to-head:

  - ``flat_mean``     — position-mean year-1 PPG (the pre-#483 fallback)
  - ``tier_lookup``   — empirical mean year-1 PPG by (position, draft tier)
  - ``draft_capital`` — pooled per-position log-pick line shrunk to a prior (#483)

LIMITATION — *conditional on playing.* An "actual" year-1 PPG only exists for
rookies who played >= ``MIN_GAMES``, so every model here is graded on
``E[PPG | drafted at pick p AND played]``. Drafted busts who never see the
field are absent from both training and test. Treat the metrics as relative
(model-vs-model) signal and a calibration check, **not** an unconditional
accuracy claim. Removing this bias (a two-stage play-probability × conditional
-PPG model) is the natural next step this harness is meant to enable.

Output: a markdown report (default ``docs/generated/rookie-backtest.md``).
This script only reads from the database; it writes no projections.
"""

from __future__ import annotations

import argparse
import math
from collections import defaultdict
from typing import Callable, Dict, List, Optional, Tuple

from scripts.config import get_supabase_client, fetch_all_rows, MIN_GAMES
from scripts.analysis_utils import fetch_multi_season_stats
from scripts.projection_methods import RookieDraftCapitalPPG

# player_stats history floor — a rookie drafted before this has no stats row,
# so we never fetch below it (mirrors update_projections.EARLIEST_STATS_SEASON).
EARLIEST_STATS_SEASON = 2019

# Draft-pick tiers used by the tier_lookup model and the calibration table.
# (lo, hi) inclusive over overall pick; the last tier absorbs everything else.
TIERS: List[Tuple[int, int]] = [(1, 16), (17, 48), (49, 100), (101, 257)]

# Candidate model identifiers, in display order.
MODEL_NAMES = ["flat_mean", "tier_lookup", "draft_capital"]

# A fitted rookie model: predict(position, overall_pick) -> ppg or None.
Predictor = Callable[[str, int], Optional[float]]

# A rookie sample: keyed on the player's known draft (rookie) season.
RookieSample = Dict[str, object]  # {player_id, position, pick, season, ppg}


def _tier_label(lo: int, hi: int) -> str:
    return f"{lo}-{hi}" if hi < TIERS[-1][1] else f"{lo}+"


def _tier_for(pick: int) -> Optional[Tuple[int, int]]:
    for lo, hi in TIERS:
        if lo <= pick <= hi:
            return (lo, hi)
    return None


def fetch_rookie_samples(min_games: int = MIN_GAMES) -> List[RookieSample]:
    """Build (player_id, position, pick, season, ppg) rookie-year samples.

    A sample is a drafted player's ``season_drafted`` season — keyed on the
    known draft year rather than a "single season in window" heuristic, so a
    player's later seasons never disqualify their rookie row. Kickers and
    samples below ``min_games`` are dropped, matching the production fit.
    """
    supabase = get_supabase_client()
    players = fetch_all_rows(supabase, "players", "id, position")
    pos_map = {r["id"]: r["position"] for r in players}
    draft = fetch_all_rows(
        supabase, "draft_capital", "player_id, overall_pick, season_drafted"
    )
    pick_by_player = {
        r["player_id"]: int(r["overall_pick"])
        for r in draft
        if r.get("overall_pick") is not None
    }
    season_drafted = {
        r["player_id"]: int(r["season_drafted"])
        for r in draft
        if r.get("season_drafted") is not None
    }
    if not pick_by_player or not season_drafted:
        return []

    seasons = sorted(set(season_drafted.values()))
    # Rookies drafted before EARLIEST_STATS_SEASON have no stats row to score.
    low = max(min(seasons), EARLIEST_STATS_SEASON)
    stats_df = fetch_multi_season_stats(list(range(low, max(seasons) + 1)))
    if stats_df.empty:
        return []

    samples: List[RookieSample] = []
    for player_id, group in stats_df.groupby("player_id"):
        pid = str(player_id)
        pick = pick_by_player.get(pid)
        drafted = season_drafted.get(pid)
        pos = pos_map.get(pid)
        if not pick or pick <= 0 or drafted is None or not pos or pos == "K":
            continue
        rookie_rows = group[group["season"] == drafted]
        if rookie_rows.empty:
            continue
        row = rookie_rows.iloc[0]
        if int(row["games_played"]) < min_games:
            continue
        samples.append({
            "player_id": pid,
            "position": pos,
            "pick": int(pick),
            "season": int(drafted),
            "ppg": float(row["ppg"]),
        })
    return samples


# ---------------------------------------------------------------------------
# Candidate rookie models. Each fitter takes training samples and returns a
# predict(position, pick) closure. All three see identical training data.
# ---------------------------------------------------------------------------

def _position_means(train: List[RookieSample]) -> Dict[str, float]:
    by_pos: Dict[str, List[float]] = defaultdict(list)
    for s in train:
        by_pos[str(s["position"])].append(float(s["ppg"]))
    return {p: sum(v) / len(v) for p, v in by_pos.items() if v}


def fit_flat_mean(train: List[RookieSample]) -> Predictor:
    """Position-mean year-1 PPG — ignores draft pick (the pre-#483 baseline)."""
    means = _position_means(train)
    return lambda position, pick: means.get(position)


def fit_tier_lookup(train: List[RookieSample]) -> Predictor:
    """Empirical mean year-1 PPG by (position, draft tier); the issue's Option 1."""
    by_tier: Dict[Tuple[str, Tuple[int, int]], List[float]] = defaultdict(list)
    for s in train:
        tier = _tier_for(int(s["pick"]))
        if tier is not None:
            by_tier[(str(s["position"]), tier)].append(float(s["ppg"]))
    tier_means = {k: sum(v) / len(v) for k, v in by_tier.items() if v}
    pos_means = _position_means(train)

    def predict(position: str, pick: int) -> Optional[float]:
        tier = _tier_for(int(pick))
        if tier is not None and (position, tier) in tier_means:
            return tier_means[(position, tier)]
        return pos_means.get(position)

    return predict


def fit_draft_capital(train: List[RookieSample]) -> Predictor:
    """Pooled per-position log-pick line shrunk toward a prior (the #483 model)."""
    pairs = [(str(s["position"]), int(s["pick"]), float(s["ppg"])) for s in train]
    method = RookieDraftCapitalPPG(
        RookieDraftCapitalPPG.fit(pairs), _position_means(train)
    )
    return lambda position, pick: method.project_ppg(
        [], position=position, overall_pick=pick
    )


MODEL_FITTERS: Dict[str, Callable[[List[RookieSample]], Predictor]] = {
    "flat_mean": fit_flat_mean,
    "tier_lookup": fit_tier_lookup,
    "draft_capital": fit_draft_capital,
}


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def compute_metrics(pairs: List[Tuple[float, float]]) -> Dict[str, Optional[float]]:
    """MAE, RMSE, Bias (actual - predicted), and n from (predicted, actual) pairs."""
    n = len(pairs)
    if n == 0:
        return {"mae": None, "rmse": None, "bias": None, "n": 0}
    errors = [a - p for p, a in pairs]
    mae = sum(abs(e) for e in errors) / n
    rmse = math.sqrt(sum(e * e for e in errors) / n)
    bias = sum(errors) / n
    return {"mae": round(mae, 3), "rmse": round(rmse, 3), "bias": round(bias, 3), "n": n}


def run_backtest(
    samples: List[RookieSample],
    holdout_seasons: List[int],
    min_games: int = MIN_GAMES,
) -> Dict:
    """Leave-one-season-out backtest of every candidate model.

    Returns ``{"accuracy": {model: {position|"ALL": metrics}},
    "calibration": {(position, tier_label): {"actual": m, model: m, ...}}}``.
    """
    # Paired (predicted, actual) accumulators.
    acc: Dict[str, Dict[str, List[Tuple[float, float]]]] = {
        m: defaultdict(list) for m in MODEL_NAMES
    }
    # Calibration: per (position, tier) collect actuals + each model's predictions.
    calib: Dict[Tuple[str, str], Dict[str, List[float]]] = defaultdict(
        lambda: defaultdict(list)
    )

    for season in holdout_seasons:
        train = [s for s in samples if int(s["season"]) < season]
        test = [s for s in samples if int(s["season"]) == season]
        if not train or not test:
            continue
        predictors = {m: MODEL_FITTERS[m](train) for m in MODEL_NAMES}
        for s in test:
            pos = str(s["position"])
            pick = int(s["pick"])
            actual = float(s["ppg"])
            tier = _tier_for(pick)
            tier_label = _tier_label(*tier) if tier else "other"
            calib[(pos, tier_label)]["actual"].append(actual)
            for m in MODEL_NAMES:
                pred = predictors[m](pos, pick)
                if pred is None:
                    continue
                acc[m][pos].append((pred, actual))
                acc[m]["ALL"].append((pred, actual))
                calib[(pos, tier_label)][m].append(pred)

    accuracy = {
        m: {key: compute_metrics(pairs) for key, pairs in by_key.items()}
        for m, by_key in acc.items()
    }
    calibration = {}
    for key, by_model in calib.items():
        entry: Dict[str, object] = {
            "n": len(by_model["actual"]),
            "actual": round(sum(by_model["actual"]) / len(by_model["actual"]), 2)
            if by_model["actual"] else None,
        }
        for m in MODEL_NAMES:
            vals = by_model.get(m, [])
            entry[m] = round(sum(vals) / len(vals), 2) if vals else None
        calibration[key] = entry
    return {"accuracy": accuracy, "calibration": calibration}


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def _best_model(accuracy: Dict, key: str, metric: str = "mae") -> Optional[str]:
    best, best_val = None, None
    for m in MODEL_NAMES:
        val = accuracy.get(m, {}).get(key, {}).get(metric)
        if val is None:
            continue
        if best_val is None or val < best_val:
            best, best_val = m, val
    return best


def render_markdown(
    results: Dict, holdout_seasons: List[int], min_games: int
) -> str:
    accuracy = results["accuracy"]
    calibration = results["calibration"]
    positions = ["ALL", "QB", "RB", "WR", "TE"]
    lines: List[str] = []
    lines.append("# Rookie Projection Backtest")
    lines.append("")
    lines.append(
        "Leave-one-season-out backtest of the rookie (0-NFL-history) draft-capital "
        "projection path. Generated by `scripts/feature_projections/rookie_backtest.py` "
        "(`just rookie-backtest`)."
    )
    lines.append("")
    lines.append(
        f"- **Holdout seasons:** {', '.join(str(s) for s in holdout_seasons)} "
        f"(each fit on rookies drafted strictly earlier)"
    )
    lines.append(f"- **Min games filter:** {min_games}")
    lines.append("")
    lines.append(
        "> **Conditional on playing.** Actuals exist only for rookies who played "
        f"≥ {min_games} games, so all models are graded on `E[PPG | pick AND played]`. "
        "Drafted busts who never played are absent from training and test alike. "
        "Read these as relative model-vs-model + calibration signal, not an "
        "unconditional accuracy claim."
    )
    lines.append("")

    # Accuracy table (lower MAE/RMSE better; bias near 0 better).
    lines.append("## Accuracy (MAE / RMSE / Bias, pooled across holdout seasons)")
    lines.append("")
    header = "| Position | n | " + " | ".join(
        f"{m} MAE" for m in MODEL_NAMES
    ) + " | Best (MAE) |"
    lines.append(header)
    lines.append("|" + "---|" * (len(MODEL_NAMES) + 3))
    for pos in positions:
        # n is identical across models for a position (same test set); read draft_capital.
        n = accuracy.get("draft_capital", {}).get(pos, {}).get("n") or 0
        if not n:
            continue
        cells = []
        for m in MODEL_NAMES:
            mae = accuracy.get(m, {}).get(pos, {}).get("mae")
            cells.append("—" if mae is None else f"{mae:.2f}")
        best = _best_model(accuracy, pos) or "—"
        lines.append(f"| {pos} | {n} | " + " | ".join(cells) + f" | **{best}** |")
    lines.append("")

    # Full metric detail per position.
    lines.append("### Detail")
    lines.append("")
    for pos in positions:
        n = accuracy.get("draft_capital", {}).get(pos, {}).get("n") or 0
        if not n:
            continue
        lines.append(f"**{pos}** (n={n})")
        lines.append("")
        lines.append("| Model | MAE | RMSE | Bias |")
        lines.append("|---|---|---|---|")
        for m in MODEL_NAMES:
            mt = accuracy.get(m, {}).get(pos, {})
            mae = mt.get("mae")
            if mae is None:
                continue
            lines.append(
                f"| {m} | {mae:.2f} | {mt.get('rmse'):.2f} | {mt.get('bias'):+.2f} |"
            )
        lines.append("")

    # Calibration: predicted mean vs actual mean per (position, tier).
    lines.append("## Calibration (mean predicted vs mean actual, by draft tier)")
    lines.append("")
    lines.append(
        "Predicted means should track the actual column. Large gaps reveal "
        "systematic over/under-projection for a tier."
    )
    lines.append("")
    lines.append(
        "| Position | Tier | n | actual | " + " | ".join(MODEL_NAMES) + " |"
    )
    lines.append("|" + "---|" * (len(MODEL_NAMES) + 4))
    for pos in ["QB", "RB", "WR", "TE"]:
        for lo, hi in TIERS:
            label = _tier_label(lo, hi)
            entry = calibration.get((pos, label))
            if not entry or not entry.get("n"):
                continue
            actual = entry.get("actual")
            cells = []
            for m in MODEL_NAMES:
                v = entry.get(m)
                cells.append("—" if v is None else f"{v:.2f}")
            actual_s = "—" if actual is None else f"{actual:.2f}"
            lines.append(
                f"| {pos} | {label} | {entry['n']} | {actual_s} | "
                + " | ".join(cells) + " |"
            )
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--seasons", default="2022,2023,2024,2025",
        help="Comma-separated holdout seasons (each fit on rookies drafted earlier).",
    )
    parser.add_argument("--min-games", type=int, default=MIN_GAMES)
    parser.add_argument(
        "--output", default="docs/generated/rookie-backtest.md",
        help="Markdown report path. Pass '-' to print to stdout only.",
    )
    args = parser.parse_args()

    holdout_seasons = [int(s) for s in args.seasons.split(",") if s.strip()]
    samples = fetch_rookie_samples(min_games=args.min_games)
    print(f"Collected {len(samples)} rookie-year samples.")
    results = run_backtest(samples, holdout_seasons, min_games=args.min_games)
    report = render_markdown(results, holdout_seasons, args.min_games)

    # Console summary.
    acc = results["accuracy"]
    print("\nOverall MAE by model:")
    for m in MODEL_NAMES:
        mae = acc.get(m, {}).get("ALL", {}).get("mae")
        print(f"  {m:<14} MAE={mae}")
    print(f"  Best (ALL): {_best_model(acc, 'ALL')}")

    if args.output != "-":
        with open(args.output, "w") as f:
            f.write(report)
        print(f"\nWrote report to {args.output}")


if __name__ == "__main__":
    main()
