"""Tests for scripts.config.fetch_all_rows paging: stable order + overlap backstop."""

from __future__ import annotations

from scripts.config import fetch_all_rows


class _FakeQuery:
    """Chainable stand-in for a supabase-py query that serves fixed pages.

    `pages` maps a range start offset to the rows that request returns, so a
    test can hand back overlapping pages the way an unordered read does.
    """

    def __init__(self, pages: dict[int, list[dict]], calls: list):
        self._pages = pages
        self._calls = calls
        self._start = 0

    def select(self, *_a):
        return self

    def eq(self, *a):
        self._calls.append(("eq", *a))
        return self

    def order(self, column):
        self._calls.append(("order", column))
        return self

    def range(self, start, _end):
        self._start = start
        return self

    def execute(self):
        return type("Resp", (), {"data": self._pages.get(self._start, [])})()


class _FakeClient:
    def __init__(self, pages):
        self.pages = pages
        self.calls: list = []

    def table(self, _name):
        return _FakeQuery(self.pages, self.calls)


def _rows(ids):
    return [{"id": i, "name": f"p{i}"} for i in ids]


def test_orders_every_page_by_id():
    client = _FakeClient({0: _rows(range(1000)), 1000: _rows(range(1000, 1200))})
    rows = fetch_all_rows(client, "players", "id, name", page_size=1000)
    assert len(rows) == 1200
    assert client.calls.count(("order", "id")) == 2


def test_overlapping_pages_are_deduped_and_reported(capsys):
    # Page 2 repeats 50 rows from page 1: what an unstable order produces.
    client = _FakeClient({0: _rows(range(1000)), 1000: _rows(range(950, 1100))})
    rows = fetch_all_rows(client, "players", "id, name", page_size=1000)
    assert [r["id"] for r in rows] == list(range(1100))
    assert "50 duplicate id(s)" in capsys.readouterr().err


def test_rows_without_id_pass_through_untouched(capsys):
    client = _FakeClient({0: [{"name": "a"}, {"name": "a"}]})
    rows = fetch_all_rows(client, "players", "name", page_size=1000)
    assert len(rows) == 2
    assert capsys.readouterr().err == ""
