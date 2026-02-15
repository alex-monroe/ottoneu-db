"""Task: Scrape individual player card for FA salary history."""

import re

from scripts.tasks import TaskResult


async def run(params: dict, context, supabase) -> TaskResult:
    """Scrape a player's transaction history to find their real salary.

    Params:
        ottoneu_id (int): Ottoneu player ID
        player_name (str): Player name (for logging)
        player_uuid (str): UUID in our players table
        href (str): Relative or absolute URL to player card
        season (int): Target season year
        league_id (int): Ottoneu league ID

    Args:
        context: Playwright BrowserContext
        supabase: Supabase client
    """
    player_name = params.get("player_name", "Unknown")
    player_uuid = params["player_uuid"]
    href = params["href"]
    season = params.get("season", 2025)
    league_id = params.get("league_id", 309)

    if href.startswith("http"):
        url = href
    else:
        url = f"https://ottoneu.fangraphs.com{href}"

    page = await context.new_page()
    try:
        print(f"  Checking history for FA {player_name}...")
        await page.goto(url, timeout=30000)
        await page.wait_for_selector("table")

        tables = await page.query_selector_all("table")
        price = None

        for table in tables:
            headers = await table.query_selector_all("th")
            header_texts = [await h.inner_text() for h in headers]

            if "TRANSACTION TYPE" not in header_texts or "SALARY" not in header_texts:
                continue

            type_idx = header_texts.index("TRANSACTION TYPE")
            salary_idx = header_texts.index("SALARY")

            rows = await table.query_selector_all("tbody tr")
            if not rows:
                rows = await table.query_selector_all("tr")

            for row in rows:
                cols = await row.query_selector_all("td")
                if len(cols) <= max(type_idx, salary_idx):
                    continue

                t_type = await cols[type_idx].inner_text()
                t_salary = await cols[salary_idx].inner_text()

                if "Cut" not in t_type:
                    clean_s = re.sub(r"[^\d]", "", t_salary)
                    if clean_s:
                        price = int(clean_s)
                        print(f"    Found real salary: ${price} (Type: {t_type})")
                        break

            if price is not None:
                break

        if price is not None:
            supabase.table("league_prices").upsert(
                {
                    "player_id": player_uuid,
                    "league_id": league_id,
                    "season": season,
                    "price": price,
                    "team_name": "FA",
                },
                on_conflict="player_id, league_id, season",
            ).execute()

            return TaskResult(
                success=True,
                data={"player_name": player_name, "price": price},
            )
        else:
            return TaskResult(
                success=True,
                data={"player_name": player_name, "price": None, "note": "No non-cut transaction found"},
            )

    except Exception as e:
        return TaskResult(success=False, error=f"Error checking history for {player_name}: {e}")
    finally:
        await page.close()
