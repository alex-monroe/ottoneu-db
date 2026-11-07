"""Per-stat held-out eval for the Stage A stat baseline (stat-projection redesign).

For each eval season ``t`` it fits Stage A on seasons before ``t`` only, projects
every stat of every player with history, and compares against the season-``t``
actuals per (position, stat), alongside two comparators:

- ``naive``: the player's prior-season rate, no weighting or shrinkage;
- ``pos_mean``: the position's pooled rate (the shrinkage target itself).

Metrics per (position, stat), pooled over the eval seasons:

- ``MAE`` and ``bias`` (pred − actual) weighted by the actual opportunities
  (games for per-game stats, attempts/targets/carries for rates), so a 3-target
  catch rate does not count like a 120-target one;
- ``ρ`` (Spearman) over players at or above the median opportunity count, where
  the actual rate is meaningful enough to rank.

Plus a ``ppg`` row: scored projected PPG vs actual ``total_points / games``.
Population: players with ≥ MIN_GAMES games in the eval season and at least one
season in the three before it (rookies have no Stage A projection).

This is a diagnostic (00-synthesis §6 item 2). The PPG gate is still
``just holdout-eval`` + ``just significance``. Per the confirmation discipline
(#594), iterate on seasons before 2025 and look at 2025 once.

Usage::

    just stat-eval                       # eval seasons 2019-2024
    just stat-eval --eval-seasons 2021-2024 --out docs/generated/stat-eval.md
"""

from __future__ import annotations

import argparse
from typing import Optional

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from scripts.config import MIN_GAMES, fetch_all_rows, get_supabase_client
from scripts.analysis_utils import fetch_multi_season_nfl_stats
from scripts.feature_projections import stat_baseline as sb

COMPARATORS = ("model", "naive", "pos_mean")


def _parse_seasons(spec: str) -> list[int]:
    out: list[int] = []
    for part in spec.split(","):
        if "-" in part:
            lo, hi = part.split("-")
            out.extend(range(int(lo), int(hi) + 1))
        else:
            out.append(int(part))
    return sorted(set(out))


def _naive_rates(seasons: pd.DataFrame, params: sb.FoldParams) -> pd.DataFrame:
    """Prior-season raw rate per stat; the position mean where the player had no opportunity."""
    target = params.target_season
    prev = seasons[seasons["season"] == target - 1]
    frames = []
    for position, chain in sb.CHAINS.items():
        rows = prev[prev["position"] == position]
        if rows.empty:
            continue
        out = pd.DataFrame({"player_id": rows["player_id"].values, "position": position})
        for spec in chain:
            mu = params.mu.get((position, spec.name))
            if mu is None:
                continue
            den = rows[spec.den].to_numpy(float)
            with np.errstate(invalid="ignore", divide="ignore"):
                out[spec.name] = np.where(den > 0, rows[spec.num].to_numpy(float) / den, mu)
        frames.append(out)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def eval_season(seasons: pd.DataFrame, target: int) -> pd.DataFrame:
    """Long frame of (comparator, position, stat, player, pred, actual, weight) for one season."""
    train = seasons[seasons["season"] < target]
    params = sb.fit_fold(train, target)
    preds = {
        "model": sb.project_rates(train, params, k_scale=1.0),
        "pos_mean": sb.project_rates(train, params, k_scale=None),
        "naive": _naive_rates(train, params),
    }
    actual = seasons[(seasons["season"] == target) & (seasons["games"] >= MIN_GAMES)]
    # Score only players every comparator projects (naive needs a prior-season row).
    common = set(actual["player_id"])
    for frame in preds.values():
        common &= set(frame["player_id"])
    actual = actual[actual["player_id"].isin(common)].set_index("player_id")

    rows = []
    for name, frame in preds.items():
        frame = frame[frame["player_id"].isin(common)].set_index("player_id")
        for pid, prow in frame.iterrows():
            position = prow["position"]
            arow = actual.loc[pid]
            for spec in sb.CHAINS[position]:
                if spec.name not in frame.columns or pd.isna(prow.get(spec.name)):
                    continue
                den = float(arow[spec.den])
                if den <= 0:
                    continue
                rows.append((name, position, spec.name, pid, float(prow[spec.name]),
                             float(arow[spec.num]) / den, den))
            rows.append((name, position, "ppg", pid, sb.projected_ppg(position, prow.to_dict()),
                         float(arow["total_points"]) / float(arow["games"]), float(arow["games"])))
    out = pd.DataFrame(rows, columns=["comparator", "position", "stat", "player_id",
                                      "pred", "actual", "weight"])
    out["season"] = target
    return out


def summarise(long: pd.DataFrame) -> pd.DataFrame:
    """Per (position, stat, comparator): weighted MAE, weighted bias, Spearman ρ, n."""
    recs = []
    for (position, stat, comp), g in long.groupby(["position", "stat", "comparator"], sort=False):
        w = g["weight"].to_numpy(float)
        err = g["pred"].to_numpy(float) - g["actual"].to_numpy(float)
        big = g[g["weight"] >= g["weight"].median()]
        rho: Optional[float] = None
        if len(big) >= 5 and big["pred"].nunique() > 1:
            rho = float(spearmanr(big["pred"], big["actual"]).statistic)
        recs.append({
            "position": position, "stat": stat, "comparator": comp, "n": len(g),
            "mae": float(np.sum(w * np.abs(err)) / np.sum(w)),
            "bias": float(np.sum(w * err) / np.sum(w)),
            "rho": rho,
        })
    return pd.DataFrame(recs)


def render(summary: pd.DataFrame, eval_seasons: list[int]) -> str:
    """Markdown: one row per (position, stat), the three comparators side by side."""
    lines = [
        f"# Stage A per-stat eval (eval seasons {', '.join(map(str, eval_seasons))})",
        "",
        "Opportunity-weighted MAE and bias (pred − actual); Spearman ρ over players at or "
        "above the median opportunity count. `model` = stat_marcel_v1 (Stage A), "
        "`naive` = prior-season rate, `pos_mean` = position pooled rate. Lower MAE wins; "
        "**bold** marks the best MAE. Each season is fitted on the seasons before it only.",
        "",
        "| Pos | Stat | n | MAE model | MAE naive | MAE pos_mean | bias model | ρ model | ρ naive |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    order = sb.stat_names() + [(p, "ppg") for p in sb.CHAINS if p != "K"]
    piv = summary.set_index(["position", "stat", "comparator"])
    for position, stat in order:
        if (position, stat, "model") not in piv.index:
            continue
        m = {c: piv.loc[(position, stat, c)] for c in COMPARATORS if (position, stat, c) in piv.index}
        best = min(m, key=lambda c: m[c]["mae"])
        mae = {c: (f"**{m[c]['mae']:.4g}**" if c == best else f"{m[c]['mae']:.4g}") for c in m}
        fmt_rho = lambda v: "" if v is None or pd.isna(v) else f"{v:.3f}"  # noqa: E731
        lines.append(
            f"| {position} | {stat} | {int(m['model']['n'])} | {mae.get('model', '')} | "
            f"{mae.get('naive', '')} | {mae.get('pos_mean', '')} | {m['model']['bias']:+.4g} | "
            f"{fmt_rho(m['model']['rho'])} | {fmt_rho(m.get('naive', {}).get('rho') if 'naive' in m else None)} |"
        )
    return "\n".join(lines) + "\n"


def load_seasons(last_season: int) -> pd.DataFrame:
    supabase = get_supabase_client()
    players = fetch_all_rows(supabase, "players", "id, position")
    positions = {str(p["id"]): p["position"] for p in players}
    rows = fetch_multi_season_nfl_stats(list(range(sb.MIN_DATA_SEASON, last_season + 1)))
    return sb.prepare_seasons(rows, positions)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--eval-seasons", default="2019-2024",
                        help="Comma list and/or ranges, e.g. 2019-2024 or 2023,2024")
    parser.add_argument("--out", help="Also write the markdown table to this path")
    args = parser.parse_args()

    eval_seasons = _parse_seasons(args.eval_seasons)
    seasons = load_seasons(max(eval_seasons))
    long = pd.concat([eval_season(seasons, t) for t in eval_seasons], ignore_index=True)
    md = render(summarise(long), eval_seasons)
    print(md)
    if args.out:
        with open(args.out, "w") as fh:
            fh.write(md)
        print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
