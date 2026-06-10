"""Paired bootstrap significance test for the MAE difference between two models (GH #573).

Finding 2 of the methodology audit
(docs/exec-plans/projection-methodology-audit.md): 31 model variants have been
ranked on the same four seasons with promote/verdict decisions made on MAE
deltas as small as 0.01, and no decision has ever been tested for significance.
With a small dataset and many looks, sub-0.05 deltas are routinely sampling
noise.

This tool computes, for two models, the per-player paired absolute errors on a
held-out window and bootstraps the MAE difference to produce a confidence
interval and a bootstrap p-value. A difference is only "real" if its 95% CI
excludes zero.

By default it runs on the same leakage-free held-out window as
``holdout_eval.py`` (train 2021–2023, eval 2024–2025), so learned models are
compared out-of-sample. Predictions come from ``holdout_eval.gather_predictions``
so the two tools always agree.

Usage:
    venv/bin/python scripts/feature_projections/significance.py \
        v14_qb_starter v31_depth_chart [--position ALL] [--iterations 10000]
"""

from __future__ import annotations

import argparse
from typing import Optional

import numpy as np

from scripts.feature_projections.holdout_eval import (
    gather_predictions,
    gather_predictions_rolling,
    rolling_folds,
)
from scripts.feature_projections.model_config import get_model


def _expand_with_bases(model_names: list[str]) -> list[str]:
    """Include each residual model's base chain so it can be retrained standalone."""
    out: list[str] = []
    for name in model_names:
        chain: list[str] = []
        cur: Optional[str] = name
        seen = set()
        while cur and cur not in seen:
            seen.add(cur)
            chain.append(cur)
            cur = get_model(cur).base_model_name
        # Bases must be trained before dependents; holdout_eval handles ordering.
        for m in chain:
            if m not in out:
                out.append(m)
    return out


def _paired_errors(
    preds: dict,
    actuals_by_season: dict,
    pos_map: dict,
    model_a: str,
    model_b: str,
    position: str,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per-player |error| arrays for both models + the player id of each row.

    The player ids are the bootstrap cluster labels: the same player appearing in
    multiple eval seasons (e.g. 2024 and 2025) is correlated, not independent, so
    the bootstrap must resample whole players, not rows (GH #594, Finding C).
    """
    err_a: list[float] = []
    err_b: list[float] = []
    pids: list[str] = []
    pa, pb = preds.get(model_a, {}), preds.get(model_b, {})
    for season, actuals in actuals_by_season.items():
        sa, sb = pa.get(season, {}), pb.get(season, {})
        for pid, actual in actuals.items():
            if pid not in sa or pid not in sb:
                continue
            if position != "ALL" and pos_map.get(pid) != position:
                continue
            err_a.append(abs(sa[pid] - actual))
            err_b.append(abs(sb[pid] - actual))
            pids.append(pid)
    return (
        np.array(err_a, dtype=np.float64),
        np.array(err_b, dtype=np.float64),
        np.array(pids, dtype=object),
    )


def bootstrap_mae_difference(
    err_a: np.ndarray,
    err_b: np.ndarray,
    clusters: Optional[np.ndarray] = None,
    iterations: int = 10000,
    seed: int = 0,
) -> dict:
    """Paired bootstrap of MAE(A) − MAE(B). Negative delta ⇒ A more accurate.

    Resamples with replacement, recomputing the paired MAE delta each time.
    When ``clusters`` (one player id per row) is given, resampling is **by
    player**: the same player's multiple eval-season rows are drawn together, so
    the CI accounts for within-player correlation instead of treating each
    player-season as independent (GH #594, Finding C). Returns observed delta,
    95% CI, and a two-sided bootstrap p-value (the share of resamples landing on
    the opposite side of zero from the observed delta, doubled).
    """
    n = len(err_a)
    if n == 0:
        return {"n": 0}
    rng = np.random.default_rng(seed)
    observed = float(err_a.mean() - err_b.mean())

    deltas = np.empty(iterations, dtype=np.float64)
    if clusters is not None and len(clusters):
        # Group row indices by player; resample players, concatenating their rows.
        groups: dict = {}
        for i, c in enumerate(clusters):
            groups.setdefault(c, []).append(i)
        cluster_rows = [np.array(v, dtype=np.intp) for v in groups.values()]
        m = len(cluster_rows)
        for i in range(iterations):
            chosen = rng.integers(0, m, m)
            rows = np.concatenate([cluster_rows[j] for j in chosen])
            deltas[i] = err_a[rows].mean() - err_b[rows].mean()
        n_clusters = m
    else:
        for i in range(iterations):
            idx = rng.integers(0, n, n)
            deltas[i] = err_a[idx].mean() - err_b[idx].mean()
        n_clusters = n

    lo, hi = np.percentile(deltas, [2.5, 97.5])
    # Two-sided bootstrap p-value: how often resamples cross to the other side of 0.
    if observed < 0:
        p = 2.0 * float(np.mean(deltas >= 0))
    elif observed > 0:
        p = 2.0 * float(np.mean(deltas <= 0))
    else:
        p = 1.0
    p = min(1.0, p)

    return {
        "n": n,
        "n_clusters": n_clusters,
        "mae_a": float(err_a.mean()),
        "mae_b": float(err_b.mean()),
        "delta": observed,
        "ci_low": float(lo),
        "ci_high": float(hi),
        "p_value": p,
        "significant": bool((lo > 0) or (hi < 0)),
    }


def run(
    model_a: str,
    model_b: str,
    train_seasons: list[int],
    eval_seasons: list[int],
    position: str = "ALL",
    iterations: int = 10000,
    seed: int = 0,
    protocol: str = "fixed",
    min_train_season: Optional[int] = None,
    use_cache: bool = True,
) -> dict:
    models = _expand_with_bases([model_a, model_b])
    if protocol == "rolling":
        if min_train_season is None:
            min_train_season = min(train_seasons)
        folds = rolling_folds(eval_seasons, min_train_season)
        preds, actuals_by_season, pos_map, _ = gather_predictions_rolling(
            folds, models, use_cache=use_cache
        )
    else:
        preds, actuals_by_season, pos_map = gather_predictions(
            train_seasons, eval_seasons, models, use_cache=use_cache
        )
    err_a, err_b, pids = _paired_errors(
        preds, actuals_by_season, pos_map, model_a, model_b, position
    )
    res = bootstrap_mae_difference(
        err_a, err_b, clusters=pids, iterations=iterations, seed=seed
    )
    res.update(
        {"model_a": model_a, "model_b": model_b, "position": position, "protocol": protocol}
    )
    return res


def _print_result(res: dict, train_seasons: list[int], eval_seasons: list[int]) -> None:
    a, b = res["model_a"], res["model_b"]
    protocol = res.get("protocol", "fixed")
    print("\n" + "=" * 72)
    print(f"Paired bootstrap — MAE({a}) − MAE({b})")
    if protocol == "rolling":
        print(f"Rolling-origin: expanding-window folds → eval {eval_seasons} | position {res['position']}")
    else:
        print(f"Held-out window: train {train_seasons} → eval {eval_seasons} | position {res['position']}")
    print(f"Bootstrap: player-clustered resampling ({res.get('n_clusters', '—')} unique players)")
    print("=" * 72)
    if res.get("n", 0) == 0:
        print("No paired players found — cannot test.")
        return
    print(f"  Paired player-seasons (N): {res['n']}  |  unique players: {res.get('n_clusters', '—')}")
    print(f"  MAE {a}: {res['mae_a']:.4f}")
    print(f"  MAE {b}: {res['mae_b']:.4f}")
    print(f"  Observed delta (A−B): {res['delta']:+.4f}  "
          f"({'A better' if res['delta'] < 0 else 'B better' if res['delta'] > 0 else 'tie'})")
    print(f"  95% CI: [{res['ci_low']:+.4f}, {res['ci_high']:+.4f}]")
    print(f"  Bootstrap p-value: {res['p_value']:.4f}")
    if res["significant"]:
        better = a if res["delta"] < 0 else b
        print(f"  ⇒ SIGNIFICANT at 95%: {better} is more accurate (CI excludes 0).")
    else:
        print(f"  ⇒ NOT significant at 95%: the MAE gap is within sampling noise (CI spans 0).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Paired bootstrap significance of an MAE difference (#573)")
    parser.add_argument("model_a")
    parser.add_argument("model_b")
    parser.add_argument("--train-seasons", default="2021,2022,2023")
    parser.add_argument("--eval-seasons", default="2024,2025")
    parser.add_argument("--protocol", choices=("fixed", "rolling"), default="fixed",
                        help="fixed: single train/eval split (default). "
                             "rolling: expanding-window folds, pooled paired errors (#594).")
    parser.add_argument("--min-train-season", type=int, default=None,
                        help="Rolling protocol: earliest training season "
                             "(default: min of --train-seasons).")
    parser.add_argument("--position", default="ALL", help="ALL | QB | RB | WR | TE | K")
    parser.add_argument("--iterations", type=int, default=10000)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--no-cache", action="store_true",
                        help="Force a retrain instead of reusing cached held-out predictions (#597).")
    args = parser.parse_args()

    train_seasons = [int(s) for s in args.train_seasons.split(",")]
    eval_seasons = [int(s) for s in args.eval_seasons.split(",")]
    if args.protocol == "fixed":
        if set(train_seasons) & set(eval_seasons):
            parser.error("train-seasons and eval-seasons must not overlap")
        if max(train_seasons) >= min(eval_seasons):
            parser.error("all train-seasons must precede all eval-seasons (no future leakage)")
    else:
        min_train = args.min_train_season if args.min_train_season is not None else min(train_seasons)
        if min(eval_seasons) <= min_train:
            parser.error(
                f"rolling: every eval season must be > --min-train-season ({min_train})"
            )

    res = run(
        args.model_a, args.model_b, train_seasons, eval_seasons,
        position=args.position, iterations=args.iterations, seed=args.seed,
        protocol=args.protocol, min_train_season=args.min_train_season,
        use_cache=not args.no_cache,
    )
    _print_result(res, train_seasons, eval_seasons)


if __name__ == "__main__":
    main()
