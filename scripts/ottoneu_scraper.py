import os
import re
import asyncio
from playwright.async_api import async_playwright
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Configuration
LEAGUE_ID = 309
OTTONEU_SEARCH_URL = f"https://ottoneu.fangraphs.com/football/{LEAGUE_ID}/search"
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

async def scrape_ottoneu_data():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Use a user agent to look less like a bot
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        try:
            print(f"Navigating to {OTTONEU_SEARCH_URL}...")
            await page.goto(OTTONEU_SEARCH_URL, timeout=60000)
            
            # Wait for the filter links to be visible
            # Selector identified: 'a.top_players'
            print("Waiting for filters...")
            await page.wait_for_selector('a.top_players', timeout=30000)

            # Define positions to scrape
            # Based on inspection, the "Top Players" filters include these
            positions = ['QB', 'RB', 'WR', 'TE', 'K']
            # positions = ['K'] # Debug: Start with small set if needed
            
            total_processed_count = 0
            
            for pos in positions:
                print(f"\n--- Scraping Position: {pos} ---")
                
                # Find and click the position filter
                # Selector: a.top_players with text matching the position exactly
                try:
                    # Specific locator for the link
                    pos_link = page.locator('a.top_players').filter(has_text=re.compile(f"^{pos}$")).first
                    
                    if await pos_link.count() == 0:
                        print(f"Warning: Could not find filter for {pos}, skipping...")
                        continue
                    
                    print(f"Clicking '{pos}' filter...")
                    await pos_link.click()
                    
                    # Wait for table to update. 
                    # The table likely re-renders. 
                    # Staleness check or ensure rows change? 
                    # Easier: Wait for table visible again + small sleep
                    await page.wait_for_selector('.table-container table', state='visible')
                    await page.wait_for_timeout(1500) # Give JS a moment to render rows
                    
                    # Scrape Rows
                    rows = await page.query_selector_all('.table-container table tbody tr')
                    print(f"Found {len(rows)} rows for {pos}.")
                    
                    pos_processed_count = 0
                    
                    for i, row in enumerate(rows):
                        try:
                            # Name is in 2nd column (index 1)
                            name_cell = await row.query_selector('td:nth-child(2)')
                            if not name_cell: continue
                            
                            name_el = await name_cell.query_selector('a')
                            if not name_el: continue
                            
                            name = await name_el.inner_text()
                            href = await name_el.get_attribute('href')
                            
                            # Extract ID
                            ottoneu_id = 0
                            if href:
                                id_match = re.search(r'(\d+)$', href)
                                if not id_match:
                                     id_match = re.search(r'id=(\d+)', href)
                                if id_match:
                                    ottoneu_id = int(id_match.group(1))
                            
                            if not ottoneu_id: continue

                            # Team/Pos
                            span_el = await name_cell.query_selector('span.smaller')
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

                            # Fantasy Team (3rd column)
                            team_cell = await row.query_selector('td:nth-child(3)')
                            fantasy_team = "FA"
                            if team_cell:
                                 team_link = await team_cell.query_selector('a')
                                 if team_link:
                                     fantasy_team = await team_link.inner_text()
                                 else:
                                     text = await team_cell.inner_text()
                                     if "FA" in text: fantasy_team = "FA"
                            
                            # Salary (4th column)
                            salary_cell = await row.query_selector('td:nth-child(4)')
                            price = 0
                            if salary_cell:
                                salary_text = await salary_cell.inner_text()
                                if '$' in salary_text:
                                    clean_price = re.sub(r'[^\d]', '', salary_text)
                                    if clean_price:
                                        price = int(clean_price)
                            
                            # Upsert Player
                            player_data = {
                                "ottoneu_id": ottoneu_id,
                                "name": name,
                                "position": position,
                                "nfl_team": nfl_team
                            }
                            data, _ = supabase.table('players').upsert(player_data, on_conflict='ottoneu_id').execute()
                            
                            returned_rows = data.data if hasattr(data, 'data') else data[1]
                            
                            if returned_rows and len(returned_rows) > 0:
                                player_uuid = returned_rows[0]['id']
                                 
                                price_data = {
                                    "player_id": player_uuid,
                                    "league_id": LEAGUE_ID,
                                    "price": price,
                                    "team_name": fantasy_team
                                }
                                supabase.table('league_prices').upsert(price_data, on_conflict='player_id, league_id').execute()
                                pos_processed_count += 1
                                total_processed_count += 1
                                
                        except Exception as row_e:
                            # print(f"Row {i} error: {row_e}")
                            pass
                    
                    print(f"Processed {pos_processed_count} players for {pos}.")
                    
                except Exception as e:
                    print(f"Error scraping position {pos}: {e}")

            print(f"Successfully processed {total_processed_count} players total.")
            
        except Exception as e:
            print(f"Script failed: {e}")
            print("Capturing debug screenshot to 'debug_error.png'...")
            await page.screenshot(path="debug_error.png")
            
        finally:
            await browser.close()
            


if __name__ == "__main__":
    asyncio.run(scrape_ottoneu_data())
