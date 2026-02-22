"""Task: Scrape all players for one position from Ottoneu search page."""

from __future__ import annotations

import re

import pandas as pd

from scripts.config import NFL_TEAM_CODES
from scripts.name_utils import normalize_player_name
from scripts.tasks import SCRAPE_PLAYER_CARD, TaskResult


OTTONEU_SEARCH_URL_TEMPLATE = "https://ottoneu.fangraphs.com/football/{league_id}/search"


async def run(params: dict, context, supabase, nfl_stats: pd.DataFrame) -> TaskResult:
    """Scrape one position's roster from the Ottoneu search page.

    Params:
        position (str): Position to scrape (QB, RB, WR, TE, K)
        season (int): Target season year
        league_id (int): Ottoneu league ID

    Args:
        context: Playwright BrowserContext (shared across tasks)
        supabase: Supabase client
        nfl_stats: DataFrame of NFL snap counts (from pull_nfl_stats cache)

    Returns TaskResult with child_jobs for FA player card scrapes.
    """
    position = params["position"]
    season = params.get("season", 2025)
    league_id = params.get("league_id", 309)

    search_url = OTTONEU_SEARCH_URL_TEMPLATE.format(league_id=league_id)
    child_jobs = []

    page = await context.new_page()
    try:
        print(f"\n--- Scraping Position: {position} ---")
        await page.goto(search_url, timeout=60000)
        await page.wait_for_selector("a.top_players", timeout=30000)

        # Click position filter
        pos_link = page.locator("a.top_players").filter(
            has_text=re.compile(f"^{position}$")
        ).first

        if await pos_link.count() == 0:
            return TaskResult(success=False, error=f"Could not find filter for {position}")

        print(f"Clicking '{position}' filter...")
        await pos_link.click()

        await page.wait_for_selector(".table-container table", state="visible")
        await page.wait_for_timeout(2000)

        rows = await page.query_selector_all(".table-container table tbody tr")
        print(f"Found {len(rows)} rows for {position}.")

        processed = 0

        for row in rows:
            try:
                result = await _process_row(
                    row, page, context, supabase, nfl_stats,
                    position, season, league_id
                )
                if result:
                    processed += 1
                    if result.get("child_job"):
                        child_jobs.append(result["child_job"])
            except Exception:
                pass

        print(f"Processed {processed} players for {position}.")
        return TaskResult(success=True, data={"processed": processed}, child_jobs=child_jobs)

    except Exception as e:
        return TaskResult(success=False, error=str(e))
    finally:
        await page.close()


async def _process_row(row, page, context, supabase, nfl_stats,
                       filter_position, season, league_id) -> dict | None:
    """Process a single table row. Returns dict with player info and optional child_job."""

    # Name and href
    name_cell = await row.query_selector("td:nth-child(2)")
    if not name_cell:
        return None
    name_el = await name_cell.query_selector("a")
    if not name_el:
        return None

    name = await name_el.inner_text()
    href = await name_el.get_attribute("href")

    # Extract ottoneu ID
    ottoneu_id = 0
    if href:
        id_match = re.search(r"(\d+)$", href)
        if not id_match:
            id_match = re.search(r"id=(\d+)", href)
        if id_match:
            ottoneu_id = int(id_match.group(1))
    if not ottoneu_id:
        return None

    # Team / Position
    span_el = await name_cell.query_selector("span.smaller")
    if span_el:
        pos_team_text = await span_el.inner_text()
        parts = pos_team_text.split()
        if len(parts) >= 2:
            nfl_team = parts[0]
            position = parts[1]
        elif len(parts) == 1:
            position = parts[0]
            nfl_team = "Unknown"
        else:
            nfl_team = "Unknown"
            position = "Unknown"
    else:
        nfl_team = "Unknown"
        position = "Unknown"

    # Fantasy team (3rd column)
    team_cell = await row.query_selector("td:nth-child(3)")
    fantasy_team = "FA"
    if team_cell:
        team_link = await team_cell.query_selector("a")
        if team_link:
            fantasy_team = await team_link.inner_text()
        else:
            text = await team_cell.inner_text()
            if "FA" in text:
                fantasy_team = "FA"

    # Salary (4th column)
    salary_cell = await row.query_selector("td:nth-child(4)")
    price = 0
    if salary_cell:
        salary_text = await salary_cell.inner_text()
        if "$" in salary_text:
            clean_price = re.sub(r"[^\d]", "", salary_text)
            if clean_price:
                price = int(clean_price)

    # Points (9th column)
    points_cell = await row.query_selector("td:nth-child(9)")
    total_points = 0.0
    if points_cell:
        points_text = await points_cell.inner_text()
        try:
            total_points = float(points_text.replace(",", ""))
        except (ValueError, AttributeError):
            total_points = 0.0

    # Upsert player
    is_college = nfl_team not in NFL_TEAM_CODES and nfl_team != "Unknown"
    player_data = {
        "ottoneu_id": ottoneu_id,
        "name": name,
        "position": position,
        "nfl_team": nfl_team,
        "is_college": is_college,
    }
    data, _ = supabase.table("players").upsert(
        player_data, on_conflict="ottoneu_id"
    ).execute()

    returned_rows = data.data if hasattr(data, "data") else data[1]
    if not returned_rows or len(returned_rows) == 0:
        return None

    player_uuid = returned_rows[0]["id"]

    # Upsert league price (current state)
    price_data = {
        "player_id": player_uuid,
        "league_id": league_id,
        "price": price,
        "team_name": fantasy_team,
    }
    supabase.table("league_prices").upsert(
        price_data, on_conflict="player_id, league_id"
    ).execute()

    # Match NFL stats — sum across all teams for traded players
    if not nfl_stats.empty:
        # Normalize both Ottoneu name and NFL names for matching
        normalized_name = normalize_player_name(name)

        # Create temporary normalized column for matching
        nfl_stats_temp = nfl_stats.copy()
        nfl_stats_temp["player_normalized"] = nfl_stats_temp["player"].apply(normalize_player_name)

        # Match on normalized names
        player_stats_row = nfl_stats_temp[nfl_stats_temp["player_normalized"] == normalized_name]

        # Existing disambiguation logic (unchanged)
        if len(player_stats_row) > 1:
            # Check if multiple rows are the same player on different teams (trade)
            # vs. genuinely different players with the same name
            unique_positions = player_stats_row["position"].nunique()
            if unique_positions > 1:
                # Different positions = likely different people, filter by team
                team_match = player_stats_row[player_stats_row["team"] == nfl_team]
                if not team_match.empty:
                    player_stats_row = team_match
            # Otherwise, same position across teams = traded player, sum all rows
    else:
        player_stats_row = pd.DataFrame()

    games_played = 0
    snaps = 0
    h1_snaps = h1_games = h2_snaps = h2_games = 0
    if not player_stats_row.empty:
        games_played = int(player_stats_row["games_played"].sum())
        snaps = int(player_stats_row["total_snaps"].sum())
        if "h1_snaps" in player_stats_row.columns:
            h1_snaps = int(player_stats_row["h1_snaps"].sum())
            h1_games = int(player_stats_row["h1_games"].sum())
            h2_snaps = int(player_stats_row["h2_snaps"].sum())
            h2_games = int(player_stats_row["h2_games"].sum())

    ppg = round(total_points / games_played, 2) if games_played > 0 else 0.0
    pps = round(total_points / snaps, 4) if snaps > 0 else 0.0

    stats_data = {
        "player_id": player_uuid,
        "season": season,
        "total_points": total_points,
        "games_played": games_played,
        "snaps": snaps,
        "ppg": ppg,
        "pps": pps,
        "h1_snaps": h1_snaps,
        "h1_games": h1_games,
        "h2_snaps": h2_snaps,
        "h2_games": h2_games,
    }
    supabase.table("player_stats").upsert(
        stats_data, on_conflict="player_id, season"
    ).execute()

    # Create child job to scrape player card for transaction history
    child_job = None
    if href:
        child_job = {
            "task_type": SCRAPE_PLAYER_CARD,
            "params": {
                "ottoneu_id": ottoneu_id,
                "player_name": name,
                "player_uuid": player_uuid,
                "href": href,
                "season": season,
                "league_id": league_id,
                "fantasy_team": fantasy_team,
            },
            "priority": -1,  # lower priority than roster scrapes
        }

    return {"player_uuid": player_uuid, "child_job": child_job}
