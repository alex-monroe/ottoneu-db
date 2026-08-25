"""Scrape the Ottoneu finances page Calendar section into `league_calendar`.

Usage:
    venv/bin/python scripts/scrape_league_calendar.py
    venv/bin/python scripts/scrape_league_calendar.py --dry-run
    venv/bin/python scripts/scrape_league_calendar.py --file finances.html

Fetched over **plain HTTP with an honest User-Agent** — no browser, no login.
The finances page is public: it renders the Calendar section for anonymous
clients, so the FanGraphs login the Playwright version performed was both
unnecessary and the thing that broke it (see the Cloudflare note on USER_AGENT).

The finances page (https://ottoneu.fangraphs.com/football/{league_id}/finances)
has a "Calendar" section that declares the current season label and every
boundary date, marked up as `<li><strong>Label</strong> - value</li>`:

    These are the important dates for the 2026 season
    Start of Season - January 3, 2026
    Start of Arbitration - February 15, 2026
    End of Arbitration - March 31, 2026
    Keeper Deadline - July 31, 2026 11:59 PM EDT
    Auction Draft - Aug 22, 8:00 PM EDT
    Start of Regular Season - September 9, 2026
    Trade Deadline - December 1, 2026 11:59 PM EST
    Last day to start auctions - December 30, 2026
    End of Season - January 5, 2027

Note the auction date's format: an *abbreviated* month and **no year**
("Aug 22, 8:00 PM EDT"), unlike the fixed deadlines. See `_parse_date`.

We upsert one row per season label into `league_calendar`, the source of truth
for the season-cycle resolver (scripts/season.py, web/lib/season.ts).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import date, datetime

import requests
from bs4 import BeautifulSoup

from scripts.config import LEAGUE_ID, get_supabase_client

FINANCES_URL_TEMPLATE = "https://ottoneu.fangraphs.com/football/{league_id}/finances"

# An HONEST, descriptive User-Agent. Counter-intuitively, Ottoneu pages are served
# Cloudflare's *interactive* challenge (403 "Just a moment…") when a request spoofs
# a real browser UA (a "Chrome" claim with none of a browser's TLS/JS fingerprint
# reads as a bot), but a plain automated client — curl's default, python-requests,
# or a descriptive tool UA like this — passes straight through with a 200, from
# datacenter IPs (incl. GitHub-hosted runners) included. Do NOT impersonate a browser.
USER_AGENT = "ottoneu-db-calendar/1.0 (+https://github.com/alex-monroe/ottoneu-db)"
_CF_MARKERS = ("Just a moment", "cf-chl", "Enable JavaScript and cookies to continue",
               "Attention Required")
_REDIRECTS = (301, 302, 303, 307, 308)

# Ottoneu calendar label -> league_calendar column. Labels not listed here (e.g.
# "End of Season", added mid-2026) are still captured in the `raw` jsonb map, so a
# new Ottoneu label survives until someone decides it deserves a column.
LABEL_TO_COLUMN = {
    "Start of Season": "season_start",
    "Start of Arbitration": "arb_start",
    "End of Arbitration": "arb_end",
    "Keeper Deadline": "keeper_deadline",
    "Auction Draft": "auction_date",
    "Start of Regular Season": "regular_season_start",
    "Trade Deadline": "trade_deadline",
    "Last day to start auctions": "last_auction_date",
}

SEASON_HEADER_REGEX = re.compile(r"important dates for the (\d{4}) season", re.IGNORECASE)
# "January 3, 2026" / "Aug 22, 2026" — full or abbreviated month, explicit year.
_DATE_WITH_YEAR = re.compile(r"([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})")
# "Aug 22, 8:00 PM EDT" — Ottoneu omits the year on the auction date.
_DATE_NO_YEAR = re.compile(r"([A-Za-z]{3,9})\s+(\d{1,2})\s*,")
# Leading separator between label and value: "- January 3, 2026".
_LEADING_DASH = re.compile(r"^\s*[-–—]\s*")


class CloudflareBlockedError(RuntimeError):
    """Raised when the finances page returns a Cloudflare challenge instead of HTML."""


def _month_number(name: str) -> int | None:
    """Month number for a full ("January") or abbreviated ("Aug") month name."""
    for fmt in ("%B", "%b"):
        try:
            return datetime.strptime(name, fmt).month
        except ValueError:
            continue
    return None


def _parse_date(value: str, season: int | None = None) -> str | None:
    """Parse a calendar value to an ISO date, or None if unset/unparseable.

    Handles the two shapes Ottoneu emits:
      'July 31, 2026 11:59 PM EDT' -> '2026-07-31'  (explicit year)
      'Aug 22, 8:00 PM EDT'        -> '2026-08-22'  (year inferred from `season`)

    The year-less shape is what the auction date uses, and it is precisely the
    date this scraper exists to capture — an earlier regex required `, \\d{4}`
    and so silently parsed the auction date as None even when the fetch worked.
    Ottoneu's season label spans a calendar year (Jan -> Jan), so the label is
    the right year for a date printed without one.
    """
    match = _DATE_WITH_YEAR.search(value)
    if match:
        month_name, day, year = match.group(1), int(match.group(2)), int(match.group(3))
    else:
        match = _DATE_NO_YEAR.search(value)
        if not match or season is None:
            return None
        month_name, day, year = match.group(1), int(match.group(2)), season

    month = _month_number(month_name)
    if month is None:
        return None
    try:
        return date(year, month, day).isoformat()
    except ValueError:  # e.g. "February 31"
        return None


def parse_calendar(html: str) -> dict | None:
    """Parse the finances page HTML into a league_calendar row dict.

    Returns None if the Calendar section cannot be located.
    """
    soup = BeautifulSoup(html, "html.parser")

    header = None
    for node in soup.find_all(string=SEASON_HEADER_REGEX):
        header = SEASON_HEADER_REGEX.search(str(node))
        if header:
            break
    if not header:
        return None
    season = int(header.group(1))

    # Scope to the enclosing <section> so the page's nav <li>s can't leak in.
    scope = node.find_parent("section") or soup

    raw: dict[str, str] = {}
    row: dict[str, object] = {"season": season}
    for item in scope.find_all("li"):
        strong = item.find("strong")
        if not strong:
            continue
        label = strong.get_text(strip=True)
        if not label:
            continue
        # The <li> is "Label - value"; drop the label prefix and the separator.
        text = item.get_text(" ", strip=True)
        value = _LEADING_DASH.sub("", text[len(label):]).strip()
        raw[label] = value
        if label in LABEL_TO_COLUMN:
            row[LABEL_TO_COLUMN[label]] = _parse_date(value, season)

    if not raw:
        return None
    row["raw"] = raw
    return row


def fetch_finances_html(league_id: int = LEAGUE_ID, cookie: str | None = None,
                        timeout: int = 30) -> str:
    """GET the finances page, raising a clear error on a Cloudflare block or redirect.

    Sends an honest, descriptive ``USER_AGENT`` — spoofing a browser UA is what
    triggers Cloudflare's challenge, so we deliberately don't. ``cookie`` (or the
    ``OTTONEU_COOKIE`` env var) is an optional escape hatch: a raw ``Cookie``
    header to reuse a browser session, only needed if the page is ever gated.
    """
    url = FINANCES_URL_TEMPLATE.format(league_id=league_id)
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html, */*"}
    cookie = cookie or os.getenv("OTTONEU_COOKIE")
    if cookie:
        headers["Cookie"] = cookie

    resp = requests.get(url, headers=headers, timeout=timeout, allow_redirects=False)
    body = resp.text or ""

    if resp.status_code == 403 or any(m in body for m in _CF_MARKERS):
        raise CloudflareBlockedError(
            f"Cloudflare challenge (HTTP {resp.status_code}) fetching the finances "
            f"page for league {league_id}. Check the User-Agent is honest (a browser "
            "UA trips the challenge), or supply a session via OTTONEU_COOKIE."
        )
    if resp.status_code in _REDIRECTS:
        raise RuntimeError(
            f"Finances page redirected to {resp.headers.get('location')!r} — the "
            "league is likely non-public/gated (needs an authenticated session)."
        )
    resp.raise_for_status()
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape the Ottoneu league calendar.")
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse and print without writing to the database.")
    parser.add_argument("--cookie", help="Raw Cookie header for the fetch (or set OTTONEU_COOKIE).")
    parser.add_argument("--file", help="Parse a saved finances.html instead of fetching.")
    args = parser.parse_args()

    if args.file:
        print(f"Parsing saved finances page: {args.file}")
        with open(args.file, encoding="utf-8") as handle:
            html = handle.read()
    else:
        url = FINANCES_URL_TEMPLATE.format(league_id=args.league_id)
        print(f"Scraping league calendar: {url}")
        try:
            html = fetch_finances_html(args.league_id, cookie=args.cookie)
        except (requests.RequestException, RuntimeError) as exc:
            print(f"Fetch failed: {exc}", file=sys.stderr)
            sys.exit(1)

    row = parse_calendar(html)
    if row is None:
        print("Could not locate the Calendar section on the finances page.", file=sys.stderr)
        sys.exit(1)

    row["league_id"] = args.league_id
    print(f"Parsed calendar for {row['season']} season:")
    for key, value in row.items():
        if key not in ("raw", "league_id"):
            print(f"  {key}: {value}")
    unmapped = sorted(set(row["raw"]) - set(LABEL_TO_COLUMN))
    if unmapped:
        print(f"  (labels captured in raw only: {', '.join(unmapped)})")

    if args.dry_run:
        print("Dry run — not writing to the database.")
        return

    supabase = get_supabase_client()
    supabase.table("league_calendar").upsert(
        row, on_conflict="league_id,season"
    ).execute()
    print(f"Upserted league_calendar row for league {args.league_id}, season {row['season']}.")


if __name__ == "__main__":
    main()
