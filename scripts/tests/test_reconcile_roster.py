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


def test_build_transaction_rows_skips_moves_the_card_scrape_already_logged():
    """An inference dated the run day must not duplicate a real dated move.

    `scrape_player_cards` writes `transactions`; this script writes
    `league_prices`. Neither writes the other's table, so a move the card scrape
    already logged still shows up as a price diff here the next day and used to
    be filed a second time under the run date.
    """
    events = [
        Event("add", "u1", "Already Scraped", "Team A", None, 3),
        Event("trade", "u2", "Also Scraped", "Team B", "Team A", 10),
        Event("cut", "u3", "Genuinely New", None, "Team A", 5),
    ]
    already = {
        ("u1", "add", 3, "Team A"),
        ("u2", "move (from Team A)", 10, "Team B"),
    }
    rows = build_transaction_rows(events, date(2026, 8, 23), league_id=309,
                                  already_scraped=already)
    assert [r["player_id"] for r in rows] == ["u3"]


def test_build_transaction_rows_keeps_moves_differing_in_salary_or_team():
    """Dedupe matches the whole move, not just the player."""
    events = [
        Event("add", "u1", "Same Player Diff Price", "Team A", None, 7),
        Event("add", "u2", "Same Player Diff Team", "Team C", None, 3),
    ]
    already = {("u1", "add", 3, "Team A"), ("u2", "add", 3, "Team A")}
    rows = build_transaction_rows(events, date(2026, 8, 23), league_id=309,
                                  already_scraped=already)
    assert {r["player_id"] for r in rows} == {"u1", "u2"}


def test_already_scraped_ignores_previously_inferred_rows():
    """Only real card rows suppress an inference — not this script's own output.

    Otherwise the first reconciliation's rows would suppress every later one for
    the same move, and a genuine repeat would go unrecorded.
    """
    captured = {}

    def fake_fetch(sb, table, select, filters=None):
        captured["table"] = table
        captured["filters"] = filters
        return [
            {"player_id": "u1", "transaction_type": "add", "salary": 3,
             "team_name": "Team A", "raw_description": "Aug 22, 2026 9:26 PM | Team A | add | $3"},
            {"player_id": "u2", "transaction_type": "add", "salary": 4,
             "team_name": "Team B",
             "raw_description": "Aug 22, 2026 | Team B | add | $4 | "
                                "inferred from /csv/rosters reconciliation 2026-08-22"},
        ]

    original = rr.fetch_all_rows
    rr.fetch_all_rows = fake_fetch
    try:
        keys = rr._already_scraped(object(), 309, date(2026, 8, 23))
    finally:
        rr.fetch_all_rows = original

    assert keys == {("u1", "add", 3, "Team A")}
    assert captured["table"] == "transactions"
    assert ("gte", "transaction_date", "2026-08-09") in captured["filters"]


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


# --- the state-machine write guard ---------------------------------------

def test_build_transaction_rows_drops_a_phantom_add_for_an_owned_player():
    """The Jonathon Brooks case, blocked at the point of writing.

    He had sat on Tinseltown's roster since 2025-08-24. When `league_prices`
    lost his row, the CSV diff read "not owned → owned" and inferred an add.
    The card history says he never left, so the move is impossible and is not
    written; `league_prices` is still corrected either way.
    """
    events = [Event("add", "brooks", "Jonathon Brooks", "Tinseltown", None, 2)]
    rows = build_transaction_rows(events, date(2026, 7, 31), league_id=309,
                                  log_state={"brooks": "Tinseltown"})
    assert rows == []


def test_build_transaction_rows_drops_a_cut_of_a_known_free_agent():
    events = [Event("cut", "u1", "Already Gone", None, "Team A", 5)]
    rows = build_transaction_rows(events, date(2026, 8, 1), league_id=309,
                                  log_state={"u1": "FA"})
    assert rows == []


def test_build_transaction_rows_drops_a_trade_out_of_a_team_that_lost_him():
    """A stale price row names the wrong origin; a wrong trade is worse than a gap."""
    events = [Event("trade", "u1", "Swift", "The Roseman Empire", "Irish Invasion", 32)]
    rows = build_transaction_rows(events, date(2026, 7, 31), league_id=309,
                                  log_state={"u1": "The Roseman Empire"})
    assert rows == []


def test_build_transaction_rows_writes_genuinely_new_moves():
    """The guard rejects the impossible, not the merely recent."""
    events = [
        Event("add", "u1", "Real Add", "Team A", None, 3),        # log says FA
        Event("cut", "u2", "Real Cut", None, "Team B", 5),        # log says Team B
        Event("trade", "u3", "Real Trade", "Team C", "Team B", 9),  # log says Team B
        Event("add", "u4", "Unknown To The Log", "Team A", None, 1),
    ]
    rows = build_transaction_rows(
        events, date(2026, 8, 23), league_id=309,
        log_state={"u1": "FA", "u2": "Team B", "u3": "Team B"})
    assert {r["player_id"] for r in rows} == {"u1", "u2", "u3", "u4"}


def test_build_transaction_rows_without_a_log_state_is_unchanged():
    """No history to check against must not mean "reject everything"."""
    events = [Event("add", "u1", "Someone", "Team A", None, 3)]
    assert len(build_transaction_rows(events, date(2026, 8, 23), league_id=309)) == 1


# --- blast-radius ceiling -------------------------------------------------

def _wide_csv(n_players: int) -> str:
    header = ('"Team ID","Team Name","Player ID","Pro Player","Player Name",'
              '"Pro Team",Position(s),Salary\n')
    lines = [f'{2500 + (i % 12)},"Team {i % 12}",{20000 + i},true,"Player {i}",HOU,QB,$1'
             for i in range(n_players)]
    return header + "\n".join(lines) + "\n"


def test_reconcile_withholds_inference_when_the_diff_is_league_wide(monkeypatch):
    """80 phantom moves in one run is a desync, not a day of trading.

    Ownership is still reconciled — only the fabricated history is withheld.
    """
    csv_text = _wide_csv(120)
    monkeypatch.setattr(rr, "fetch_all_rows", lambda *a, **k: [])
    monkeypatch.setattr(rr, "_already_scraped", lambda *a, **k: set())
    monkeypatch.setattr(rr, "_log_state", lambda *a, **k: {})
    written = []
    monkeypatch.setattr(rr, "_write_transactions", lambda sb, rows: written.extend(rows))
    monkeypatch.setattr(rr, "_resolve_or_create_player", lambda sb, row: f"p{row.ottoneu_id}")
    monkeypatch.setattr(rr, "_upsert_price", lambda *a, **k: None)

    summary = rr.reconcile(sb=object(), csv_text=csv_text, league_id=309, apply=True,
                           infer_transactions=True, run_date=date(2026, 7, 31))

    assert summary["inference_withheld"] is True
    assert summary["transactions_written"] == 0
    assert written == []
    assert summary["adds"] == 120  # league_prices was still reconciled


def test_reconcile_writes_inference_below_the_ceiling(monkeypatch):
    csv_text = _wide_csv(120)
    players = [{"id": f"p{20000 + i}", "ottoneu_id": 20000 + i, "name": f"Player {i}"}
               for i in range(120)]
    # All but three already priced on the right team → only three inferred moves.
    prices = [{"player_id": f"p{20000 + i}", "price": 1, "team_name": f"Team {i % 12}"}
              for i in range(3, 120)]

    def fake_fetch(sb, table, select, filters=None):
        return players if table == "players" else prices

    monkeypatch.setattr(rr, "fetch_all_rows", fake_fetch)
    monkeypatch.setattr(rr, "_already_scraped", lambda *a, **k: set())
    monkeypatch.setattr(rr, "_log_state", lambda *a, **k: {})
    written = []
    monkeypatch.setattr(rr, "_write_transactions", lambda sb, rows: written.extend(rows))
    monkeypatch.setattr(rr, "_upsert_price", lambda *a, **k: None)

    summary = rr.reconcile(sb=object(), csv_text=csv_text, league_id=309, apply=True,
                           infer_transactions=True, run_date=date(2026, 8, 23))

    assert summary["inference_withheld"] is False
    assert len(written) == 3
