"""Availability-inclusive backtest (GH #574, Finding 3).

The standard backtest (`backtest.py`) only scores players who cleared
`MIN_GAMES` (=4) in the target season. That silently deletes the injured,
benched, and bust seasons from the actuals — inflating every model's apparent
accuracy and making the availability error budget (the motivation for the
injury-model work, #384) impossible to measure.

This parallel evaluation keeps those players. For each qualifying player-season
it scores a model's PPG projection against two targets:

- **Rate** — actual PPG (the standard target), but on the *inclusive*
  population (games ≥ 1). Measures pure per-game accuracy.
- **Availability-inclusive** — production per *scheduled* game,
  `ppg × min(games, 17) / 17`. A player who played 4 games at 15 PPG scores
  ~3.5 here, not 15: missed games count as zero production. A pure-rate PPG
  projection is penalised for players who miss time — which is exactly the
  availability error no current feature models.

The gap between the two (avail-MAE − rate-MAE) is the **availability error
budget**: error attributable purely to playing-time loss that better
rate-projection cannot fix.

Leakage note: this reads stored `model_projections`, so by default it only
includes **parameter-free** models (additive + external FantasyPros), whose
stored projections are leakage-free. Learned/residual models' stored
projections are in-sample (see #571); pass `--include-learned` to add them, but
treat their rows as a rough diagnostic, not a clean ranking. The availability
budget itself is model-agnostic.

Usage:
    venv/bin/python scripts/feature_projections/availability_backtest.py \
        --seasons 2022,2023,2024,2025 \
        --output docs/generated/projection-availability-eval.md
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime

from scripts.config import get_supabase_client, fetch_all_rows, POSITIONS
from scripts.feature_projections.backtest import (
    TOP_N_BY_POSITION,
    _compute_metrics,
    _fetch_season_rows,
    rank_metrics,
)
from scripts.feature_projections.model_config import MODELS, get_model

repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# NFL regular-season length (17 games since 2021). The eval seasons here are all
# 2021+, so a single constant is correct; revisit if older seasons are added.
GAMES_FULL_SEASON = 17

# Minimum games to be *included* (vs the standard backtest's MIN_GAMES=4). 1 keeps
# anyone who took the field at all; the point is to stop hiding partial seasons.
MIN_INCLUDE_GAMES = 1


def _build_availability_actuals(
    supabase, season: int, all_stats: list[dict]
) -> dict[str, dict]:
    """Per-player rate + availability-inclusive actuals for non-rookies.

    Returns {player_id: {"ppg": float, "avail": float, "games": int}}.
    Mirrors backtest_model's rookie exclusion (≥1 prior-season game) but uses
    MIN_INCLUDE_GAMES instead of MIN_GAMES so partial seasons are retained.
    """
    rows = _fetch_season_rows(
        supabase, "player_stats", "player_id, ppg, games_played", season
    )
    had_prior: set = {
        r["player_id"]
        for r in all_stats
        if r.get("season") is not None
        and int(r["season"]) < int(season)
        and (r.get("games_played") or 0) > 0
    }
    out: dict[str, dict] = {}
    for r in rows:
        games = int(r.get("games_played", 0) or 0)
        if games < MIN_INCLUDE_GAMES:
            continue
        if r["player_id"] not in had_prior:
            continue
        if r.get("ppg") is None:
            continue
        ppg = float(r["ppg"])
        avail = ppg * min(games, GAMES_FULL_SEASON) / GAMES_FULL_SEASON
        out[r["player_id"]] = {"ppg": ppg, "avail": avail, "games": games}
    return out


def _combined_avail_metrics(
    preds_by_season: dict[int, dict[str, float]],
    actuals_by_season: dict[int, dict[str, dict]],
    pos_map: dict[str, str],
) -> dict:
    """Rate + availability metrics (ALL + per position), POOLED across seasons.

    Pools the raw (pred, actual) pairs across seasons before computing each
    metric. This is required for a correct combined R² — R² is not a weighted
    average of per-season R² (GH #576, Finding 5). MAE/bias/RMSE are unchanged
    vs an N-weighted aggregate; R² is the one that was wrong. Returns
    {"rate": {pos: metrics}, "avail": {pos: metrics}, "mean_games": float}.
    """
    targets = {"rate": "ppg", "avail": "avail"}
    buckets: dict[str, dict[str, tuple[list, list]]] = {
        t: {p: ([], []) for p in ["ALL"] + list(POSITIONS)} for t in targets
    }
    games_sum = 0
    games_n = 0

    for season, actuals in actuals_by_season.items():
        preds = preds_by_season.get(season, {})
        for pid, actual in actuals.items():
            if pid not in preds:
                continue
            pred = preds[pid]
            pos = pos_map.get(pid)
            games_sum += actual["games"]
            games_n += 1
            for t, key in targets.items():
                buckets[t]["ALL"][0].append(pred)
                buckets[t]["ALL"][1].append(actual[key])
                if pos in buckets[t]:
                    buckets[t][pos][0].append(pred)
                    buckets[t][pos][1].append(actual[key])

    out: dict = {"mean_games": (games_sum / games_n) if games_n else None}
    for t in targets:
        out[t] = {}
        for pos in ["ALL"] + list(POSITIONS):
            proj, act = buckets[t][pos]
            if proj:
                m = _compute_metrics(proj, act)
                if pos != "ALL":
                    # Within-position ordering quality (GH #598).
                    m.update(rank_metrics(proj, act, TOP_N_BY_POSITION.get(pos, 12)))
                out[t][pos] = m
    return out


def _fmt(val, fmt: str) -> str:
    if val is None:
        return "—"
    try:
        return format(val, fmt)
    except (ValueError, TypeError):
        return str(val)


# Fixed set for the balanced MAE (K excluded — essentially random and not
# projected by every model; see holdout_eval.BALANCED_POSITIONS).
BALANCED_POSITIONS = ("QB", "RB", "WR", "TE")


def _balanced_mae(pos_metrics: dict) -> float | None:
    """Position-balanced MAE: unweighted mean of per-position MAE (GH #577).

    Neutralises the drifting position mix of the qualifier pool; averaged over a
    fixed position set so all models are comparable.
    """
    maes = [
        pos_metrics[p]["mae"]
        for p in BALANCED_POSITIONS
        if p in pos_metrics and pos_metrics[p].get("mae") is not None
    ]
    return sum(maes) / len(maes) if maes else None


def run(seasons: list[int], model_names: list[str]) -> str:
    supabase = get_supabase_client()
    players_data = fetch_all_rows(supabase, "players", "id, position")
    pos_map = {row["id"]: row["position"] for row in players_data}
    all_stats = fetch_all_rows(supabase, "player_stats", "player_id, games_played, season")

    actuals_by_season = {s: _build_availability_actuals(supabase, s, all_stats) for s in seasons}
    for s in seasons:
        print(f"Season {s}: {len(actuals_by_season[s])} players (games ≥ {MIN_INCLUDE_GAMES}, non-rookie)")

    # {model: pooled combined metrics}
    combined: dict[str, dict] = {}
    for name in model_names:
        res = supabase.table("projection_models").select("id").eq("name", name).execute()
        if not res.data:
            continue
        model_id = res.data[0]["id"]
        preds_by_season: dict[int, dict[str, float]] = {}
        for s in seasons:
            preds_rows = _fetch_season_rows(
                supabase, "model_projections", "player_id, projected_ppg",
                s, extra_eq=("model_id", model_id),
            )
            preds_by_season[s] = {r["player_id"]: float(r["projected_ppg"]) for r in preds_rows
                                  if r.get("projected_ppg") is not None}
        cm = _combined_avail_metrics(preds_by_season, actuals_by_season, pos_map)
        if cm.get("avail", {}).get("ALL"):
            combined[name] = cm

    return _render(combined, seasons)


def _render(combined: dict[str, dict], seasons: list[int]) -> str:
    report_positions = ["ALL"] + list(POSITIONS)

    lines: list[str] = []
    lines.append("# Projection Availability-Inclusive Evaluation (GH #574)\n")
    lines.append(f"_Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}_\n")
    lines.append(
        f"Standard backtests score only players with ≥4 games, hiding injured/benched/bust "
        f"seasons. This evaluation keeps everyone with ≥{MIN_INCLUDE_GAMES} game (non-rookie) and "
        f"scores each PPG projection against two targets: **Rate** = actual PPG, and "
        f"**Avail** = availability-inclusive production per scheduled game "
        f"(`ppg × min(games,{GAMES_FULL_SEASON}) / {GAMES_FULL_SEASON}`, missed games = 0). "
        f"The gap **avail-MAE − rate-MAE** is the *availability error budget* — error from "
        f"playing-time loss that no current rate feature addresses. Default models are "
        f"parameter-free (additive + external), whose stored projections are leakage-free; "
        f"learned models (if included) use in-sample projections (see #571). "
        f"Seasons: {','.join(map(str, seasons))}. See "
        f"[docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md) "
        f"(Finding 3).\n"
    )

    # Decomposition: rate vs availability, sorted by avail MAE.
    lines.append("## Rate vs availability decomposition (combined ALL)\n")
    lines.append(
        "_**Avail MAE** is pooled over players; **Bal Avail MAE** is the position-balanced "
        "availability MAE (unweighted mean of per-position avail MAE over QB/RB/WR/TE; K "
        "excluded), which removes the drifting position mix of the qualifier pool (GH #577)._\n"
    )
    lines.append("| Model | N | Mean games | Rate MAE | Avail MAE | Bal Avail MAE | Availability budget | Avail bias |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
    ranked = sorted(
        (m for m in combined if combined[m]["avail"]["ALL"]),
        key=lambda m: combined[m]["avail"]["ALL"]["mae"],
    )
    for name in ranked:
        rate = combined[name]["rate"]["ALL"]
        avail = combined[name]["avail"]["ALL"]
        budget = (avail["mae"] - rate["mae"]) if (rate and avail) else None
        bal_avail = _balanced_mae(combined[name]["avail"])
        lines.append(
            f"| `{name}` | {_fmt(avail['player_count'], 'd')} | {_fmt(combined[name]['mean_games'], '.1f')} "
            f"| {_fmt(rate['mae'], '.3f')} | {_fmt(avail['mae'], '.3f')} | {_fmt(bal_avail, '.3f')} "
            f"| {_fmt(budget, '+.3f')} | {_fmt(avail['bias'], '+.3f')} |"
        )
    lines.append("")

    # Per-position availability MAE.
    lines.append("## Availability-inclusive metrics by position\n")
    for pos in report_positions:
        lines.append(f"### {pos}\n")
        lines.append("| Model | MAE | Bias | R² | RMSE | N |")
        lines.append("| --- | --- | --- | --- | --- | --- |")
        pos_models = sorted(
            (m for m in combined if combined[m]["avail"].get(pos)),
            key=lambda m: combined[m]["avail"][pos]["mae"],
        )
        for name in pos_models:
            r = combined[name]["avail"][pos]
            lines.append(
                f"| `{name}` | {_fmt(r['mae'], '.3f')} | {_fmt(r['bias'], '+.3f')} "
                f"| {_fmt(r['r_squared'], '.3f')} | {_fmt(r['rmse'], '.3f')} | {_fmt(r['player_count'], 'd')} |"
            )
        lines.append("")

    # Decision-relevant ranking quality on the availability-inclusive actuals.
    lines.append("## Ranking quality — per-position ordering (GH #598)\n")
    lines.append(
        "_Spearman ρ and top-N hit rate against the **availability-inclusive** actuals "
        "(total fantasy production per player-season, injuries included) — the ordering "
        "that VORP/auction decisions actually consume. **Top-N**: 12 for QB/TE, 24 for "
        "RB/WR (≈ the starter pool)._\n"
    )
    for pos in [p for p in POSITIONS if p != "K"]:
        n_top = TOP_N_BY_POSITION.get(pos, 12)
        lines.append(f"### {pos} (top-{n_top})\n")
        lines.append("| Model | Spearman ρ | Top-N hit | N |")
        lines.append("| --- | --- | --- | --- |")
        rank_models = sorted(
            (m for m in combined if combined[m]["avail"].get(pos)
             and combined[m]["avail"][pos].get("spearman") is not None),
            key=lambda m: combined[m]["avail"][pos]["spearman"],
            reverse=True,
        )
        for name in rank_models:
            r = combined[name]["avail"][pos]
            lines.append(
                f"| `{name}` | {_fmt(r.get('spearman'), '.3f')} "
                f"| {_fmt(r.get('topn_hit'), '.3f')} | {_fmt(r.get('player_count'), 'd')} |"
            )
        lines.append("")

    return "\n".join(lines)


def _default_models() -> list[str]:
    """Parameter-free models only (additive + external) — leakage-free stored projections."""
    return [name for name, m in MODELS.items() if m.combiner_type == "additive"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Availability-inclusive backtest (#574)")
    parser.add_argument("--seasons", default="2022,2023,2024,2025")
    parser.add_argument("--models", default=None,
                        help="Comma-separated subset (default: all parameter-free models)")
    parser.add_argument("--include-learned", action="store_true",
                        help="Also include learned/residual models (in-sample projections — diagnostic only)")
    parser.add_argument("--output",
                        default=os.path.join(repo_root, "docs", "generated", "projection-availability-eval.md"))
    args = parser.parse_args()

    seasons = [int(s) for s in args.seasons.split(",")]
    if args.models:
        model_names = [m.strip() for m in args.models.split(",")]
    else:
        model_names = _default_models()
        if args.include_learned:
            model_names += [n for n, m in MODELS.items() if m.combiner_type in ("learned", "residual")]

    table = run(seasons, model_names)

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        f.write(table)
    print(f"\nReport written to: {args.output}")
    print("\n" + "=" * 80)
    print(table)


if __name__ == "__main__":
    main()
