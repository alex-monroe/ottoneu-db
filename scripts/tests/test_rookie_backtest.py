"""Tests for the rookie projection backtest harness (no DB access).

Exercises the pure, deterministic core: tier bucketing, the three candidate
model fitters, metrics, and the leakage-safe leave-one-season-out loop.
"""

import pytest

from scripts.feature_projections.rookie_backtest import (
    MODEL_NAMES,
    _tier_for,
    _tier_label,
    compute_metrics,
    fit_flat_mean,
    fit_tier_lookup,
    fit_draft_capital,
    fit_draft_capital_depth,
    run_backtest,
)


def _sample(position, pick, season, ppg, depth=None):
    return {"player_id": f"{position}{pick}{season}", "position": position,
            "pick": pick, "season": season, "ppg": ppg, "depth": depth}


class TestTiers:
    def test_tier_for_boundaries(self):
        assert _tier_for(1) == (1, 16)
        assert _tier_for(16) == (1, 16)
        assert _tier_for(17) == (17, 48)
        assert _tier_for(257) == (101, 257)

    def test_tier_for_out_of_range(self):
        assert _tier_for(9999) is None

    def test_tier_label_last_tier_is_open_ended(self):
        assert _tier_label(1, 16) == "1-16"
        assert _tier_label(101, 257) == "101+"


class TestComputeMetrics:
    def test_empty(self):
        assert compute_metrics([]) == {"mae": None, "rmse": None, "bias": None, "n": 0}

    def test_known_pairs(self):
        # (pred, actual): errors = actual - pred = [+2, -2]
        m = compute_metrics([(2.0, 4.0), (6.0, 4.0)])
        assert m["mae"] == 2.0
        assert m["rmse"] == 2.0
        assert m["bias"] == 0.0
        assert m["n"] == 2

    def test_bias_sign_is_actual_minus_predicted(self):
        # Under-prediction (actual > pred) → positive bias.
        assert compute_metrics([(1.0, 5.0)])["bias"] == 4.0


class TestModelFitters:
    def test_flat_mean_ignores_pick(self):
        train = [_sample("RB", 1, 2020, 12.0), _sample("RB", 200, 2020, 4.0)]
        predict = fit_flat_mean(train)
        assert predict("RB", 1) == pytest.approx(8.0)
        assert predict("RB", 200) == pytest.approx(8.0)
        assert predict("WR", 1) is None  # unseen position

    def test_tier_lookup_varies_by_tier(self):
        train = [
            _sample("RB", 5, 2020, 13.0),    # tier 1-16
            _sample("RB", 10, 2020, 11.0),   # tier 1-16
            _sample("RB", 200, 2020, 3.0),   # tier 101+
        ]
        predict = fit_tier_lookup(train)
        assert predict("RB", 3) == pytest.approx(12.0)   # mean of the 1-16 tier
        assert predict("RB", 210) == pytest.approx(3.0)  # the 101+ tier

    def test_tier_lookup_falls_back_to_position_mean(self):
        train = [_sample("RB", 5, 2020, 13.0), _sample("RB", 6, 2020, 11.0)]
        predict = fit_tier_lookup(train)
        # No 101+ sample → fall back to the position mean (12.0).
        assert predict("RB", 200) == pytest.approx(12.0)

    def test_draft_capital_is_monotonic_in_pick(self):
        # Even with no training the prior produces a higher value for an
        # earlier pick than a later one within a position.
        predict = fit_draft_capital([])
        assert predict("RB", 1) > predict("RB", 200)

    def test_draft_capital_depth_falls_back_to_base_without_depth(self):
        # With no depth chart on the query, draft_capital_depth must reproduce
        # the plain draft_capital prediction exactly (zero adjustment).
        train = [_sample("RB", 5, 2020, 13.0, depth=1),
                 _sample("RB", 200, 2020, 3.0, depth=3)]
        base = fit_draft_capital(train)
        depth_aware = fit_draft_capital_depth(train)
        assert depth_aware("RB", 50, None) == pytest.approx(base("RB", 50, None))

    def test_draft_capital_depth_boosts_starters(self):
        # Tier-1 (starter) rookies that out-produce their pick should pull the
        # depth-aware prediction above the depth-blind base for a tier-1 query.
        train = [
            _sample("RB", 100, 2020, 12.0, depth=1),  # late pick, started, big PPG
            _sample("RB", 100, 2021, 11.0, depth=1),
            _sample("RB", 100, 2022, 4.0, depth=3),   # late pick, buried, low PPG
        ]
        base = fit_draft_capital(train)
        depth_aware = fit_draft_capital_depth(train)
        assert depth_aware("RB", 100, 1) > base("RB", 100, 1)


class TestRunBacktest:
    def test_leakage_only_earlier_seasons_train(self):
        samples = [
            _sample("RB", 50, 2020, 10.0),   # train for 2021
            _sample("RB", 50, 2021, 2.0),    # test in 2021 (and would train 2022)
        ]
        results = run_backtest(samples, [2021])
        # flat_mean prediction for 2021 must equal the 2020-only mean (10.0),
        # NOT the mean including 2021 — proves the split excludes the holdout.
        pairs = results  # convenience
        acc = pairs["accuracy"]["flat_mean"]["RB"]
        # one test sample, predicted 10.0, actual 2.0 → bias = -8.0
        assert acc["bias"] == pytest.approx(-8.0)
        assert acc["n"] == 1

    def test_season_without_training_is_skipped(self):
        # Earliest season has no prior data → no rows accumulated for it.
        samples = [_sample("WR", 10, 2020, 9.0)]
        results = run_backtest(samples, [2020])
        assert results["accuracy"]["flat_mean"].get("ALL", {}).get("n", 0) == 0

    def test_all_models_scored_and_calibration_populated(self):
        samples = [
            _sample("RB", 5, 2020, 13.0),
            _sample("RB", 200, 2020, 3.0),
            _sample("RB", 8, 2021, 12.0),
            _sample("RB", 210, 2021, 2.0),
        ]
        results = run_backtest(samples, [2021])
        for m in MODEL_NAMES:
            assert results["accuracy"][m]["ALL"]["n"] == 2
        # Calibration keyed on (position, tier_label) with actual + model means.
        assert ("RB", "1-16") in results["calibration"]
        assert results["calibration"][("RB", "1-16")]["actual"] == pytest.approx(12.0)
