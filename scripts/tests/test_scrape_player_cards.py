"""Tests for scripts/scrape_player_cards.py — parse, fetch guards, pacing/backoff."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from scripts import scrape_player_cards as spc
from scripts.scrape_player_cards import (
    CloudflareBlockedError,
    RateLimitedError,
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
        self.closed = False

    def close(self):
        self.closed = True

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


# --- rate limiting (HTTP 429) -------------------------------------------

class _TruncatedBodyResp(_FakeResp):
    """A 429 whose body cannot be read — Cloudflare routinely cuts it short."""

    @property
    def text(self):
        raise spc.requests.exceptions.ChunkedEncodingError("IncompleteRead")

    @text.setter
    def text(self, value):
        pass


def test_fetch_429_is_a_rate_limit_not_a_challenge(monkeypatch):
    # The real 429 body IS the "Just a moment..." page, so status must win over
    # the body markers — otherwise it is misfiled as an unrecoverable challenge.
    monkeypatch.setattr(spc.requests, "get",
                        lambda *a, **k: _FakeResp(429, "Just a moment...", {"Retry-After": "90"}))
    with pytest.raises(RateLimitedError) as exc:
        fetch_player_card(7184, is_college=False)
    assert exc.value.retry_after == 90.0
    assert not isinstance(exc.value, CloudflareBlockedError)


def test_fetch_429_does_not_read_the_body(monkeypatch):
    resp = _TruncatedBodyResp(429)
    seen = {}

    def fake_get(url, **k):
        seen.update(k)
        return resp

    monkeypatch.setattr(spc.requests, "get", fake_get)
    with pytest.raises(RateLimitedError) as exc:
        fetch_player_card(7184, is_college=False)
    assert exc.value.retry_after is None  # what Ottoneu actually sends: no header
    assert seen["stream"] is True and resp.closed


@pytest.mark.parametrize("value,expected", [
    ("120", 120.0),
    ("0", 0.0),
    ("Sat, 10 Oct 2026 05:00:30 GMT", 30.0),
    ("Sat, 10 Oct 2026 04:00:00 GMT", 0.0),  # already past → no negative wait
    ("soon", None),
    ("", None),
    (None, None),
])
def test_parse_retry_after(value, expected):
    now = datetime(2026, 10, 10, 5, 0, 0, tzinfo=timezone.utc)
    assert spc._parse_retry_after(value, now=now) == expected


@pytest.fixture
def sleeps(monkeypatch):
    """Record every sleep instead of taking it."""
    taken: list[float] = []
    monkeypatch.setattr(spc.time, "sleep", taken.append)
    return taken


def _scripted(outcomes):
    """A fetch() that plays back ``outcomes`` (exceptions are raised)."""
    queue = list(outcomes)

    def fetch(*a, **k):
        out = queue.pop(0)
        if isinstance(out, Exception):
            raise out
        return out

    return fetch


def test_retries_back_off_exponentially_then_succeed(sleeps):
    fetch = _scripted([RateLimitedError("429"), RateLimitedError("429"), CARD_HTML])
    assert spc._fetch_with_retries(fetch, "x", backoff=10) == CARD_HTML
    assert sleeps == [10, 20]


def test_retries_honor_retry_after_and_cap_it(sleeps):
    fetch = _scripted([RateLimitedError("429", retry_after=42),
                       RateLimitedError("429", retry_after=10 ** 6), CARD_HTML])
    spc._fetch_with_retries(fetch, "x", backoff=10)
    assert sleeps == [42, spc._BACKOFF_CAP]


def test_retries_give_up_after_the_limit(sleeps):
    fetch = _scripted([RateLimitedError("429")] * (spc._RATE_LIMIT_RETRIES + 1))
    with pytest.raises(RateLimitedError):
        spc._fetch_with_retries(fetch, "x", backoff=1)
    assert len(sleeps) == spc._RATE_LIMIT_RETRIES


def test_retries_transient_network_errors(sleeps):
    boom = spc.requests.ConnectionError("reset")
    assert spc._fetch_with_retries(_scripted([boom, CARD_HTML]), "x") == CARD_HTML
    with pytest.raises(spc.requests.ConnectionError):
        spc._fetch_with_retries(_scripted([boom] * (spc._NETWORK_RETRIES + 1)), "x")


# --- scrape_all ----------------------------------------------------------

PLAYERS = [
    {"id": f"uuid-{n}", "ottoneu_id": 1000 + n, "name": f"P{n}", "is_college": False}
    for n in range(1, 9)
] + [{"id": "uuid-neg", "ottoneu_id": -5, "name": "Placeholder", "is_college": False}]


@pytest.fixture
def harness(monkeypatch, sleeps):
    """scrape_all with the DB and the network replaced; returns the call log."""
    log = {"upserts": [], "purges": [], "sleeps": sleeps, "fetched_ids": [],
           "inferred": [], "new_prices": []}

    def fake_rows(sb, table, select="*", filters=None, **k):
        return PLAYERS if table == "players" else log["new_prices"]

    monkeypatch.setattr(spc, "fetch_all_rows", fake_rows)
    monkeypatch.setattr(spc, "fetch_transactions", lambda sb, lid, since=None: log["inferred"])
    monkeypatch.setattr(spc, "_upsert_transactions", lambda sb, rows: log["upserts"].append(rows))
    monkeypatch.setattr(spc, "recent_purge",
                        lambda *a, **k: log["purges"].append("dedupe") or {"deleted": 2})
    monkeypatch.setattr(spc, "purge_inferred_violations",
                        lambda *a, **k: log["purges"].append("state") or
                        {"deleted": 1, "unrepairable": []})

    def use(fetch):
        def recording(ottoneu_id, *a, **k):
            log["fetched_ids"].append(ottoneu_id)
            return fetch(ottoneu_id)
        monkeypatch.setattr(spc, "fetch_player_card", recording)

    log["use"] = use
    return log


def _run(**kw):
    return spc.scrape_all(object(), 309, apply=True, run_date=date(2026, 10, 10), **kw)


def test_scrape_all_clean_run_purges(harness):
    harness["use"](lambda oid: CARD_HTML)
    summary = _run(sleep=3)
    assert summary["fetched"] == 8 and summary["exit_code"] == 0
    assert summary["aborted"] is None and not summary["purges_skipped"]
    assert harness["purges"] == ["dedupe", "state"]
    assert harness["sleeps"] == [3] * 7  # between requests, not before the first


def test_scrape_all_paces_after_failures_too(harness):
    # The outage's amplifier: the old loop slept only after a success, so a
    # refused request was followed instantly by the next one.
    def fetch(oid):
        if oid % 2:
            raise CloudflareBlockedError("403")
        return None  # no card

    harness["use"](fetch)
    _run(sleep=3)
    assert harness["sleeps"] == [3] * 7


def test_scrape_all_waits_out_a_429_and_retries_the_same_card(harness):
    hits: dict[int, int] = {}

    def fetch(oid):
        hits[oid] = hits.get(oid, 0) + 1
        if oid == 1003 and hits[oid] == 1:
            raise RateLimitedError("429")
        return CARD_HTML

    harness["use"](fetch)
    summary = _run(sleep=3)
    assert hits[1003] == 2 and summary["fetched"] == 8  # nothing skipped
    assert summary["failed"] == 0 and summary["exit_code"] == 0
    assert spc._BACKOFF_BASE in harness["sleeps"]
    assert harness["purges"] == ["dedupe", "state"]


def test_scrape_all_persistent_429_aborts_keeps_progress_skips_purges(harness):
    def fetch(oid):
        if oid >= 1004:
            raise RateLimitedError("Rate limited (HTTP 429) fetching card 1004.")
        return CARD_HTML

    harness["use"](fetch)
    summary = _run(sleep=3)
    assert summary["exit_code"] == spc.EXIT_RATE_LIMITED
    assert "5 of 8 cards unfetched" in summary["aborted"]
    assert summary["fetched"] == 3 and len(harness["upserts"]) == 3  # progress kept
    assert harness["purges"] == [] and summary["purges_skipped"]
    assert max(harness["fetched_ids"]) == 1004  # stopped; did not march on to 1005+


def test_scrape_all_403_streak_aborts_with_its_own_exit_code(harness):
    def fetch(oid):
        raise CloudflareBlockedError("Cloudflare challenge (HTTP 403)")

    harness["use"](fetch)
    summary = _run(sleep=0)
    assert summary["exit_code"] == spc.EXIT_CHALLENGED
    assert len(harness["fetched_ids"]) == spc._CF_ABORT_STREAK
    assert harness["purges"] == []


def test_scrape_all_failed_card_skips_purges(harness):
    def fetch(oid):
        if oid == 1002:
            raise spc.requests.ConnectionError("reset")
        return CARD_HTML

    harness["use"](fetch)
    summary = _run(sleep=0)
    assert summary["failed"] == 1 and summary["fetched"] == 7
    assert summary["exit_code"] == spc.EXIT_INCOMPLETE and harness["purges"] == []


def test_scrape_all_recent_days_targets_only_movers(harness):
    marker = spc_inferred_marker()
    harness["inferred"] = [
        {"player_id": "uuid-2", "raw_description": f"cut | {marker} 2026-10-07"},
        {"player_id": "uuid-5", "raw_description": "Oct 7, 2026 | Team | add | $3"},  # card row
    ]
    harness["new_prices"] = [{"id": "lp-1", "player_id": "uuid-7"}]
    harness["use"](lambda oid: CARD_HTML)
    summary = _run(sleep=0, recent_days=14)
    assert sorted(harness["fetched_ids"]) == [1002, 1007]
    assert summary["targets"] == 2 and harness["purges"] == ["dedupe", "state"]


def test_scrape_all_player_id_overrides_recent_days(harness):
    harness["use"](lambda oid: CARD_HTML)
    _run(sleep=0, recent_days=14, only_id=1004)
    assert harness["fetched_ids"] == [1004]


def spc_inferred_marker() -> str:
    from scripts.transaction_dedupe import INFERRED_MARKER
    return INFERRED_MARKER


def test_recent_target_ids_queries_the_window(monkeypatch):
    seen = {}

    def fake_txns(sb, league_id, since=None):
        seen["txn_since"] = since
        return []

    def fake_rows(sb, table, select="*", filters=None, **k):
        seen["table"], seen["filters"] = table, filters
        return []

    monkeypatch.setattr(spc, "fetch_transactions", fake_txns)
    monkeypatch.setattr(spc, "fetch_all_rows", fake_rows)
    assert spc.recent_target_ids(object(), 309, date(2026, 10, 10), 14) == set()
    assert seen["txn_since"] == "2026-09-26" and seen["table"] == "league_prices"
    assert ("gte", "created_at", "2026-09-26") in seen["filters"]
