"""Tests for the rolling-origin protocol + player-clustered bootstrap (GH #594).

Exercises the pure, deterministic core that needs no DB access: the
expanding-window fold generator and the cluster bootstrap's resampling unit.
"""

import numpy as np
import pytest

from scripts.feature_projections import holdout_cache
from scripts.feature_projections.backtest import rank_metrics
from scripts.feature_projections.holdout_eval import (
    _restrict_to_harmonized_population,
    rolling_folds,
)
from scripts.feature_projections.significance import bootstrap_mae_difference


class TestRollingFolds:
    def test_expanding_window(self):
        folds = rolling_folds([2023, 2024, 2025], min_train_season=2021)
        assert folds == [
            ([2021, 2022], 2023),
            ([2021, 2022, 2023], 2024),
            ([2021, 2022, 2023, 2024], 2025),
        ]

    def test_each_train_window_precedes_its_eval(self):
        for train, ev in rolling_folds([2023, 2024, 2025], 2018):
            assert max(train) < ev
            assert min(train) == 2018

    def test_unsorted_input_is_sorted(self):
        folds = rolling_folds([2025, 2023, 2024], 2022)
        assert [ev for _, ev in folds] == [2023, 2024, 2025]

    def test_empty_training_window_raises(self):
        # eval 2021 with min_train_season 2021 leaves no prior seasons to train on.
        with pytest.raises(ValueError):
            rolling_folds([2021], min_train_season=2021)


class TestClusterBootstrap:
    def test_clustering_widens_ci_vs_independent(self):
        # Two players, each appearing in two eval seasons with identical errors:
        # model A always beats model B by 1.0. Independent resampling sees 4 "rows";
        # clustered resampling correctly sees only 2 independent units, so its CI
        # must be at least as wide (fewer effective samples ⇒ more uncertainty).
        err_a = np.array([1.0, 1.0, 3.0, 3.0])
        err_b = np.array([2.0, 2.0, 4.0, 4.0])
        clusters = np.array(["p1", "p1", "p2", "p2"], dtype=object)

        indep = bootstrap_mae_difference(err_a, err_b, clusters=None, iterations=2000, seed=1)
        clust = bootstrap_mae_difference(err_a, err_b, clusters=clusters, iterations=2000, seed=1)

        assert indep["n_clusters"] == 4
        assert clust["n_clusters"] == 2
        # Same point estimate, wider (or equal) interval under clustering.
        assert clust["delta"] == pytest.approx(indep["delta"])
        clust_width = clust["ci_high"] - clust["ci_low"]
        indep_width = indep["ci_high"] - indep["ci_low"]
        assert clust_width >= indep_width

    def test_empty_input(self):
        res = bootstrap_mae_difference(np.array([]), np.array([]))
        assert res == {"n": 0}

    def test_observed_delta_sign(self):
        err_a = np.array([1.0, 1.0, 1.0])
        err_b = np.array([2.0, 2.0, 2.0])
        clusters = np.array(["a", "b", "c"], dtype=object)
        res = bootstrap_mae_difference(err_a, err_b, clusters=clusters, iterations=500, seed=0)
        # A's errors are smaller ⇒ delta (A−B) negative ⇒ A more accurate.
        assert res["delta"] < 0
        assert res["significant"] is True


class TestHoldoutCache:
    def test_fingerprint_stable(self):
        fp1 = holdout_cache.model_fingerprint("v14_qb_starter")
        fp2 = holdout_cache.model_fingerprint("v14_qb_starter")
        assert fp1 == fp2 and len(fp1) == 16

    def test_fingerprint_differs_between_models(self):
        assert holdout_cache.model_fingerprint("v14_qb_starter") != holdout_cache.model_fingerprint(
            "v20_learned_usage"
        )

    def test_round_trip(self, tmp_path, monkeypatch):
        monkeypatch.setattr(holdout_cache, "CACHE_DIR", tmp_path / "holdout")
        model = "v20_learned_usage"
        train, ev = [2021, 2022, 2023], [2024]
        assert holdout_cache.load(model, train, ev) is None
        params = {"intercept": 1.0, "coefs": {"weighted_ppg": 0.9}}
        preds = {2024: {"p1": 12.3, "p2": 8.1}}
        holdout_cache.store(model, train, ev, params, preds)
        got = holdout_cache.load(model, train, ev)
        assert got["params"] == params
        # Seasons round-trip back to ints (JSON keys are strings on disk).
        assert got["preds"] == preds

    def test_eval_window_keys_distinctly(self, tmp_path, monkeypatch):
        monkeypatch.setattr(holdout_cache, "CACHE_DIR", tmp_path / "holdout")
        model = "v20_learned_usage"
        holdout_cache.store(model, [2021], [2024], {"a": 1}, {2024: {"p": 1.0}})
        # Different eval window ⇒ separate cache entry (miss).
        assert holdout_cache.load(model, [2021], [2025]) is None
        assert holdout_cache.load(model, [2021], [2024]) is not None


class TestRankMetrics:
    def test_perfect_ordering(self):
        proj = [1.0, 2.0, 3.0, 4.0, 5.0]
        actual = [10.0, 20.0, 30.0, 40.0, 50.0]  # same order, different scale
        m = rank_metrics(proj, actual, n_top=2)
        assert m["spearman"] == pytest.approx(1.0)
        assert m["topn_hit"] == pytest.approx(1.0)  # top-2 predicted == top-2 actual
        assert m["n_top"] == 2

    def test_reversed_ordering(self):
        proj = [1.0, 2.0, 3.0, 4.0, 5.0]
        actual = [50.0, 40.0, 30.0, 20.0, 10.0]
        m = rank_metrics(proj, actual, n_top=2)
        assert m["spearman"] == pytest.approx(-1.0)
        assert m["topn_hit"] == pytest.approx(0.0)  # no overlap

    def test_top_n_capped_at_n(self):
        m = rank_metrics([1.0, 2.0, 3.0], [3.0, 2.0, 1.0], n_top=24)
        assert m["n_top"] == 3

    def test_too_few_points(self):
        m = rank_metrics([1.0], [2.0], n_top=12)
        assert m["spearman"] is None and m["topn_hit"] is None


class TestHarmonizedPopulation:
    def test_keeps_top_n_per_position_by_points(self):
        # 3 RBs, keep top 2 by points; 1 QB always kept.
        actuals = {"rb1": 10.0, "rb2": 9.0, "rb3": 1.0, "qb1": 20.0}
        pos_map = {"rb1": "RB", "rb2": "RB", "rb3": "RB", "qb1": "QB"}
        points = {2025: {"rb1": 200.0, "rb2": 180.0, "rb3": 30.0, "qb1": 400.0}}
        out = _restrict_to_harmonized_population(
            {2025: actuals}, pos_map, points, {"RB": 2, "QB": 1}
        )
        assert set(out[2025]) == {"rb1", "rb2", "qb1"}  # rb3 (lowest points) dropped
        assert out[2025]["rb1"] == 10.0  # values preserved (PPG, not points)

    def test_short_season_keeps_all_available(self):
        actuals = {"wr1": 12.0, "wr2": 8.0}
        pos_map = {"wr1": "WR", "wr2": "WR"}
        points = {2023: {"wr1": 150.0, "wr2": 100.0}}
        out = _restrict_to_harmonized_population({2023: actuals}, pos_map, points, {"WR": 48})
        assert set(out[2023]) == {"wr1", "wr2"}  # only 2 available, both kept

    def test_falls_back_to_ppg_when_points_missing(self):
        actuals = {"te1": 9.0, "te2": 5.0}
        pos_map = {"te1": "TE", "te2": "TE"}
        out = _restrict_to_harmonized_population({2024: actuals}, pos_map, {2024: {}}, {"TE": 1})
        assert set(out[2024]) == {"te1"}  # ranks by PPG when no points map

    def test_positions_outside_config_dropped(self):
        actuals = {"k1": 8.0, "qb1": 18.0}
        pos_map = {"k1": "K", "qb1": "QB"}
        out = _restrict_to_harmonized_population(
            {2025: actuals}, pos_map, {2025: {}}, {"QB": 24}  # no K entry
        )
        assert set(out[2025]) == {"qb1"}
