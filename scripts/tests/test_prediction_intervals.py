"""Unit tests for empirical prediction intervals (projection uncertainty bands).

Pure functions only — the calibration fit, tier assignment, band application, and
held-out coverage split. No DB or network.
"""

import pytest

from scripts.feature_projections.prediction_intervals import (
    Record,
    _quantiles_for_pct,
    _tier_edges,
    _assign_tier,
    fit_calibration,
    apply_interval,
    _coverage_from_split,
    INTERVAL_POSITIONS,
)


class TestQuantilesForPct:
    def test_eighty_percent(self):
        assert _quantiles_for_pct(80) == (0.10, 0.90)

    def test_fifty_percent(self):
        assert _quantiles_for_pct(50) == (0.25, 0.75)

    def test_ninety_percent(self):
        lo, hi = _quantiles_for_pct(90)
        assert lo == pytest.approx(0.05)
        assert hi == pytest.approx(0.95)


class TestTierAssignment:
    def test_edges_split_into_tiers(self):
        # 100 evenly spaced preds → 4 tiers → 3 interior edges near 25/50/75 pct.
        preds = [float(i) for i in range(100)]
        edges = _tier_edges(preds, 4)
        assert len(edges) == 3
        assert edges[0] < edges[1] < edges[2]

    def test_too_few_for_tiers(self):
        assert _tier_edges([1.0, 2.0], 4) == []

    def test_assign_tier_boundaries(self):
        edges = [10.0, 20.0]
        assert _assign_tier(5.0, edges) == 0
        assert _assign_tier(10.0, edges) == 0  # <= edge stays in lower tier
        assert _assign_tier(15.0, edges) == 1
        assert _assign_tier(25.0, edges) == 2

    def test_assign_tier_no_edges(self):
        assert _assign_tier(99.0, []) == 0


class TestApplyInterval:
    CAL = {
        "positions": {
            "WR": {
                "tier_edges": [10.0],
                "tiers": [[-2.0, 3.0], [-4.0, 4.0]],
                "fallback": [-3.0, 3.0],
            }
        }
    }

    def test_low_tier_band(self):
        assert apply_interval(8.0, "WR", self.CAL) == (6.0, 11.0)

    def test_high_tier_band(self):
        assert apply_interval(14.0, "WR", self.CAL) == (10.0, 18.0)

    def test_low_clamped_at_zero(self):
        # pred 1.0 with -2.0 offset would be negative → clamp to 0.
        low, high = apply_interval(1.0, "WR", self.CAL)
        assert low == 0.0
        assert high == 4.0

    def test_uncalibrated_position_returns_none(self):
        assert apply_interval(10.0, "K", self.CAL) == (None, None)

    def test_band_is_ordered(self):
        low, high = apply_interval(0.5, "WR", self.CAL)
        assert low <= high


class TestFitCalibration:
    def _make_records(self, pos, n, resid_lo, resid_hi):
        """n records for a position with residuals spread linearly in [lo, hi]."""
        recs = []
        for i in range(n):
            frac = i / (n - 1)
            resid = resid_lo + frac * (resid_hi - resid_lo)
            pred = 10.0 + (i % 5)  # spread predictions across tiers
            recs.append(Record(position=pos, pred=pred, actual=pred + resid))
        return recs

    def test_fits_all_interval_positions(self):
        records = []
        for pos in INTERVAL_POSITIONS:
            records += self._make_records(pos, 200, -5.0, 5.0)
        cal = fit_calibration(records, interval_pct=80, n_tiers=4, min_bin=20)
        for pos in INTERVAL_POSITIONS:
            assert pos in cal["positions"]
            assert cal["positions"][pos]["fallback"][0] < 0 < cal["positions"][pos]["fallback"][1]

    def test_thin_position_skipped(self):
        records = self._make_records("WR", 10, -5.0, 5.0)  # < min_bin
        cal = fit_calibration(records, min_bin=30)
        assert "WR" not in cal["positions"]

    def test_thin_tier_falls_back_to_position(self):
        # Enough for the position, but tiers individually thin → tiers == fallback.
        records = self._make_records("RB", 40, -3.0, 3.0)
        cal = fit_calibration(records, n_tiers=4, min_bin=30)
        pos_cal = cal["positions"]["RB"]
        for tier_band in pos_cal["tiers"]:
            assert tier_band == pos_cal["fallback"]

    def test_wider_residuals_give_wider_band(self):
        tight = fit_calibration(self._make_records("WR", 200, -1.0, 1.0), min_bin=20)
        wide = fit_calibration(self._make_records("WR", 200, -8.0, 8.0), min_bin=20)
        tight_w = tight["positions"]["WR"]["fallback"]
        wide_w = wide["positions"]["WR"]["fallback"]
        assert (wide_w[1] - wide_w[0]) > (tight_w[1] - tight_w[0])


class TestCoverage:
    def test_perfectly_calibrated_bands_cover_nominal(self):
        # Fit and confirm on identically-distributed residuals → coverage ≈ nominal.
        import random

        random.seed(0)
        fit = [
            Record("WR", pred=10.0, actual=10.0 + random.gauss(0, 3))
            for _ in range(2000)
        ]
        confirm = [
            Record("WR", pred=10.0, actual=10.0 + random.gauss(0, 3))
            for _ in range(2000)
        ]
        cov = _coverage_from_split(fit, confirm, interval_pct=80, n_tiers=4, min_bin=30)
        assert cov["WR"]["coverage"] == pytest.approx(0.80, abs=0.05)
