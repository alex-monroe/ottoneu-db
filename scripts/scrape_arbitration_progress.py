"""Scrape the Ottoneu arbitration progress page for current allocations and team status.

Usage:
    venv/bin/python scripts/scrape_arbitration_progress.py
    venv/bin/python scripts/scrape_arbitration_progress.py --season 2025 --league-id LEAGUE_ID

Requires FANGRAPHS_USERNAME and FANGRAPHS_PASSWORD env vars (the arbitration
page is only visible to logged-in league members).

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

DEBUG_SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "debug")
FANGRAPHS_LOGIN_URL = "https://blogs.fangraphs.com/wp-login.php"
ARB_URL_TEMPLATE = "https://ottoneu.fangraphs.com/football/{league_id}/arbitration"
NON_DIGIT_REGEX = re.compile(r"[^\d]")
ID_END_REGEX = re.compile(r"(\d+)$")


async def _save_debug_screenshot(page, name: str):
    """Save a screenshot and page HTML for debugging CI failures."""
    os.makedirs(DEBUG_SCREENSHOT_DIR, exist_ok=True)
    screenshot_path = os.path.join(DEBUG_SCREENSHOT_DIR, f"{name}.png")
    html_path = os.path.join(DEBUG_SCREENSHOT_DIR, f"{name}.html")
    try:
        await page.screenshot(path=screenshot_path, full_page=True)
        print(f"  Debug screenshot saved: {screenshot_path}")
    except Exception as e:
        print(f"  Failed to save screenshot: {e}")
    try:
        content = await page.content()
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  Debug HTML saved: {html_path}")
    except Exception as e:
        print(f"  Failed to save HTML: {e}")


async def _login_to_fangraphs(page, redirect_url: str):
    """Log in to FanGraphs via wp-login.php and redirect to the target page.

    Requires FANGRAPHS_USERNAME and FANGRAPHS_PASSWORD environment variables.
    """
    username = os.getenv("FANGRAPHS_USERNAME")
    password = os.getenv("FANGRAPHS_PASSWORD")

    if not username or not password:
        print("Error: FANGRAPHS_USERNAME and FANGRAPHS_PASSWORD must be set in .env")
        sys.exit(1)

    login_url = f"{FANGRAPHS_LOGIN_URL}?redirect_to={redirect_url}"
    print(f"Logging in to FanGraphs...")

    await page.goto(login_url, timeout=60000)

    # Debug: capture page title to detect Cloudflare challenges
    title = await page.title()
    print(f"  Login page title: {title}")

    try:
        await page.wait_for_selector("#user_login", timeout=30000)
    except Exception:
        print("  Could not find #user_login selector — page structure may have changed")
        await _save_debug_screenshot(page, "login-form-missing")
        sys.exit(1)

    # Fill in credentials
    await page.fill("#user_login", username)
    await page.fill("#user_pass", password)

    # Submit the form
    await page.click("#wp-submit")

    # Wait for redirect to complete — should land on the arbitration page
    try:
        await page.wait_for_url(f"**/football/{LEAGUE_ID}/**", timeout=30000)
    except Exception:
        # May have landed on a different page, check if we're logged in
        current_url = page.url
        print(f"  Redirect landed on: {current_url}")
        if "wp-login" in current_url:
            # Check for error messages on the login page
            error_text = await page.evaluate("""() => {
                const el = document.querySelector('#login_error');
                return el ? el.innerText.trim() : null;
            }""")
            if error_text:
                print(f"  Login error message: {error_text}")
            else:
                print("  No #login_error element found on page")
            await _save_debug_screenshot(page, "login-failed")
            print("  Login appears to have failed. Check credentials.")
            sys.exit(1)

    print(f"  Logged in successfully. Current URL: {page.url}")


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
            # Log in to FanGraphs first (arbitration page requires auth)
            await _login_to_fangraphs(page, url)

            # Navigate to the arbitration page (may already be there from redirect)
            if "/arbitration" not in page.url:
                await page.goto(url, timeout=60000)

            # Wait for real content past Cloudflare challenge
            await page.wait_for_selector("table", timeout=30000)
            await page.wait_for_timeout(2000)

            # Debug: dump page headings to help identify available sections
            headings = await page.query_selector_all("h1, h2, h3, h4, h5")
            for h in headings:
                text = (await h.inner_text()).strip()
                if text:
                    tag = await h.evaluate("el => el.tagName")
                    print(f"  [{tag}] {text}")

            # Scrape all data
            allocations = await _scrape_allocations(page, league_id, season)
            incomplete_teams = await _scrape_incomplete_teams(page)
            all_team_names = await _scrape_all_teams(page)

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
        has_allocation = any("allocat" in h for h in header_texts)
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
        elif header in ("salary", "current salary", "current sal", "original salary"):
            current_salary = _parse_dollar(val)
        elif "raise" in header or "increase" in header or "allocated" in header:
            raise_amount = _parse_dollar(val)
        elif "new" in header and ("salary" in header or "sal" in header):
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

    Page structure (Ottoneu):
      <section class="section-container">
        <header><h3>Your Overview</h3></header>
        <header><h4>Teams with incomplete arbitration</h4></header>
        <div class="table-container">
          <table>
            <thead><tr><th>Team</th><th>Reason</th></tr></thead>
            <tbody><tr><td><a href="...">Team Name</a></td><td>Reason</td></tr></tbody>
          </table>
        </div>
        ...
      </section>

    The heading is inside a <header> tag, and the table is a sibling
    <div class="table-container"> of that <header> within the parent <section>.
    """
    incomplete = set()

    # Find the heading, then go up to the <section> container and find the
    # table that immediately follows the heading's <header> wrapper.
    teams_from_table = await page.evaluate("""() => {
        const headings = document.querySelectorAll('h4');
        for (const h of headings) {
            if (!h.innerText.toLowerCase().includes('incomplete')) continue;

            // The heading is inside <header>, the table is the next sibling
            // of that <header> within the parent <section>.
            const headerEl = h.closest('header');
            if (!headerEl) continue;

            // Look at siblings after this <header> for a table
            let sib = headerEl.nextElementSibling;
            while (sib) {
                const table = sib.querySelector ? sib.querySelector('table') : null;
                if (table) {
                    const rows = table.querySelectorAll('tbody tr');
                    const teams = [];
                    for (const row of rows) {
                        const firstCell = row.querySelector('td');
                        if (firstCell) {
                            const link = firstCell.querySelector('a');
                            const name = link ? link.innerText.trim() : firstCell.innerText.trim();
                            if (name) teams.push(name);
                        }
                    }
                    return teams;
                }
                // Stop if we hit another <header> (next section)
                if (sib.tagName === 'HEADER') break;
                sib = sib.nextElementSibling;
            }
        }
        return [];
    }""")

    for team in (teams_from_table or []):
        incomplete.add(team)

    return incomplete


async def _scrape_all_teams(page) -> set[str]:
    """Extract all team names from the page.

    Uses multiple sources:
    1. The teams dropdown (<select class="teamsDropdown">)
    2. Links to team pages (/football/{id}/team...)
    """
    teams = set()

    # Source 1: teams dropdown (lists all opponent teams, excludes "Overview")
    dropdown_teams = await page.evaluate("""() => {
        const select = document.querySelector('select.teamsDropdown');
        if (!select) return [];
        return Array.from(select.options)
            .filter(o => o.value !== '0')
            .map(o => o.text.trim())
            .filter(t => t);
    }""")
    for t in (dropdown_teams or []):
        teams.add(t)

    # Source 2: team links in standings/other tables
    html = await page.content()
    pattern = re.compile(
        r'<a[^>]*href="[^"]*?/football/\d+/team[^"]*"[^>]*>([^<]+)</a>',
        re.IGNORECASE,
    )
    for match in pattern.finditer(html):
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
