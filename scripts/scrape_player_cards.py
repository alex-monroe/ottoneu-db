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

Usage::

    python scripts/scrape_player_cards.py                    # dry-run, all real ids
    python scripts/scrape_player_cards.py --apply            # write transactions
    python scripts/scrape_player_cards.py --player-id 11818 --apply
    python scripts/scrape_player_cards.py --limit 50 --apply
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

from scripts.config import LEAGUE_ID, fetch_all_rows, get_supabase_client
from scripts.transaction_dedupe import recent_purge

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


class CloudflareBlockedError(RuntimeError):
    """Raised when a card fetch returns a Cloudflare challenge instead of the page."""


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


def fetch_player_card(ottoneu_id: int, is_college: bool, league_id: int = LEAGUE_ID,
                      cookie: str | None = None, session: requests.Session | None = None,
                      timeout: int = 30) -> str | None:
    """Fetch one player card's HTML. Returns None if the card doesn't exist.

    Raises ``CloudflareBlockedError`` on a challenge. A redirect (Ottoneu 307s an
    unknown id back to the league home) means "no card for this id" → None.
    """
    level = "college" if is_college else "nfl"
    url = PLAYER_CARD_URL_TEMPLATE.format(league_id=league_id, level=level, ottoneu_id=ottoneu_id)
    headers = {"User-Agent": USER_AGENT}
    if cookie:
        headers["Cookie"] = cookie
    getter = session.get if session else requests.get
    resp = getter(url, headers=headers, timeout=timeout, allow_redirects=False)
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


def scrape_all(sb, league_id: int, apply: bool, run_date: date,
               limit: int | None = None, only_id: int | None = None,
               cookie: str | None = None, sleep: float = 0.4) -> dict:
    """Loop over DB players with a real Ottoneu id, scraping + upserting transactions."""
    players = fetch_all_rows(sb, "players", "id, ottoneu_id, name, is_college")
    targets = [p for p in players if (p.get("ottoneu_id") or 0) > 0]
    if only_id is not None:
        targets = [p for p in targets if p["ottoneu_id"] == only_id]
    if limit is not None:
        targets = targets[:limit]

    session = requests.Session()
    fetched = skipped = failed = txns_written = 0
    cf_streak = 0
    default_season = run_date.year

    for i, p in enumerate(targets):
        try:
            html = fetch_player_card(p["ottoneu_id"], bool(p.get("is_college")),
                                     league_id, cookie=cookie, session=session)
        except CloudflareBlockedError as e:
            cf_streak += 1
            failed += 1
            if cf_streak >= _CF_ABORT_STREAK:
                raise CloudflareBlockedError(
                    f"{_CF_ABORT_STREAK} consecutive Cloudflare challenges — aborting. {e}"
                ) from e
            continue
        except requests.RequestException as e:
            failed += 1
            print(f"  ! {p.get('name','?')} ({p['ottoneu_id']}): fetch error: {e}")
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
        if sleep:
            time.sleep(sleep)
        if (i + 1) % 100 == 0:
            print(f"  … {i + 1}/{len(targets)} processed")

    # This scrape is the authority on move dates. reconcile_roster runs earlier in
    # the day and files a *guessed* date for anything it cannot see history for, so
    # the same move can exist twice. Now that the real rows are in, drop the
    # inferences they supersede — this is what makes the two writers converge
    # regardless of which one ran first (see scripts/transaction_dedupe.py).
    purged = 0
    if apply:
        purged = recent_purge(sb, league_id, run_date)["deleted"]

    return {
        "targets": len(targets), "fetched": fetched, "skipped_no_card": skipped,
        "failed": failed, "transactions": txns_written, "purged_inferred": purged,
    }


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(
        description="Scrape Ottoneu player-card transaction history via HTTP (no browser).")
    parser.add_argument("--apply", action="store_true", help="Write transactions (default: dry run).")
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    parser.add_argument("--player-id", type=int, help="Scrape a single Ottoneu player id.")
    parser.add_argument("--limit", type=int, help="Cap the number of players scraped.")
    parser.add_argument("--sleep", type=float, default=0.4, help="Delay between requests (seconds).")
    parser.add_argument("--cookie", help="Optional raw Cookie header (fallback if ever challenged).")
    args = parser.parse_args(argv)

    sb = get_supabase_client()
    try:
        summary = scrape_all(sb, args.league_id, apply=args.apply, run_date=date.today(),
                             limit=args.limit, only_id=args.player_id,
                             cookie=args.cookie, sleep=args.sleep)
    except CloudflareBlockedError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    mode = "APPLIED" if args.apply else "DRY-RUN (no writes)"
    print(f"\n=== Player-card transaction scrape: {mode} ===")
    print(f"  players targeted:  {summary['targets']}")
    print(f"  cards fetched:     {summary['fetched']}")
    print(f"  no card (skipped): {summary['skipped_no_card']}")
    print(f"  fetch failures:    {summary['failed']}")
    print(f"  transactions:      {summary['transactions']}"
          + ("" if args.apply else " (dry-run — not written)"))
    print(f"  inferred dupes purged: {summary['purged_inferred']}")
    if not args.apply:
        print("\nDry-run only. Re-run with --apply to write.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
