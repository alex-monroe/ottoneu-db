"""Unit tests for the rookie recency guard in update_projections.

`recent_drafted_no_stats` is a pure function with no DB dependency — it gates
which drafted-but-statless players still qualify for a rookie projection so
retired pre-2019 draftees don't leak into player_projections (GH #488).
"""
from scripts.update_projections import recent_drafted_no_stats


def test_recent_draftee_within_window_kept():
    drafted_no_stats = {"rookie"}
    seasons = {"rookie": 2026}
    assert recent_drafted_no_stats(drafted_no_stats, seasons, 2026) == {"rookie"}


def test_holdover_from_prior_drafts_within_window_kept():
    # Drafted last year, still no NFL snap — should remain a rookie candidate.
    drafted_no_stats = {"holdover"}
    seasons = {"holdover": 2025}
    assert recent_drafted_no_stats(drafted_no_stats, seasons, 2026) == {"holdover"}


def test_retired_pre_2019_draftee_dropped():
    # The bug from GH #488: high picks drafted before player_stats coverage.
    drafted_no_stats = {"luck", "richardson"}
    seasons = {"luck": 2012, "richardson": 2012}
    assert recent_drafted_no_stats(drafted_no_stats, seasons, 2026) == set()


def test_just_outside_window_dropped():
    drafted_no_stats = {"old"}
    seasons = {"old": 2023}
    # 2026 - 2023 = 3 > window(2)
    assert recent_drafted_no_stats(drafted_no_stats, seasons, 2026) == set()


def test_missing_draft_season_dropped():
    drafted_no_stats = {"unknown"}
    seasons = {}
    assert recent_drafted_no_stats(drafted_no_stats, seasons, 2026) == set()


def test_custom_window():
    drafted_no_stats = {"a", "b"}
    seasons = {"a": 2024, "b": 2023}
    assert recent_drafted_no_stats(drafted_no_stats, seasons, 2026, window=3) == {"a", "b"}
    assert recent_drafted_no_stats(drafted_no_stats, seasons, 2026, window=1) == set()
