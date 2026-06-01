"""Scrape the Ottoneu finances page Calendar section into `league_calendar`.

Usage:
    venv/bin/python scripts/scrape_league_calendar.py
    venv/bin/python scripts/scrape_league_calendar.py --dry-run

Requires FANGRAPHS_USERNAME and FANGRAPHS_PASSWORD env vars (the finances page is
only visible to logged-in league members).

The finances page (https://ottoneu.fangraphs.com/football/{league_id}/finances)
has a "Calendar" section that declares the current season label and every
boundary date, e.g.:

    These are the important dates for the 2026 season
    Start of Season - January 3, 2026
    Start of Arbitration - February 15, 2026
    End of Arbitration - March 31, 2026
    Keeper Deadline - July 31, 2026 11:59 PM EDT
    Auction Draft - Draft day has not been set yet
    Start of Regular Season - September 4, 2026
    Trade Deadline - November 25, 2026 11:59 PM EST
    Last day to start auctions - December 30, 2026

We upsert one row per season label into `league_calendar`, the source of truth
for the season-cycle resolver (scripts/season.py, web/lib/season.ts).
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from datetime import datetime

from playwright.async_api import async_playwright

from scripts.config import LEAGUE_ID, get_supabase_client
from scripts.scrape_arbitration_progress import _login_to_fangraphs, _save_debug_screenshot

FINANCES_URL_TEMPLATE = "https://ottoneu.fangraphs.com/football/{league_id}/finances"

# Ottoneu calendar label -> league_calendar column.
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
# Matches "Month Day, Year" anywhere in the value (ignores trailing time/timezone).
DATE_REGEX = re.compile(r"([A-Z][a-z]+ \d{1,2}, \d{4})")


def _parse_date(value: str) -> str | None:
    """Parse 'July 31, 2026 11:59 PM EDT' -> '2026-07-31'. Returns None if unset."""
    match = DATE_REGEX.search(value)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%B %d, %Y").date().isoformat()
    except ValueError:
        return None


def parse_calendar(body_text: str) -> dict | None:
    """Parse the finances page body text into a league_calendar row dict.

    Returns None if the season header cannot be located.
    """
    header = SEASON_HEADER_REGEX.search(body_text)
    if not header:
        return None
    season = int(header.group(1))

    raw: dict[str, str] = {}
    row: dict[str, object] = {"season": season}
    for line in body_text.splitlines():
        # Split on the first dash separator (hyphen or en dash): "Label - value".
        parts = re.split(r"\s[-–]\s", line.strip(), maxsplit=1)
        if len(parts) != 2:
            continue
        label, value = parts[0].strip(), parts[1].strip()
        if label not in LABEL_TO_COLUMN:
            continue
        raw[label] = value
        row[LABEL_TO_COLUMN[label]] = _parse_date(value)

    if not raw:
        return None
    row["raw"] = raw
    return row


async def scrape_league_calendar(league_id: int) -> dict | None:
    """Scrape the finances Calendar section; returns the parsed row dict."""
    url = FINANCES_URL_TEMPLATE.format(league_id=league_id)
    print(f"Scraping league calendar: {url}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )
        page = await context.new_page()
        try:
            await _login_to_fangraphs(page, url)
            if "/finances" not in page.url:
                await page.goto(url, timeout=60000)
            await page.wait_for_timeout(2000)

            body_text = await page.inner_text("body")
            row = parse_calendar(body_text)
            if row is None:
                print("Could not locate the Calendar section on the finances page.")
                await _save_debug_screenshot(page, "finances-calendar-missing")
            return row
        finally:
            await browser.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape the Ottoneu league calendar.")
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse and print without writing to the database.")
    args = parser.parse_args()

    row = asyncio.run(scrape_league_calendar(args.league_id))
    if row is None:
        sys.exit(1)

    row["league_id"] = args.league_id
    print(f"Parsed calendar for {row['season']} season:")
    for key, value in row.items():
        if key not in ("raw", "league_id"):
            print(f"  {key}: {value}")

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
