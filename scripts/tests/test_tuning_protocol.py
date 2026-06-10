"""Tests for the honest hyperparameter-tuning protocol (GH #595)."""

from scripts.feature_projections import tuning_protocol as tp


class TestInnerVsConfirmation:
    def test_inner_and_confirmation_disjoint(self):
        assert not (set(tp.INNER_TUNING_SEASONS) & set(tp.CONFIRMATION_SEASONS))

    def test_inner_precedes_confirmation(self):
        # Inner folds must all come before the confirmation window.
        assert max(tp.INNER_TUNING_SEASONS) < min(tp.CONFIRMATION_SEASONS)

    def test_inner_seasons_str(self):
        assert tp.inner_tuning_seasons_str() == ",".join(
            str(s) for s in tp.INNER_TUNING_SEASONS
        )


class TestOverlapWarning:
    def test_overlap_detected(self, capsys):
        assert tp.warn_on_confirmation_overlap([2023, 2024, 2025]) is True
        out = capsys.readouterr().out
        assert "WARNING" in out and "2025" in out

    def test_no_overlap_silent(self, capsys):
        assert tp.warn_on_confirmation_overlap([2022, 2023, 2024]) is False
        assert capsys.readouterr().out == ""

    def test_accepts_string_seasons(self):
        # argparse hands ints, but be defensive about str input.
        assert tp.warn_on_confirmation_overlap(["2025"]) is True
