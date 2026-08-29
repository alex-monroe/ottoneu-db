"""Tests for collapsing duplicate transactions written by the two Ottoneu writers."""

from datetime import date

import scripts.transaction_dedupe as td
from scripts.transaction_dedupe import (
    INFERRED_MARKER,
    find_superseded,
    is_inferred,
    move_key,
    purge_superseded_inferred,
)


def _real(pid, ttype, salary, team, d, rid=None):
    return {"id": rid or f"real-{pid}-{d}", "player_id": pid, "transaction_type": ttype,
            "salary": salary, "team_name": team, "transaction_date": d,
            "raw_description": f"{d} 9:26 PM | {team} | {ttype} | ${salary}"}


def _inferred(pid, ttype, salary, team, d, rid=None):
    return {"id": rid or f"inf-{pid}-{d}", "player_id": pid, "transaction_type": ttype,
            "salary": salary, "team_name": team, "transaction_date": d,
            "raw_description": f"{d} | {team} | {ttype} | ${salary} | {INFERRED_MARKER} {d}"}


def test_is_inferred_distinguishes_the_two_writers():
    assert is_inferred(_inferred("u1", "add", 3, "Team A", "2026-08-23"))
    assert not is_inferred(_real("u1", "add", 3, "Team A", "2026-08-22"))
    assert not is_inferred({"raw_description": None})


def test_move_key_ignores_the_date_it_was_filed_under():
    a = _real("u1", "add", 3, "Team A", "2026-08-22")
    b = _inferred("u1", "add", 3, "Team A", "2026-08-23")
    assert move_key(a) == move_key(b)


def test_next_day_inference_is_superseded_by_the_card_row():
    """The 2026-08-22 auction case: card row that night, inference the next morning."""
    rows = [_real("u1", "add", 47, "Irish Invasion", "2026-08-22"),
            _inferred("u1", "add", 47, "Irish Invasion", "2026-08-23")]
    assert [r["id"] for r in find_superseded(rows)] == ["inf-u1-2026-08-23"]


def test_inference_without_a_card_row_is_kept():
    """It is the only record of that move — a cut player drops out of the CSV entirely."""
    rows = [_inferred("u3", "cut", 5, "The Hard Eight", "2026-08-23")]
    assert find_superseded(rows) == []


def test_card_rows_are_never_deleted():
    rows = [_real("u1", "add", 3, "Team A", "2026-08-22"),
            _real("u1", "add", 3, "Team A", "2026-08-24")]
    assert find_superseded(rows) == []


def test_a_different_move_does_not_supersede():
    """Dedupe matches the whole move — same player at another price/team/type stays."""
    rows = [
        _real("u1", "add", 3, "Team A", "2026-08-22"),
        _inferred("u1", "add", 9, "Team A", "2026-08-23"),   # different salary
        _inferred("u1", "add", 3, "Team B", "2026-08-23"),   # different team
        _inferred("u1", "cut", 3, "Team A", "2026-08-23"),   # different type
    ]
    assert len(find_superseded(rows)) == 0


def test_card_row_after_the_inference_is_a_later_occurrence():
    """An inference is filed on/after the move, so a *later* card row is a re-add."""
    rows = [_inferred("u1", "add", 3, "Team A", "2026-08-23"),
            _real("u1", "add", 3, "Team A", "2026-08-30")]
    assert find_superseded(rows) == []


def test_card_row_outside_the_window_does_not_supersede():
    rows = [_real("u1", "add", 3, "Team A", "2026-07-01"),
            _inferred("u1", "add", 3, "Team A", "2026-08-23")]
    assert find_superseded(rows, window_days=14) == []
    assert len(find_superseded(rows, window_days=90)) == 1


def test_lagging_card_scrape_still_supersedes_within_the_window():
    """The card scrape can fail for days and catch up; the stale inference still goes."""
    rows = [_real("u1", "add", 3, "Team A", "2026-08-22"),
            _inferred("u1", "add", 3, "Team A", "2026-08-27")]
    assert len(find_superseded(rows)) == 1


def test_rows_missing_a_date_are_left_alone():
    rows = [_real("u1", "add", 3, "Team A", "2026-08-22"),
            {"id": "x", "player_id": "u1", "transaction_type": "add", "salary": 3,
             "team_name": "Team A", "transaction_date": None,
             "raw_description": f"| {INFERRED_MARKER}"}]
    assert find_superseded(rows) == []


def test_purge_dry_run_deletes_nothing(monkeypatch):
    rows = [_real("u1", "add", 3, "Team A", "2026-08-22"),
            _inferred("u1", "add", 3, "Team A", "2026-08-23"),
            _inferred("u2", "cut", 5, "Team A", "2026-08-23")]
    monkeypatch.setattr(td, "fetch_all_rows", lambda *a, **k: rows)

    class Boom:
        def table(self, *a, **k):
            raise AssertionError("dry run must not touch the table")

    summary = purge_superseded_inferred(Boom(), 309, apply=False)
    assert summary == {"scanned": 3, "inferred": 2, "superseded": 1,
                       "kept_inferred": 1, "deleted": 0, "rows": summary["rows"]}


def test_purge_apply_deletes_only_superseded_ids(monkeypatch):
    rows = [_real("u1", "add", 3, "Team A", "2026-08-22"),
            _inferred("u1", "add", 3, "Team A", "2026-08-23"),
            _inferred("u2", "cut", 5, "Team A", "2026-08-23")]
    monkeypatch.setattr(td, "fetch_all_rows", lambda *a, **k: rows)
    deleted = []

    class FakeTable:
        def delete(self):
            return self

        def in_(self, col, ids):
            assert col == "id"
            deleted.extend(ids)
            return self

        def execute(self):
            return None

    class FakeSB:
        def table(self, name):
            assert name == "transactions"
            return FakeTable()

    summary = purge_superseded_inferred(FakeSB(), 309, apply=True)
    assert deleted == ["inf-u1-2026-08-23"]
    assert summary["deleted"] == 1
    assert summary["kept_inferred"] == 1


def test_purge_scopes_the_fetch_to_the_league_and_since(monkeypatch):
    captured = {}

    def fake_fetch(sb, table, select, filters=None):
        captured["table"], captured["filters"] = table, filters
        return []

    monkeypatch.setattr(td, "fetch_all_rows", fake_fetch)
    purge_superseded_inferred(object(), 309, since="2026-08-01")
    assert captured["table"] == "transactions"
    assert ("eq", "league_id", 309) in captured["filters"]
    assert ("gte", "transaction_date", "2026-08-01") in captured["filters"]


def test_recent_purge_windows_back_from_the_run_date(monkeypatch):
    captured = {}

    def fake_fetch(sb, table, select, filters=None):
        captured["filters"] = filters
        return []

    monkeypatch.setattr(td, "fetch_all_rows", fake_fetch)
    td.recent_purge(object(), 309, date(2026, 8, 28), lookback_days=30)
    assert ("gte", "transaction_date", "2026-07-29") in captured["filters"]
