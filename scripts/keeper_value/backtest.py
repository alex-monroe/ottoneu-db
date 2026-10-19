"""Leakage-free backtest of the keeper outlook (``just keeper-backtest``).

Rolling origin: to score season N (as of week w → value in N+1), the model is
fitted only on rows whose outcome season is ≤ N — that is, seasons N' ≤ N−1 —
and sees season N only through week w. Three methods are compared:

- **(a) prior** — the population cell distribution alone.
- **(b) prior + shrunk adjustment** — the published model.
- **(c) point** — today's method: one number, this season's pace (or last
  season's value before any games), as a point mass. Its option value is
  max(0, pace − salary), the old keeper value.
- **(b′) individual, unshrunk** — (b) with w = 1 whenever the player has any
  games: shows what the shrinkage buys.

Dev folds are scored by default. ``--confirm`` adds the final fold (N = the
last season with a known N+1), which is confirmation-only — one look per
change, as in docs/references/projection-model-changes.md.

Usage:
    just keeper-backtest                       # dev folds, as of the deadline
    just keeper-backtest --as-of-week 0        # offseason / preseason view
    just keeper-backtest --confirm --output docs/generated/keeper-value-backtest.md
"""

from __future__ import annotations

import argparse
from datetime import date

import numpy as np
import pandas as pd

from scripts.keeper_value import dataset
from scripts.keeper_value.evaluate import (
    STRIKES,
    calibration,
    coverage,
    paired_bootstrap,
    row_scores,
)
from scripts.keeper_value.model import KeeperModel

MIN_TRAIN_SEASONS = 3
METHODS = ("prior", "shrunk", "point", "unshrunk")
LABELS = {
    "prior": "(a) prior only",
    "shrunk": "(b) prior + shrunk adjustment",
    "point": "(c) point estimate (current)",
    "unshrunk": "(b′) individual, unshrunk",
}


def relevant(rows: pd.DataFrame) -> np.ndarray:
    """Fantasy-relevant rows, chosen on information known at the as-of week.

    Most of the NFL population is worth $1 next year and every method calls it;
    this subset — anyone pacing or last valued over $3, or a young day-1/day-2
    pick — is where keeper decisions actually are.
    """
    young_pick = (rows["years"] <= 2) & rows["draft_bucket"].isin(["R1", "R2", "R3"])
    return ((rows["point_value"] >= 3) | young_pick).to_numpy()


def experience_group(years: pd.Series) -> pd.Series:
    return pd.cut(years, [0, 2, 4, 99], labels=["Y1–2", "Y3–4", "Y5+"]).astype(str)


def run_folds(data: dataset.SeasonData, eval_seasons: list[int], as_of_week: int) -> pd.DataFrame:
    """Out-of-fold predictions + per-row scores for every method."""
    first = data.first_season + 1  # needs a prior season for features
    panel = dataset.build_panel(data, list(range(first, max(eval_seasons) + 1)), as_of_week)
    out = []
    for n in eval_seasons:
        train = panel[(panel["season"] <= n - 1) & panel["latent_next"].notna()]
        test = panel[panel["season"] == n]
        if train["season"].nunique() < MIN_TRAIN_SEASONS or test.empty:
            continue
        model = KeeperModel.fit(train)
        unshrunk = KeeperModel.fit(train, k_override=1e-6)
        y = test["value_next"].to_numpy(float)
        preds = {
            "prior": model.predict_quantiles(test, shrink=False),
            "shrunk": model.predict_quantiles(test),
            "point": np.repeat(test["point_value"].to_numpy(float)[:, None], 40, axis=1),
            "unshrunk": unshrunk.predict_quantiles(test),
        }
        base = test[["player_id", "name", "position", "season", "years", "exp_bucket",
                     "draft_bucket", "career_games", "point_value", "value_next"]].reset_index(drop=True)
        base["relevant"] = relevant(test)
        base["w"] = model.weights(test)
        for method, q in preds.items():
            scores = row_scores(q, y)
            frame = pd.concat([base, scores], axis=1)
            frame["method"] = method
            frame["_q"] = list(q)
            out.append(frame)
        print(f"  fold {n}: train {train['season'].min()}–{n - 1} ({len(train)} rows), "
              f"test {len(test)} rows; k={ {p: f.k for p, f in model.fits.items()} }")
    return pd.concat(out, ignore_index=True)


def _fmt(x: float, d: int = 2) -> str:
    return f"{x:.{d}f}"


def _summary_table(scored: pd.DataFrame, mask_name: str) -> list[str]:
    lines = [f"| Method | CRPS ($) | Option-value MAE ($) | Brier | p10 / p50 / p90 coverage | n |",
             "|---|---|---|---|---|---|"]
    for m in METHODS:
        s = scored[scored["method"] == m]
        if mask_name == "relevant":
            s = s[s["relevant"]]
        q = np.vstack(s["_q"].to_numpy())
        cov = coverage(q, s["value_next"].to_numpy(float))
        lines.append(f"| {LABELS[m]} | {_fmt(s['crps'].mean())} | {_fmt(s['ov_mae'].mean())} | "
                     f"{_fmt(s['brier'].mean(), 3)} | {cov['p10']:.0%} / {cov['p50']:.0%} / {cov['p90']:.0%} | {len(s)} |")
    return lines


def _by_group(scored: pd.DataFrame) -> list[str]:
    s = scored[scored["relevant"]].copy()
    s["group"] = experience_group(s["years"])
    piv = s.pivot_table(index="group", columns="method", values="crps", aggfunc="mean")
    n = s[s["method"] == "shrunk"].groupby("group").size()
    w = s[s["method"] == "shrunk"].groupby("group")["w"].mean()
    lines = ["| Years in league | n | mean w | " + " | ".join(LABELS[m] for m in METHODS) + " |",
             "|---|---|---|" + "---|" * len(METHODS)]
    for g in ["Y1–2", "Y3–4", "Y5+"]:
        if g not in piv.index:
            continue
        lines.append(f"| {g} | {n[g]} | {w[g]:.2f} | " + " | ".join(_fmt(piv.loc[g, m]) for m in METHODS) + " |")
    return lines


def _significance(scored: pd.DataFrame) -> list[str]:
    s = scored[scored["relevant"]]
    lines = ["| Comparison | Metric | Δ (first − second) | 95% CI | Verdict |", "|---|---|---|---|---|"]
    pivot = {m: s[s["method"] == m].reset_index(drop=True) for m in METHODS}
    groups = pivot["shrunk"]["player_id"].to_numpy()
    for a, b in (("shrunk", "prior"), ("shrunk", "point"), ("shrunk", "unshrunk")):
        for metric in ("crps", "ov_mae", "brier"):
            d, lo, hi = paired_bootstrap(pivot[a][metric].to_numpy(), pivot[b][metric].to_numpy(), groups)
            verdict = "(b) better" if hi < 0 else ("(b) worse" if lo > 0 else "not significant")
            dd = 3 if metric == "brier" else 2
            lines.append(f"| {LABELS[a]} vs {LABELS[b]} | {metric} | {_fmt(d, dd)} | "
                         f"[{_fmt(lo, dd)}, {_fmt(hi, dd)}] | {verdict} |")
    return lines


def _calibration(scored: pd.DataFrame) -> list[str]:
    lines = []
    for m in ("shrunk", "prior"):
        s = scored[(scored["method"] == m) & scored["relevant"]]
        cal = calibration(np.vstack(s["_q"].to_numpy()), s["value_next"].to_numpy(float))
        lines += [f"**{LABELS[m]}**", "", "| Called keepable | n | Predicted | Observed |", "|---|---|---|---|"]
        lines += [f"| {r.bin} | {r.n} | {r.predicted:.0%} | {r.observed:.0%} |" for r in cal.itertuples()]
        lines.append("")
    # The point method's calls are all 0% or 100%.
    s = scored[(scored["method"] == "point") & scored["relevant"]]
    y = s["value_next"].to_numpy(float)
    pv = s["point_value"].to_numpy(float)
    hits = [(pv > k) for k in STRIKES]
    called = np.concatenate(hits)
    kept = np.concatenate([(y > k) for k in STRIKES])
    lines.append(f"**{LABELS['point']}** calls every player 0% or 100% keepable: of the "
                 f"\"100%\" calls {kept[called].mean():.0%} were kept, of the \"0%\" calls "
                 f"{kept[~called].mean():.0%} were.")
    return lines


def render(sections: list[tuple[int, str, pd.DataFrame]]) -> str:
    out = [
        "# Keeper outlook backtest",
        "",
        f"Generated {date.today().isoformat()} by `just keeper-backtest` "
        "(scripts/keeper_value/backtest.py). Method: docs/references/keeper-value.md.",
        "",
        "Rolling origin: each season N is scored by a model fitted only on seasons ≤ N−1, "
        "seeing N only through the as-of week. Value is next season's availability-inclusive "
        f"dollar value in that season's /value market. Keepability is scored at strikes ${', $'.join(map(str, STRIKES))} "
        "(historical salaries are not stored). *Relevant* = pacing or last valued ≥ $3, or a "
        "Y1–2 day-1/day-2 pick — chosen on as-of information only.",
        "",
    ]
    for week, title, scored in sections:
        seasons = sorted(scored["season"].unique())
        out += [f"## {title}", "",
                f"As of NFL week {week}; seasons scored: {seasons[0]}–{seasons[-1]}.", "",
                "### Relevant players", ""] + _summary_table(scored, "relevant") + [
                "", "### All players", ""] + _summary_table(scored, "all") + [
                "", "### CRPS by years in league (relevant)", ""] + _by_group(scored) + [
                "", "### Significance (relevant; player-clustered bootstrap)", ""] + _significance(scored) + [
                "", "### Calibration of P(keepable) (relevant, pooled over strikes)", ""] + _calibration(scored) + [""]
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--as-of-week", type=int, nargs="+", default=[dataset.DEADLINE_WEEK])
    ap.add_argument("--first-eval", type=int, default=2016)
    ap.add_argument("--confirm", action="store_true", help="also score the final (confirmation) fold")
    ap.add_argument("--current-season", type=int, default=date.today().year)
    ap.add_argument("--output", help="write the markdown report here")
    args = ap.parse_args()

    data = dataset.load(args.current_season)
    final = data.complete_through - 1  # the last N with a known N+1
    sections = []
    for week in args.as_of_week:
        dev = list(range(args.first_eval, final))
        print(f"As of week {week}: dev folds {dev[0]}–{dev[-1]}")
        sections.append((week, f"Dev folds — as of week {week}", run_folds(data, dev, week)))
        if args.confirm:
            print(f"As of week {week}: confirmation fold {final}")
            sections.append((week, f"Confirmation fold {final} — as of week {week}",
                             run_folds(data, [final], week)))
    report = render(sections)
    if args.output:
        with open(args.output, "w") as fh:
            fh.write(report)
        print(f"Wrote {args.output}")
    else:
        print(report)


if __name__ == "__main__":
    main()
