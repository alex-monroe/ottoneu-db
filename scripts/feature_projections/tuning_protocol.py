"""Honest hyperparameter-tuning protocol for the additive models (GH #595).

The audit (Finding 1) caught the *learned* models training on the seasons they
were scored on. The additive models have a milder version of the same problem:
their hyperparameters — age-curve params (#272), recency weights (#271), the
regression factor and backup-QB penalty embedded in ``v14`` — were chosen by
grid search whose default ``--seasons`` *included the 2024–2025 holdout*. The
within-additive ranking (e.g. v14 vs v19 at Δ=0.006) is then inside the tuning
noise, and #589 as originally written ("tune the base against the held-out
harness") would tune directly on the final holdout, burning it completely.

The fix is an inner/outer split that mirrors the rolling-origin protocol (#594):

- **Inner (tuning) seasons** — hyperparameter search runs *only* here. These are
  the rolling-origin eval folds **excluding** the final confirmation window.
- **Confirmation window** — the most recent season(s), reserved for a single
  confirmatory look per *accepted* variant. Grid search must never touch it.

Tuning scripts default ``--seasons`` to :data:`INNER_TUNING_SEASONS` and call
:func:`warn_on_confirmation_overlap` so that pointing one at the confirmation
window is loud and deliberate, not the silent default.
"""

from __future__ import annotations

# The most recent held-out season(s) — reserved for confirmation only. When 2026
# actuals land, roll this forward (and extend INNER_TUNING_SEASONS) rather than
# tuning on 2026 directly.
CONFIRMATION_SEASONS = (2025,)

# Default inner folds for hyperparameter search: the rolling-origin eval seasons
# minus the confirmation window. Keep in lockstep with the holdout protocol.
INNER_TUNING_SEASONS = (2022, 2023, 2024)


def inner_tuning_seasons_str() -> str:
    """Comma-joined default for argparse ``--seasons`` defaults/help text."""
    return ",".join(str(s) for s in INNER_TUNING_SEASONS)


def warn_on_confirmation_overlap(seasons: list) -> bool:
    """Print a loud warning if any requested season is in the confirmation window.

    Returns True when an overlap was found (so callers can also gate behaviour on
    it if they wish). Tuning on the confirmation window is leakage at the
    hyperparameter level — the exact mechanism the inner/outer split exists to
    prevent — so it must never be the silent path.
    """
    overlap = sorted(set(int(s) for s in seasons) & set(CONFIRMATION_SEASONS))
    if overlap:
        bar = "!" * 72
        print(bar)
        print(
            "  WARNING: tuning seasons "
            f"{overlap} overlap the CONFIRMATION window {list(CONFIRMATION_SEASONS)}."
        )
        print(
            "  Hyperparameters selected with sight of the confirmation window are\n"
            "  leakage at the hyperparameter level (GH #595). Tune on the inner folds\n"
            f"  ({inner_tuning_seasons_str()}) and keep the confirmation window for a\n"
            "  single confirmatory look per accepted variant."
        )
        print(bar)
    return bool(overlap)
