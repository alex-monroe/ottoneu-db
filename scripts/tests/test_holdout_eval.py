"""Tests for the rolling-origin protocol + player-clustered bootstrap (GH #594).

Exercises the pure, deterministic core that needs no DB access: the
expanding-window fold generator and the cluster bootstrap's resampling unit.
"""

import numpy as np
import pytest

from scripts.feature_projections.holdout_eval import rolling_folds
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
