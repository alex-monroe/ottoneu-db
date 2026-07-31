"""Tests for scripts/scrape_player_cards.py — transaction parse + fetch guards."""

from __future__ import annotations

import pytest

from scripts import scrape_player_cards as spc
from scripts.scrape_player_cards import (
    CloudflareBlockedError,
    build_transaction_rows,
    fetch_player_card,
    parse_transactions,
)

# A card with three tables: season stats, transaction history, recent trades. The
# parser must pick the transaction-history table by its headers only.
CARD_HTML = """
<html><body>
<h2>C.J. Stroud</h2>
<table><tr><th>Season</th><th>Team</th><th>PassYD</th><th>Points</th></tr>
       <tr><td>2025</td><td>HOU</td><td>3800</td><td>240.5</td></tr></table>
<table>
  <tr><th>Date</th><th>Team</th><th>Transaction Type</th><th>Salary</th></tr>
  <tr><td>Aug 24, 2025 8:13 PM</td><td>The Hard Eight</td><td>add</td><td>$34</td></tr>
  <tr><td>Dec 6, 2025 10:47 PM</td><td>The Hard Eight</td><td>cut</td><td>$17</td></tr>
  <tr><td>Jul 30, 2026 1:00 PM</td><td>Irish Invasion</td><td>move (from The Roseman Empire)</td><td>$1,088</td></tr>
  <tr><td></td><td></td><td></td></tr>
</table>
<table><tr><th>Date</th><th>Proposing Team</th><th>Accepting Team</th></tr>
       <tr><td>Jul 30, 2026</td><td>A</td><td>B</td></tr></table>
</body></html>
"""


def test_parse_transactions_picks_right_table_and_fields():
    txns = parse_transactions(CARD_HTML, default_season=2026)
    assert len(txns) == 3  # malformed 3-cell row skipped; stats/trades tables ignored

    add, cut, move = txns
    assert (add.transaction_type, add.team_name, add.salary) == ("add", "The Hard Eight", 34)
    assert add.transaction_date == "2025-08-24" and add.season == 2025

    assert cut.transaction_type == "cut" and cut.salary == 17

    assert move.transaction_type == "move (from The Roseman Empire)"
    assert move.team_name == "Irish Invasion"
    assert move.salary == 1088  # comma stripped
    assert move.transaction_date == "2026-07-30" and move.season == 2026


def test_parse_transactions_no_table():
    assert parse_transactions("<html><body>no tables here</body></html>", 2026) == []


def test_build_transaction_rows_schema():
    txns = parse_transactions(CARD_HTML, default_season=2026)
    rows = build_transaction_rows(txns, player_uuid="uuid-1", league_id=309)
    r = rows[0]
    assert r["player_id"] == "uuid-1" and r["league_id"] == 309
    assert r["from_team"] is None  # source team encoded in the type string, per convention
    assert r["transaction_type"] == "add"
    assert "|" in r["raw_description"]


# --- fetch guards --------------------------------------------------------

class _FakeResp:
    def __init__(self, status_code=200, text="", headers=None):
        self.status_code = status_code
        self.text = text
        self.headers = headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise spc.requests.HTTPError(f"HTTP {self.status_code}")


def test_fetch_cloudflare_raises(monkeypatch):
    monkeypatch.setattr(spc.requests, "get", lambda *a, **k: _FakeResp(403, "Just a moment..."))
    with pytest.raises(CloudflareBlockedError):
        fetch_player_card(11818, is_college=False)


def test_fetch_redirect_returns_none(monkeypatch):
    # Ottoneu 307s an unknown id back to the league home — treat as "no card".
    monkeypatch.setattr(spc.requests, "get", lambda *a, **k: _FakeResp(307, "", {"location": "/football/309/"}))
    assert fetch_player_card(999999, is_college=False) is None


def test_fetch_success_returns_body(monkeypatch):
    monkeypatch.setattr(spc.requests, "get", lambda *a, **k: _FakeResp(200, CARD_HTML))
    assert "Transaction Type" in fetch_player_card(11818, is_college=False)


def test_fetch_uses_college_path_for_college_players(monkeypatch):
    seen = {}

    def fake_get(url, **k):
        seen["url"] = url
        return _FakeResp(200, CARD_HTML)

    monkeypatch.setattr(spc.requests, "get", fake_get)
    fetch_player_card(134526, is_college=True, league_id=309)
    assert "/player_card/college/134526" in seen["url"]
    fetch_player_card(11818, is_college=False, league_id=309)
    assert "/player_card/nfl/11818" in seen["url"]


def test_fetch_sends_honest_non_browser_ua(monkeypatch):
    seen = {}

    def fake_get(url, headers=None, **k):
        seen["ua"] = (headers or {}).get("User-Agent", "")
        return _FakeResp(200, CARD_HTML)

    monkeypatch.setattr(spc.requests, "get", fake_get)
    fetch_player_card(11818, is_college=False)
    assert "Mozilla" not in seen["ua"] and "Chrome" not in seen["ua"]
    assert "ottoneu-db" in seen["ua"]
