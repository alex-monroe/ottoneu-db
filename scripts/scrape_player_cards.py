"""Scrape Ottoneu player-card transaction history over plain HTTP (no browser).

Replaces the Playwright search-page crawl. Instead of clicking around the search
page to *discover* players, we already know every Ottoneu player id from the
database (and pick up new ones from roster-CSV reconciliation), so we fetch each
player card directly and parse its **Transaction History** table:

    https://ottoneu.fangraphs.com/football/{league_id}/player_card/{nfl|college}/{id}

Writes ONLY the ``transactions`` table (real dates + types: ``add`` / ``cut`` /
``increase`` / ``move (from <team>)``). Roster/salary state comes from the CSV
reconciliation (``scripts/reconcile_roster.py``); NFL stats come from the nflverse
pulls (``pull_nfl_stats`` / ``pull_player_stats``).

Sends an HONEST, descriptive User-Agent — impersonating a browser is what trips
Cloudflare's challenge on these endpoints; a plain client passes through from
datacenter IPs (incl. GitHub-hosted runners) included (see PR #690).

Two different Cloudflare responses, handled differently:

* **403 challenge** — the client itself is refused (a spoofed UA). Waiting does not
  help; a streak of them aborts the run.
* **429 rate limit** — we asked too fast. Since 2026-10-02 Ottoneu rate-limits the
  card endpoint, so the scrape paces itself (``--sleep``), backs off and retries the
  same card on a 429, and by default in CI only fetches the cards that can have new
  history (``--recent-days``). See "Rate limiting" in
  docs/references/roster-csv-reconciliation.md.

Usage::

    python scripts/scrape_player_cards.py                    # dry-run, all real ids
    python scripts/scrape_player_cards.py --apply            # write transactions
    python scripts/scrape_player_cards.py --recent-days 14 --apply   # only recent movers
    python scripts/scrape_player_cards.py --player-id 11818 --apply
    python scripts/scrape_player_cards.py --limit 50 --apply
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from functools import partial

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

from scripts.config import LEAGUE_ID, fetch_all_rows, get_supabase_client
from scripts.transaction_dedupe import fetch_transactions, is_inferred, recent_purge
from scripts.transaction_state_machine import purge_inferred_violations

PLAYER_CARD_URL_TEMPLATE = (
    "https://ottoneu.fangraphs.com/football/{league_id}/player_card/{level}/{ottoneu_id}"
)

USER_AGENT = "ottoneu-db-player-cards/1.0 (+https://github.com/alex-monroe/ottoneu-db)"
_CF_MARKERS = ("Just a moment", "cf-chl", "Enable JavaScript and cookies to continue",
               "Attention Required")
_REDIRECTS = (301, 302, 303, 307, 308)

# Ottoneu transaction-date formats seen on the card (with and without time).
_DATE_FORMATS = ("%b %d, %Y %I:%M %p", "%b %d, %Y", "%m/%d/%Y", "%Y-%m-%d")
_NON_DIGIT = re.compile(r"[^\d]")

# Abort the whole run if the first requests all get Cloudflare-challenged — the
# endpoint is blocked and hammering it won't help.
_CF_ABORT_STREAK = 5

# --- pacing / rate limiting -------------------------------------------------
# Measured 2026-10-10 against the live endpoint (see the doc's "Rate limiting"):
# at the old 0.4s sleep (~1.2 req/s) the 31st request got a 429 and the block
# then held for ~5 minutes; at a 3s sleep (~17 req/min) 80 straight requests
# passed. A full sweep of ~1,270 cards at this pace takes about 75 minutes.
DEFAULT_SLEEP = 3.0
# A 429 carries no Retry-After, so the wait is ours to choose: start at
# _BACKOFF_BASE (the observed block length — a shorter first wait is a wasted
# request) and double per consecutive 429 on the same card, capped.
_BACKOFF_BASE = 300.0
_BACKOFF_CAP = 900.0
# Consecutive 429s on one card before giving up on the whole run. The limit is
# per client, not per card, so the next card would fare no better.
_RATE_LIMIT_RETRIES = 4
# Transient network errors (timeouts, resets) get a short retry of their own.
_NETWORK_RETRIES = 2
_NETWORK_RETRY_WAIT = 5.0

# Default window for --recent-days in CI. Matches the dedupe purge's supersede
# window: an inference older than this can no longer be replaced by a card row.
RECENT_DAYS_DEFAULT = 14

# Exit codes — distinct so a red workflow says which wall it hit.
EXIT_INCOMPLETE = 1     # some cards failed; purges skipped
EXIT_CHALLENGED = 2     # 403 challenge streak — the client is being refused
EXIT_RATE_LIMITED = 3   # 429s outlasted the backoff — asked too fast / too much


class CloudflareBlockedError(RuntimeError):
    """Raised when a card fetch returns a Cloudflare challenge instead of the page."""


class RateLimitedError(RuntimeError):
    """Raised on HTTP 429: we are being throttled, and waiting is the fix.

    Kept separate from ``CloudflareBlockedError`` even though Cloudflare serves both
    (the 429 body is the same "Just a moment…" page): a 403 means *this client* is
    refused and retrying is pointless, a 429 means *this pace* is.
    """

    def __init__(self, message: str, retry_after: float | None = None):
        super().__init__(message)
        self.retry_after = retry_after


@dataclass
class ParsedTxn:
    transaction_date: str | None  # ISO date, or None if unparseable
    season: int
    team_name: str | None
    transaction_type: str
    salary: int | None
    raw_description: str


def _clean_int(text: str) -> int | None:
    digits = _NON_DIGIT.sub("", text or "")
    return int(digits) if digits else None


def _parse_date(text: str) -> str | None:
    text = (text or "").strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_transactions(html: str, default_season: int) -> list[ParsedTxn]:
    """Parse the player card's Transaction History table.

    Identifies the table by its header row (``Transaction Type`` + ``Salary``), so
    it never picks up the stats or recent-trades tables. ``from_team`` is left null
    in the DB (the source team is encoded in the ``move (from …)`` type string, per
    the existing convention). Season is derived from the transaction year.
    """
    soup = BeautifulSoup(html, "lxml")
    for table in soup.find_all("table"):
        heads = [th.get_text(strip=True) for th in table.find_all("th")]
        if "Transaction Type" not in heads or "Salary" not in heads:
            continue
        idx = {h: i for i, h in enumerate(heads)}
        di, ti, tyi, si = (idx.get("Date"), idx.get("Team"),
                           idx["Transaction Type"], idx["Salary"])
        out: list[ParsedTxn] = []
        for tr in table.find_all("tr"):
            cells = [td.get_text(strip=True) for td in tr.find_all("td")]
            if len(cells) < len(heads):
                continue  # header/malformed row
            t_type = cells[tyi].strip()
            if not t_type:
                continue
            t_date = _parse_date(cells[di]) if di is not None else None
            team = (cells[ti].strip() or None) if ti is not None else None
            salary = _clean_int(cells[si])
            season = int(t_date[:4]) if t_date else default_season
            raw = " | ".join(cells)
            out.append(ParsedTxn(t_date, season, team, t_type, salary, raw))
        return out
    return []


def _parse_retry_after(value: str | None, now: datetime | None = None) -> float | None:
    """Seconds to wait per a ``Retry-After`` header (delta-seconds or HTTP-date)."""
    value = (value or "").strip()
    if not value:
        return None
    if value.isdigit():
        return float(value)
    try:
        when = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return max(0.0, (when - (now or datetime.now(timezone.utc))).total_seconds())


def fetch_player_card(ottoneu_id: int, is_college: bool, league_id: int = LEAGUE_ID,
                      cookie: str | None = None, session: requests.Session | None = None,
                      timeout: int = 30) -> str | None:
    """Fetch one player card's HTML. Returns None if the card doesn't exist.

    Raises ``RateLimitedError`` on a 429 and ``CloudflareBlockedError`` on a
    challenge. A redirect (Ottoneu 307s an unknown id back to the league home)
    means "no card for this id" → None.
    """
    level = "college" if is_college else "nfl"
    url = PLAYER_CARD_URL_TEMPLATE.format(league_id=league_id, level=level, ottoneu_id=ottoneu_id)
    headers = {"User-Agent": USER_AGENT}
    if cookie:
        headers["Cookie"] = cookie
    getter = session.get if session else requests.get
    # stream=True so the status is known before the body is read: Cloudflare
    # routinely truncates the 429 body, which would otherwise surface as a
    # ChunkedEncodingError and hide the rate limit behind a "network error".
    resp = getter(url, headers=headers, timeout=timeout, allow_redirects=False, stream=True)
    if resp.status_code == 429:
        retry_after = _parse_retry_after(resp.headers.get("Retry-After"))
        resp.close()
        raise RateLimitedError(
            f"Rate limited (HTTP 429) fetching card {ottoneu_id}.", retry_after=retry_after)
    body = resp.text or ""
    if resp.status_code == 403 or any(m in body for m in _CF_MARKERS):
        raise CloudflareBlockedError(
            f"Cloudflare challenge (HTTP {resp.status_code}) fetching card {ottoneu_id}. "
            "Send an honest User-Agent (don't spoof a browser); see PR #690."
        )
    if resp.status_code in _REDIRECTS or resp.status_code == 404:
        return None
    resp.raise_for_status()
    return body


def build_transaction_rows(txns: list[ParsedTxn], player_uuid: str,
                           league_id: int) -> list[dict]:
    return [{
        "player_id": player_uuid,
        "league_id": league_id,
        "season": t.season,
        "transaction_type": t.transaction_type,
        "team_name": t.team_name,
        "from_team": None,
        "salary": t.salary,
        "transaction_date": t.transaction_date,
        "raw_description": t.raw_description,
    } for t in txns]


def _upsert_transactions(sb, rows: list[dict]) -> None:
    for r in rows:
        sb.table("transactions").upsert(
            r, on_conflict="player_id, league_id, transaction_type, transaction_date, salary",
        ).execute()


def recent_target_ids(sb, league_id: int, run_date: date, days: int) -> set[str]:
    """Player uuids whose card can hold history we have not scraped yet.

    A card only gains a row when the player moves, and ``reconcile_roster`` (hourly)
    already notices every add / cut / trade and files an *inferred* transaction for
    it. Those rows are exactly the work queue: each one is a guess waiting for the
    card's real row to replace it, and the queue drains itself, because the purge at
    the end of this scrape deletes the inference once the card row is in. Players
    new to ``league_prices`` are included too, so a first-ever card is never missed
    when the inference was withheld (blast-radius ceiling, impossible move).

    Not covered, and left to the weekly full sweep: same-team salary changes
    (arbitration ``increase`` rows), which reconciliation applies to
    ``league_prices`` without filing a transaction. ``league_prices.updated_at`` is
    no help — nothing bumps it, so it always equals ``created_at``.
    """
    since = (run_date - timedelta(days=days)).isoformat()
    moved = {t["player_id"] for t in fetch_transactions(sb, league_id, since=since)
             if is_inferred(t)}
    new = {r["player_id"] for r in fetch_all_rows(
        sb, "league_prices", "id, player_id",
        filters=[("eq", "league_id", league_id), ("gte", "created_at", since)])}
    return moved | new


def _fetch_with_retries(fetch, label: str, backoff: float = _BACKOFF_BASE):
    """Call ``fetch()``, waiting out 429s and retrying transient network errors.

    A 429 is retried on the *same* card after ``Retry-After`` (if the server sends
    one) or an exponential backoff. Re-raises once the retries are spent.
    """
    rate_limited = network = 0
    while True:
        try:
            return fetch()
        except RateLimitedError as e:
            if rate_limited >= _RATE_LIMIT_RETRIES:
                raise
            wait = e.retry_after if e.retry_after is not None else backoff * 2 ** rate_limited
            wait = min(max(wait, 1.0), _BACKOFF_CAP)
            rate_limited += 1
            print(f"  ~ rate limited (HTTP 429) at {label}; waiting {wait:.0f}s "
                  f"(retry {rate_limited}/{_RATE_LIMIT_RETRIES})", flush=True)
            time.sleep(wait)
        except requests.RequestException:
            if network >= _NETWORK_RETRIES:
                raise
            network += 1
            time.sleep(_NETWORK_RETRY_WAIT)


def scrape_all(sb, league_id: int, apply: bool, run_date: date,
               limit: int | None = None, only_id: int | None = None,
               cookie: str | None = None, sleep: float = DEFAULT_SLEEP,
               recent_days: int | None = None) -> dict:
    """Loop over DB players with a real Ottoneu id, scraping + upserting transactions.

    ``recent_days`` narrows the targets to ``recent_target_ids``; ``None`` scrapes
    every player. Never raises on a block: the summary's ``aborted`` / ``exit_code``
    say how the run ended, and whatever was fetched before then is already written.
    """
    players = fetch_all_rows(sb, "players", "id, ottoneu_id, name, is_college")
    targets = [p for p in players if (p.get("ottoneu_id") or 0) > 0]
    if only_id is not None:
        targets = [p for p in targets if p["ottoneu_id"] == only_id]
    elif recent_days is not None:
        recent = recent_target_ids(sb, league_id, run_date, recent_days)
        targets = [p for p in targets if p["id"] in recent]
    if limit is not None:
        targets = targets[:limit]

    session = requests.Session()
    fetched = skipped = failed = txns_written = 0
    cf_streak = 0
    aborted: str | None = None
    exit_code = 0
    default_season = run_date.year

    for i, p in enumerate(targets):
        # Pace EVERY request, whatever the last one returned. The old loop only
        # slept after a successful card, so the moment the endpoint started
        # refusing us it was hit ~20x/second — the opposite of backing off.
        if i and sleep:
            time.sleep(sleep)
        label = f"{p.get('name', '?')} ({p['ottoneu_id']})"
        try:
            html = _fetch_with_retries(
                partial(fetch_player_card, p["ottoneu_id"], bool(p.get("is_college")),
                        league_id, cookie=cookie, session=session), label)
        except RateLimitedError as e:
            failed += 1
            aborted = (f"still rate limited after {_RATE_LIMIT_RETRIES} backoffs — aborting "
                       f"with {len(targets) - i} of {len(targets)} cards unfetched. {e}")
            exit_code = EXIT_RATE_LIMITED
            break
        except CloudflareBlockedError as e:
            cf_streak += 1
            failed += 1
            if cf_streak >= _CF_ABORT_STREAK:
                aborted = f"{_CF_ABORT_STREAK} consecutive Cloudflare challenges — aborting. {e}"
                exit_code = EXIT_CHALLENGED
                break
            continue
        except requests.RequestException as e:
            failed += 1
            print(f"  ! {label}: fetch error: {e}", flush=True)
            continue
        cf_streak = 0

        if html is None:
            skipped += 1
            continue
        fetched += 1
        rows = build_transaction_rows(parse_transactions(html, default_season), p["id"], league_id)
        txns_written += len(rows)
        if apply and rows:
            _upsert_transactions(sb, rows)
        if (i + 1) % 100 == 0:
            print(f"  … {i + 1}/{len(targets)} processed", flush=True)

    # This scrape is the authority on move dates. reconcile_roster runs earlier in
    # the day and files a *guessed* date for anything it cannot see history for, so
    # the same move can exist twice. Now that the real rows are in, drop the
    # inferences they supersede — this is what makes the two writers converge
    # regardless of which one ran first (see scripts/transaction_dedupe.py).
    #
    # Only after a COMPLETE run, though. The state-machine pass deletes an inference
    # that contradicts the card history, and a card we failed to fetch is history we
    # do not have: a real "add" looks impossible while the cut before it is still
    # sitting unscraped on the card. A skipped purge costs nothing — the inferences
    # wait, and the next clean run purges them.
    purged = impossible = 0
    unexplained: list = []
    complete = aborted is None and failed == 0
    if apply and complete:
        purged = recent_purge(sb, league_id, run_date)["deleted"]
        # Second pass, over the *whole* log rather than a window: an exact-match
        # purge only catches an inference that restates a real move, and the worse
        # failure is an inference that contradicts one — a phantom add for a player
        # who never left his roster. Replaying the state machine finds those, and
        # it has to replay from the beginning, because a player's status at any
        # moment is the sum of everything before it (scripts/transaction_state_machine.py).
        state = purge_inferred_violations(sb, league_id)
        impossible = state["deleted"]
        unexplained = state["unrepairable"]
    if not complete and not exit_code:
        exit_code = EXIT_INCOMPLETE

    return {
        "targets": len(targets), "fetched": fetched, "skipped_no_card": skipped,
        "failed": failed, "transactions": txns_written, "purged_inferred": purged,
        "purged_impossible": impossible, "unexplained": unexplained,
        "aborted": aborted, "exit_code": exit_code,
        "purges_skipped": apply and not complete,
    }


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(
        description="Scrape Ottoneu player-card transaction history via HTTP (no browser).")
    parser.add_argument("--apply", action="store_true", help="Write transactions (default: dry run).")
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    parser.add_argument("--player-id", type=int, help="Scrape a single Ottoneu player id.")
    parser.add_argument("--limit", type=int, help="Cap the number of players scraped.")
    parser.add_argument("--recent-days", type=int, metavar="N",
                        help="Only scrape players with an inferred transaction or a new "
                             "league_prices row in the last N days (default: every player).")
    parser.add_argument("--sleep", type=float, default=DEFAULT_SLEEP,
                        help=f"Delay between requests in seconds (default {DEFAULT_SLEEP}; "
                             "going faster trips Ottoneu's rate limit).")
    parser.add_argument("--cookie", help="Optional raw Cookie header (fallback if ever challenged).")
    args = parser.parse_args(argv)

    sb = get_supabase_client()
    summary = scrape_all(sb, args.league_id, apply=args.apply, run_date=date.today(),
                         limit=args.limit, only_id=args.player_id,
                         cookie=args.cookie, sleep=args.sleep,
                         recent_days=args.recent_days)

    mode = "APPLIED" if args.apply else "DRY-RUN (no writes)"
    print(f"\n=== Player-card transaction scrape: {mode} ===")
    scope = (f"moved in the last {args.recent_days}d" if args.recent_days is not None
             and args.player_id is None else "all")
    print(f"  players targeted:  {summary['targets']} ({scope})")
    print(f"  cards fetched:     {summary['fetched']}")
    print(f"  no card (skipped): {summary['skipped_no_card']}")
    print(f"  fetch failures:    {summary['failed']}")
    print(f"  transactions:      {summary['transactions']}"
          + ("" if args.apply else " (dry-run — not written)"))
    print(f"  inferred dupes purged: {summary['purged_inferred']}")
    print(f"  impossible moves purged: {summary.get('purged_impossible', 0)}")
    # A card row that breaks the state machine is Ottoneu's own history contradicting
    # itself, which means our parse or our model of the league is wrong. Never
    # deleted, always surfaced.
    for v in summary.get("unexplained", []):
        print(f"  !! card row violates the state machine: {v.day} {v.kind} "
              f"${v.salary} — {v.detail}")
    if summary["purges_skipped"]:
        print("  purges SKIPPED — the scrape was incomplete, and purging against partial "
              "card history can delete a real move. The next clean run does it.")
    if not args.apply:
        print("\nDry-run only. Re-run with --apply to write.")
    if summary["aborted"]:
        print(f"ERROR: {summary['aborted']}", file=sys.stderr)
    return summary["exit_code"]


if __name__ == "__main__":
    raise SystemExit(main())
