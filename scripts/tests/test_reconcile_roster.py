"""Tests for scripts/reconcile_roster.py — CSV parse, diff, events, and fetch guards."""

from __future__ import annotations

from datetime import date

import pytest

from scripts import reconcile_roster as rr
from scripts.reconcile_roster import (
    CloudflareBlockedError,
    Event,
    RosterRow,
    apply_reconciliation,
    build_transaction_rows,
    compute_reconciliation,
    fetch_roster_csv,
    parse_roster_csv,
)

SAMPLE_CSV = (
    '"Team ID","Team Name","Player ID","Pro Player","Player Name","Pro Team",Position(s),Salary\n'
    '2514,"The Witchcraft",11818,true,"C.J. Stroud",HOU,QB,$41\n'
    '2514,"The Witchcraft",134526,false,"Jeremiah Smith","OSU JR",WR,$11\n'
    '2531,"Other Team",9600,true,"Amon-Ra St. Brown",DET,WR,"$1,088"\n'
    ',"junk row without id",,,,,,\n'
)


# --- parse ---------------------------------------------------------------

def test_parse_roster_csv_fields_and_college_stripping():
    rows = parse_roster_csv(SAMPLE_CSV)
    assert len(rows) == 3  # junk row skipped
    by_oid = {r.ottoneu_id: r for r in rows}

    stroud = by_oid[11818]
    assert stroud.name == "C.J. Stroud"
    assert stroud.position == "QB"
    assert stroud.nfl_team == "HOU"
    assert stroud.is_college is False
    assert stroud.team == "The Witchcraft"
    assert stroud.price == 41

    smith = by_oid[134526]
    assert smith.is_college is True
    assert smith.nfl_team == "OSU"  # class-year suffix ("OSU JR") stripped

    # commas stripped from salary
    assert by_oid[9600].price == 1088


# --- compute_reconciliation ---------------------------------------------

def _scenario():
    players = [
        {"id": "u1", "ottoneu_id": 100, "name": "Unchanged Guy"},
        {"id": "u2", "ottoneu_id": 200, "name": "Traded Guy"},
        {"id": "u3", "ottoneu_id": 300, "name": "Raised Guy"},
        {"id": "u4", "ottoneu_id": 400, "name": "Cut Guy"},
        {"id": "u5", "ottoneu_id": 500, "name": "From FA Guy"},
        {"id": "u6", "ottoneu_id": 600, "name": "No Price Row Guy"},
    ]
    prices = [
        {"player_id": "u1", "price": 5, "team_name": "Team A"},
        {"player_id": "u2", "price": 10, "team_name": "Team A"},
        {"player_id": "u3", "price": 7, "team_name": "Team A"},
        {"player_id": "u4", "price": 3, "team_name": "Team A"},
        {"player_id": "u5", "price": 1, "team_name": "FA"},
        {"player_id": "u9", "price": 1, "team_name": "FA"},  # already FA, absent → not a cut
    ]
    csv_rows = [
        RosterRow(100, "Unchanged Guy", "QB", "X", False, "Team A", 5),   # unchanged
        RosterRow(200, "Traded Guy", "RB", "X", False, "Team B", 10),     # trade
        RosterRow(300, "Raised Guy", "WR", "X", False, "Team A", 9),      # price change
        RosterRow(500, "From FA Guy", "WR", "X", False, "Team A", 4),     # add (from FA)
        RosterRow(600, "No Price Row Guy", "TE", "X", False, "Team A", 6),  # add (no price row)
        RosterRow(700, "Brand New Guy", "RB", "X", False, "Team C", 2),   # create
    ]
    return players, prices, csv_rows


def test_compute_reconciliation_classification():
    players, prices, csv_rows = _scenario()
    recon = compute_reconciliation(csv_rows, players, prices)
    assert recon.unchanged == 1
    assert len(recon.ownership_changes) == 3  # trade + from-FA add + no-price-row add
    assert len(recon.price_changes) == 1
    assert len(recon.creates) == 1
    assert [lp["player_id"] for lp in recon.cuts] == ["u4"]  # u9 (FA) not a cut


def test_apply_reconciliation_events_dry_run():
    players, prices, csv_rows = _scenario()
    recon = compute_reconciliation(csv_rows, players, prices)
    events = apply_reconciliation(sb=None, recon=recon, players=players,
                                  league_id=309, dry_run=True)
    kinds = sorted(e.kind for e in events)
    assert kinds == ["add", "add", "add", "cut", "trade"]

    trade = next(e for e in events if e.kind == "trade")
    assert (trade.from_team, trade.team, trade.salary) == ("Team A", "Team B", 10)

    cut = next(e for e in events if e.kind == "cut")
    assert cut.player_id == "u4" and cut.from_team == "Team A" and cut.salary == 3

    # the brand-new player resolves to no id in dry-run
    new = next(e for e in events if e.name == "Brand New Guy")
    assert new.kind == "add" and new.player_id is None


# --- build_transaction_rows ---------------------------------------------

def test_build_transaction_rows_types_and_skips_unresolved():
    events = [
        Event("trade", "u2", "Traded Guy", "Team B", "Team A", 10),
        Event("add", "u5", "From FA Guy", "Team A", None, 4),
        Event("cut", "u4", "Cut Guy", None, "Team A", 3),
        Event("add", None, "Brand New Guy", "Team C", None, 2),  # unresolved → skipped
    ]
    rows = build_transaction_rows(events, date(2026, 7, 31), league_id=309)
    assert len(rows) == 3  # unresolved create skipped

    by_pid = {r["player_id"]: r for r in rows}
    assert by_pid["u2"]["transaction_type"] == "move (from Team A)"
    assert by_pid["u2"]["team_name"] == "Team B"
    assert by_pid["u5"]["transaction_type"] == "add"
    assert by_pid["u4"]["transaction_type"] == "cut"
    assert by_pid["u4"]["team_name"] == "Team A"  # cut recorded against the cutting team
    for r in rows:
        assert r["season"] == 2026
        assert r["transaction_date"] == "2026-07-31"
        assert r["from_team"] is None
        assert "inferred from /csv/rosters" in r["raw_description"]


# --- fetch guards --------------------------------------------------------

class _FakeResp:
    def __init__(self, status_code=200, text="", headers=None):
        self.status_code = status_code
        self.text = text
        self.headers = headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise rr.requests.HTTPError(f"HTTP {self.status_code}")


def test_fetch_cloudflare_403(monkeypatch):
    monkeypatch.setattr(rr.requests, "get",
                        lambda *a, **k: _FakeResp(403, "Just a moment..."))
    with pytest.raises(CloudflareBlockedError):
        fetch_roster_csv(309)


def test_fetch_challenge_body_on_200(monkeypatch):
    monkeypatch.setattr(rr.requests, "get",
                        lambda *a, **k: _FakeResp(200, "<html>cf-chl ...</html>"))
    with pytest.raises(CloudflareBlockedError):
        fetch_roster_csv(309)


def test_fetch_redirect_is_error(monkeypatch):
    monkeypatch.setattr(rr.requests, "get",
                        lambda *a, **k: _FakeResp(302, "", {"location": "/login"}))
    with pytest.raises(RuntimeError):
        fetch_roster_csv(309)


def test_fetch_non_csv_body_is_error(monkeypatch):
    monkeypatch.setattr(rr.requests, "get",
                        lambda *a, **k: _FakeResp(200, "<html>not a csv</html>"))
    with pytest.raises(RuntimeError):
        fetch_roster_csv(309)


def test_fetch_success_returns_body(monkeypatch):
    monkeypatch.setattr(rr.requests, "get", lambda *a, **k: _FakeResp(200, SAMPLE_CSV))
    assert fetch_roster_csv(309).startswith('"Team ID"')


def test_fetch_sends_honest_non_browser_user_agent(monkeypatch):
    # Impersonating a browser UA is what triggers Cloudflare's challenge on this
    # endpoint; an honest UA passes. Lock in that we never spoof a browser.
    captured = {}

    def fake_get(url, headers=None, **k):
        captured["headers"] = headers or {}
        return _FakeResp(200, SAMPLE_CSV)

    monkeypatch.setattr(rr.requests, "get", fake_get)
    fetch_roster_csv(309)
    ua = captured["headers"]["User-Agent"]
    assert "Mozilla" not in ua and "Chrome" not in ua and "Safari" not in ua
    assert "ottoneu-db" in ua


# --- safety floor --------------------------------------------------------

def test_reconcile_refuses_tiny_csv():
    tiny = ('"Team ID","Team Name","Player ID","Pro Player","Player Name","Pro Team",Position(s),Salary\n'
            '2514,"The Witchcraft",11818,true,"C.J. Stroud",HOU,QB,$41\n')
    with pytest.raises(RuntimeError, match="safety floor"):
        rr.reconcile(sb=None, csv_text=tiny, league_id=309,
                     apply=False, infer_transactions=False, run_date=date.today())
