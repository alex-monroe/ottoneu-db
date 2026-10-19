"""Scoring a predicted next-season value distribution against what happened.

Historical salaries are not stored, so keepability is scored at a grid of
strikes (``STRIKES``) — the next-season salaries keepers actually carry — rather
than at each player's own contract:

- **CRPS** — the whole distribution's error, in dollars. It is the option-value
  error integrated over every strike, so it is the headline number.
- **Option-value MAE** — |E[max(0, V − S)] − max(0, V_actual − S)| per strike.
- **Brier** — on the event "kept" = V_actual > S, per strike.
- **Calibration** — of the calls "x% keepable", how often the player was.
- **Coverage** — the share of outcomes under the p10 / p50 / p90.

``paired_bootstrap`` resamples players (all of one player's seasons together),
so a player who appears in eight folds is not counted as eight independent wins.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from scripts.keeper_value.model import crps, option_value, prob_above

STRIKES = (3, 5, 10, 20, 35, 50)
CAL_BINS = np.array([0, 0.05, 0.15, 0.3, 0.5, 0.7, 0.85, 1.0001])


def row_scores(quantiles: np.ndarray, y: np.ndarray) -> pd.DataFrame:
    """Per-row losses: CRPS, mean option-value error, mean Brier across strikes."""
    ov_err = np.zeros(len(y))
    brier = np.zeros(len(y))
    for s in STRIKES:
        ov_err += np.abs(option_value(quantiles, s) - np.maximum(0, y - s))
        brier += (prob_above(quantiles, s) - (y > s)) ** 2
    return pd.DataFrame({
        "crps": crps(quantiles, y),
        "ov_mae": ov_err / len(STRIKES),
        "brier": brier / len(STRIKES),
    })


def calibration(quantiles: np.ndarray, y: np.ndarray) -> pd.DataFrame:
    """Predicted P(keepable) vs observed, pooled over strikes."""
    preds, outs = [], []
    for s in STRIKES:
        preds.append(prob_above(quantiles, s))
        outs.append((y > s).astype(float))
    p, o = np.concatenate(preds), np.concatenate(outs)
    # Calls of exactly 0 or 1 are dominated by the long tail of no-hopers; keep
    # them in their own bins so they cannot flatter the middle.
    b = np.digitize(p, CAL_BINS) - 1
    rows = []
    for i in range(len(CAL_BINS) - 1):
        sel = b == i
        if sel.sum() == 0:
            continue
        rows.append({
            "bin": f"{CAL_BINS[i]:.0%}–{min(CAL_BINS[i + 1], 1):.0%}",
            "n": int(sel.sum()),
            "predicted": float(p[sel].mean()),
            "observed": float(o[sel].mean()),
        })
    return pd.DataFrame(rows)


def coverage(quantiles: np.ndarray, y: np.ndarray, probs=(0.1, 0.5, 0.9)) -> dict[str, float]:
    """Share of outcomes below each predicted quantile, via the randomised PIT.

    Outcomes pile up on the $1 floor, and so do predictions; a plain "y < p10"
    count is then meaningless (a $1 outcome under a $1 p10). The randomised PIT
    spreads a tied outcome uniformly over the probability the forecast put on
    that value. A calibrated forecast covers 10% / 50% / 90%.
    """
    lo = (quantiles < y[:, None]).mean(axis=1)   # F(y−)
    hi = (quantiles <= y[:, None]).mean(axis=1)  # F(y)
    out = {}
    for t in probs:
        width = hi - lo
        frac = np.where(width > 0, np.clip((t - lo) / np.where(width > 0, width, 1), 0, 1), (lo < t).astype(float))
        out[f"p{int(round(t * 100))}"] = float(frac.mean())
    return out


def paired_bootstrap(a: np.ndarray, b: np.ndarray, groups: np.ndarray,
                     n_boot: int = 2000, seed: int = 7) -> tuple[float, float, float]:
    """Mean(a − b) with a 95% CI, resampling ``groups`` (players)."""
    diff = a - b
    codes, inv = np.unique(groups, return_inverse=True)
    sums = np.bincount(inv, weights=diff)
    counts = np.bincount(inv)
    rng = np.random.default_rng(seed)
    stats = np.empty(n_boot)
    for i in range(n_boot):
        pick = rng.integers(0, len(codes), len(codes))
        stats[i] = sums[pick].sum() / counts[pick].sum()
    return float(diff.mean()), float(np.percentile(stats, 2.5)), float(np.percentile(stats, 97.5))
