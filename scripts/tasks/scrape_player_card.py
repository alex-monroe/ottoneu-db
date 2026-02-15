"""Task: Scrape individual player card for FA salary history and transactions."""

import re
from datetime import datetime

from scripts.tasks import TaskResult


async def run(params: dict, context, supabase) -> TaskResult:
    """Scrape a player's transaction history to find their real salary.

    Also stores all transactions in the transactions table and records
    salary history snapshots.

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
        transactions_stored = 0

        for table in tables:
            headers = await table.query_selector_all("th")
            header_texts = [await h.inner_text() for h in headers]

            if "TRANSACTION TYPE" not in header_texts or "SALARY" not in header_texts:
                continue

            # Build column index map from available headers
            col_map = {text.upper(): i for i, text in enumerate(header_texts)}
            type_idx = col_map.get("TRANSACTION TYPE")
            salary_idx = col_map.get("SALARY")
            date_idx = col_map.get("DATE")
            team_idx = col_map.get("TEAM")

            rows = await table.query_selector_all("tbody tr")
            if not rows:
                rows = await table.query_selector_all("tr")

            for row in rows:
                cols = await row.query_selector_all("td")
                if len(cols) <= max(type_idx, salary_idx):
                    continue

                t_type = await cols[type_idx].inner_text()
                t_salary_text = await cols[salary_idx].inner_text()

                # Parse salary
                clean_s = re.sub(r"[^\d]", "", t_salary_text)
                row_salary = int(clean_s) if clean_s else None

                # Parse date (if available)
                t_date = None
                if date_idx is not None and len(cols) > date_idx:
                    date_text = (await cols[date_idx].inner_text()).strip()
                    if date_text:
                        for fmt in ("%b %d, %Y %I:%M %p", "%m/%d/%Y", "%Y-%m-%d", "%b %d, %Y"):
                            try:
                                t_date = datetime.strptime(date_text, fmt).date().isoformat()
                                break
                            except ValueError:
                                continue

                # Parse team (if available)
                t_team = None
                if team_idx is not None and len(cols) > team_idx:
                    t_team = (await cols[team_idx].inner_text()).strip() or None

                # Build raw description from all columns for future parsing
                all_texts = [await c.inner_text() for c in cols]
                raw_desc = " | ".join(all_texts)

                # Store transaction (unique constraint handles dedup on re-scrape)
                try:
                    supabase.table("transactions").upsert(
                        {
                            "player_id": player_uuid,
                            "league_id": league_id,
                            "season": season,
                            "transaction_type": t_type.strip(),
                            "team_name": t_team,
                            "salary": row_salary,
                            "transaction_date": t_date,
                            "raw_description": raw_desc,
                        },
                        on_conflict="player_id, league_id, transaction_type, transaction_date, salary",
                    ).execute()
                    transactions_stored += 1
                except Exception as e:
                    print(f"    Warning: could not store transaction for {player_name}: {e}")

                # Find the real salary (first non-Cut transaction) — original logic
                if price is None and "Cut" not in t_type and row_salary is not None:
                    price = row_salary
                    print(f"    Found real salary: ${price} (Type: {t_type})")

            break  # Only process the first matching table

        # Upsert league price (backward compat)
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

            # Insert salary history row (dedup: only if changed)
            latest = (
                supabase.table("salary_history")
                .select("price, team_name")
                .eq("player_id", player_uuid)
                .eq("league_id", league_id)
                .eq("season", season)
                .order("scraped_at", desc=True)
                .limit(1)
                .execute()
            )
            prev = latest.data[0] if latest.data else None
            if prev is None or prev["price"] != price or prev["team_name"] != "FA":
                supabase.table("salary_history").insert({
                    "player_id": player_uuid,
                    "league_id": league_id,
                    "season": season,
                    "price": price,
                    "team_name": "FA",
                }).execute()

            return TaskResult(
                success=True,
                data={
                    "player_name": player_name,
                    "price": price,
                    "transactions_stored": transactions_stored,
                },
            )
        else:
            return TaskResult(
                success=True,
                data={
                    "player_name": player_name,
                    "price": None,
                    "transactions_stored": transactions_stored,
                    "note": "No non-cut transaction found",
                },
            )

    except Exception as e:
        return TaskResult(success=False, error=f"Error checking history for {player_name}: {e}")
    finally:
        await page.close()
