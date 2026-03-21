"""Scrape the Ottoneu arbitration progress page for current allocations and team status.

Usage:
    venv/bin/python scripts/scrape_arbitration_progress.py
    venv/bin/python scripts/scrape_arbitration_progress.py --season 2025 --league-id 309

Scrapes https://ottoneu.fangraphs.com/football/{league_id}/arbitration and stores:
  - Per-player allocation data (current salary, raise amount, new salary)
  - Per-team completion status (complete vs incomplete)

The arbitration page shows "Current Allocations" and "Teams with Incomplete Arbitration"
tables only after teams begin submitting their allocations. Before that, only team names
from the standings are captured so the web page can show all teams as "pending".
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
import os

from playwright.async_api import async_playwright

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.config import LEAGUE_ID, SEASON, get_supabase_client

ARB_URL_TEMPLATE = "https://ottoneu.fangraphs.com/football/{league_id}/arbitration"
NON_DIGIT_REGEX = re.compile(r"[^\d]")
ID_END_REGEX = re.compile(r"(\d+)$")


async def scrape_arbitration_progress(league_id: int, season: int):
    """Scrape the arbitration page and upsert results into Supabase."""
    supabase = get_supabase_client()
    url = ARB_URL_TEMPLATE.format(league_id=league_id)

    print(f"Scraping arbitration progress: {url}")

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
            await page.goto(url, timeout=60000)
            # Wait for real content past Cloudflare challenge
            await page.wait_for_selector("table", timeout=30000)
            await page.wait_for_timeout(2000)

            # Scrape all data
            allocations = await _scrape_allocations(page, league_id, season)
            incomplete_teams = await _scrape_incomplete_teams(page)
            all_team_names = _scrape_standings_teams(await page.content())

            print(f"Found {len(allocations)} player allocations")
            print(f"Found {len(incomplete_teams)} incomplete teams")
            print(f"Found {len(all_team_names)} total teams from standings")

            # Determine complete teams: if we found an "incomplete" section,
            # teams NOT in that list are complete. If no incomplete section exists,
            # we don't know completion status yet — mark all as unknown (not complete).
            has_arb_data = len(allocations) > 0 or len(incomplete_teams) > 0

            # Clear old data for this league/season and insert fresh
            supabase.table("arbitration_progress").delete().eq(
                "league_id", league_id
            ).eq("season", season).execute()

            if allocations:
                supabase.table("arbitration_progress").insert(allocations).execute()
                print(f"Inserted {len(allocations)} allocation rows")

            # Build team completion status
            team_rows = []
            if has_arb_data:
                # We have arb data — teams not in incomplete list are complete
                complete_teams = all_team_names - incomplete_teams
                for team in complete_teams:
                    team_rows.append({
                        "league_id": league_id,
                        "season": season,
                        "team_name": team,
                        "is_complete": True,
                    })
                for team in incomplete_teams:
                    team_rows.append({
                        "league_id": league_id,
                        "season": season,
                        "team_name": team,
                        "is_complete": False,
                    })
            else:
                # No arb data yet — all teams are pending (not complete)
                for team in all_team_names:
                    team_rows.append({
                        "league_id": league_id,
                        "season": season,
                        "team_name": team,
                        "is_complete": False,
                    })

            if team_rows:
                supabase.table("arbitration_progress_teams").delete().eq(
                    "league_id", league_id
                ).eq("season", season).execute()
                supabase.table("arbitration_progress_teams").insert(team_rows).execute()
                print(f"Inserted {len(team_rows)} team status rows")

            # Scrape the arbitration deadline
            deadline = await _scrape_deadline(page)
            if deadline:
                print(f"Arbitration deadline: {deadline}")

            print("Done!")
            return {
                "allocations": len(allocations),
                "teams": len(team_rows),
                "deadline": deadline,
            }

        except Exception as e:
            print(f"Error scraping arbitration progress: {e}")
            raise
        finally:
            await browser.close()


async def _scrape_deadline(page) -> str | None:
    """Extract the arbitration deadline text (e.g. 'March 31, 2026')."""
    body_text = await page.inner_text("body")
    match = re.search(r"Arbitration ends on (.+?)(?:\n|$)", body_text)
    if match:
        return match.group(1).strip()
    return None


async def _scrape_allocations(page, league_id: int, season: int) -> list[dict]:
    """Parse the Current Allocations table.

    This table appears on the arbitration page once teams start submitting
    allocations. It shows each player who has received raises, their current
    salary, total raise amount, and new salary.
    """
    allocations = []

    # Find all tables and look for one with allocation-related headers
    tables = await page.query_selector_all("table")

    for table in tables:
        headers = await table.query_selector_all("th")
        header_texts = []
        for h in headers:
            text = await h.inner_text()
            header_texts.append(text.strip().lower())

        # Skip non-allocation tables
        # Allocation table has "raise" or ("salary" + "new") in headers
        # Exclude known non-allocation tables
        if header_texts == ["team", "record", "pf", "pa"]:
            continue  # standings
        if header_texts == ["player", "end time", "min. bid"]:
            continue  # auctions
        if header_texts == ["player", "salary", "cut date"]:
            continue  # waivers
        if header_texts == ["date", "team", "player", "transaction"]:
            continue  # transactions

        has_raise = any("raise" in h for h in header_texts)
        has_allocation = any("allocation" in h for h in header_texts)
        has_player_and_salary = (
            any("player" in h for h in header_texts) and
            any("salary" in h for h in header_texts)
        )

        if not (has_raise or has_allocation or has_player_and_salary):
            continue

        print(f"Found allocations table with headers: {header_texts}")

        rows = await table.query_selector_all("tbody tr")
        for row in rows:
            cells = await row.query_selector_all("td")
            if len(cells) < 2:
                continue

            try:
                allocation = await _parse_allocation_row(
                    cells, header_texts, league_id, season
                )
                if allocation:
                    allocations.append(allocation)
            except Exception as e:
                print(f"  Warning: Could not parse row: {e}")
                continue

    return allocations


async def _parse_allocation_row(
    cells, header_texts: list[str], league_id: int, season: int
) -> dict | None:
    """Parse a single row from the allocations table."""
    cell_texts = []
    for cell in cells:
        text = await cell.inner_text()
        cell_texts.append(text.strip())

    player_name = None
    ottoneu_id = None
    team_name = None
    current_salary = None
    raise_amount = None
    new_salary = None

    # Map headers to cell values
    for i, header in enumerate(header_texts):
        if i >= len(cell_texts):
            break
        val = cell_texts[i]

        if "player" in header or "name" in header:
            player_name = val
            link = await cells[i].query_selector("a")
            if link:
                href = await link.get_attribute("href")
                if href:
                    m = ID_END_REGEX.search(href)
                    if m:
                        ottoneu_id = int(m.group(1))
                player_name = (await link.inner_text()).strip()
        elif header in ("team", "owner", "fantasy team"):
            team_name = val
        elif header in ("salary", "current salary", "current sal"):
            current_salary = _parse_dollar(val)
        elif "raise" in header or "increase" in header:
            raise_amount = _parse_dollar(val)
        elif "new" in header and "salary" in header:
            new_salary = _parse_dollar(val)

    # Positional fallback: Player | Team? | Salary | Raise | New Salary
    if player_name is None and len(cell_texts) >= 2:
        player_name = cell_texts[0]
        link = await cells[0].query_selector("a")
        if link:
            href = await link.get_attribute("href")
            if href:
                m = ID_END_REGEX.search(href)
                if m:
                    ottoneu_id = int(m.group(1))
            player_name = (await link.inner_text()).strip()

    if not player_name:
        return None

    # Positional fallback for dollar columns
    if raise_amount is None:
        dollar_cols = []
        for val in cell_texts[1:]:
            d = _parse_dollar(val)
            if d is not None:
                dollar_cols.append(d)
        if len(dollar_cols) >= 3:
            current_salary, raise_amount, new_salary = dollar_cols[0], dollar_cols[1], dollar_cols[2]
        elif len(dollar_cols) == 2:
            current_salary, raise_amount = dollar_cols[0], dollar_cols[1]
        elif len(dollar_cols) == 1:
            raise_amount = dollar_cols[0]

    return {
        "league_id": league_id,
        "season": season,
        "player_name": player_name,
        "ottoneu_id": ottoneu_id,
        "team_name": team_name,
        "current_salary": current_salary,
        "raise_amount": raise_amount or 0,
        "new_salary": new_salary,
    }


async def _scrape_incomplete_teams(page) -> set[str]:
    """Parse the Teams with Incomplete Arbitration section.

    Looks for a heading containing 'incomplete' and extracts team names
    from lists, tables, or links in the section that follows it.
    """
    incomplete = set()

    headings = await page.query_selector_all("h1, h2, h3, h4, h5, h6")
    for heading in headings:
        text = await heading.inner_text()
        if "incomplete" not in text.lower():
            continue

        # Search siblings and parent for team names
        # Try: next sibling elements (table, list, or div with links)
        siblings = await heading.evaluate_handle(
            """el => {
                const items = [];
                let sib = el.nextElementSibling;
                // Collect up to 3 siblings after the heading
                for (let i = 0; i < 3 && sib; i++) {
                    items.push(sib);
                    sib = sib.nextElementSibling;
                }
                return items;
            }"""
        )

        # Also check parent container
        parent = await heading.evaluate_handle("el => el.parentElement")

        for container in [parent]:
            # List items
            items = await container.query_selector_all("li")
            for item in items:
                team = (await item.inner_text()).strip()
                if team:
                    incomplete.add(team)

            # Table rows
            table = await container.query_selector("table")
            if table:
                rows = await table.query_selector_all("tbody tr, tr")
                for row in rows:
                    cells = await row.query_selector_all("td, th")
                    if cells:
                        team = (await cells[0].inner_text()).strip()
                        if team:
                            incomplete.add(team)

            # Links
            if not incomplete:
                links = await container.query_selector_all("a")
                for link in links:
                    team = (await link.inner_text()).strip()
                    if team and team not in ("", "#"):
                        incomplete.add(team)

    return incomplete


def _scrape_standings_teams(html_content: str) -> set[str]:
    """Extract team names from the standings table in the page HTML.

    Parses links that point to team pages (e.g. /football/309/teamXXX).
    """
    teams = set()
    # Match team links: <a href="/football/{id}/team...">Team Name</a>
    pattern = re.compile(
        r'<a[^>]*href="[^"]*?/football/\d+/team[^"]*"[^>]*>([^<]+)</a>',
        re.IGNORECASE,
    )
    for match in pattern.finditer(html_content):
        name = match.group(1).strip()
        if name:
            teams.add(name)
    return teams


def _parse_dollar(text: str) -> int | None:
    """Parse a dollar amount like '$5' or '$12' into an integer."""
    if not text or "$" not in text:
        return None
    clean = NON_DIGIT_REGEX.sub("", text)
    if clean:
        return int(clean)
    return None


def main():
    parser = argparse.ArgumentParser(description="Scrape Ottoneu arbitration progress")
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    parser.add_argument("--season", type=int, default=SEASON)
    args = parser.parse_args()

    asyncio.run(scrape_arbitration_progress(args.league_id, args.season))


if __name__ == "__main__":
    main()
