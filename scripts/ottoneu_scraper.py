import os
import re
import asyncio
from playwright.async_api import async_playwright
from supabase import create_client, Client
from dotenv import load_dotenv
import nfl_data_py as nfl
import pandas as pd
import numpy as np

load_dotenv()

# Configuration
LEAGUE_ID = 309
OTTONEU_SEARCH_URL = f"https://ottoneu.fangraphs.com/football/{LEAGUE_ID}/search"
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

def load_nfl_stats(season=2025):
    print(f"Loading NFL snap counts for {season}...")
    try:
        snaps = nfl.import_snap_counts([season])
        # Filter for regular season only? Usually ottoneu includes all? 
        # Let's assume we want season totals. snap counts data usually has game_type.
        # REG = Regular Season.
        if 'game_type' in snaps.columns:
            snaps = snaps[snaps['game_type'] == 'REG']
            
        # Aggregation
        # We need to group by player and team to match Ottoneu roughly?
        # Or just by player name/id if possible. 
        # NFL data has pfr_player_id, etc. Ottoneu doesn't have PFR ID easily.
        # We will match on Name for now.
        
        # Group by player, position, team (maybe team changes, so just player/position)
        # Note: Player names might not differ.
        
        stats = snaps.groupby(['player', 'position', 'team']).agg({
           'offense_snaps': 'sum',
           'defense_snaps': 'sum',
           'st_snaps': 'sum',
           'game_id': 'nunique' # Games Played directly from row count if filtered unique games
        }).reset_index()
        
        # Rename game_id to games_played
        stats.rename(columns={'game_id': 'games_played'}, inplace=True)
        stats['total_snaps'] = stats['offense_snaps'] + stats['defense_snaps'] + stats['st_snaps']
        
        # Create a lookup key: Name + Team usually is good enough for a season
        # But players change teams. 
        # Let's clean names (remove suffix like Jr/III if needed? for now raw match).
        
        return stats
    except Exception as e:
        print(f"Error loading NFL stats: {e}")
        return pd.DataFrame()

async def scrape_ottoneu_data(target_season=2025):
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Load NFL Stats
    nfl_stats = load_nfl_stats(target_season)
    
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
                    
                    # Capture current first row name to wait for change
                    current_first_name = ""
                    if total_processed_count > 0: # If not the very first load
                        first_row = await page.query_selector('.table-container table tbody tr td:nth-child(2) a')
                        if first_row:
                             current_first_name = await first_row.inner_text()
                    
                    print(f"Clicking '{pos}' filter...")
                    await pos_link.click()
                    
                    # Wait for table to update. 
                    # If we had a previous name, wait for the name to be different
                    await page.wait_for_selector('.table-container table', state='visible')
                    
                    if current_first_name:
                         print(f"Waiting for table to update from {current_first_name}...")
                         # Polling wait for first row to change
                         for _ in range(20): # 10 seconds max (20 * 0.5)
                             first_row_new = await page.query_selector('.table-container table tbody tr td:nth-child(2) a')
                             if first_row_new:
                                 new_name = await first_row_new.inner_text()
                                 if new_name != current_first_name:
                                     print("Table updated.")
                                     break
                             await page.wait_for_timeout(500)
                    else:
                         # Initial load or fallback
                         await page.wait_for_timeout(2000)
                    
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
                            
                            # ID Check for valid player
                            if not ottoneu_id: continue

                            # --- NEW LOGIC: Check History for FA ---
                            if fantasy_team == "FA" and href:
                                try:
                                    print(f"  Checking history for FA {name}...")
                                    # Need URL. Href is usually relative e.g. /football/309/player_card/nfl/6771
                                    if href.startswith("http"):
                                        p_url = href
                                    else:
                                        p_url = f"https://ottoneu.fangraphs.com{href}"
                                    
                                    # Open new page or use current? Better to use a separate page or just goto and back?
                                    # Going back might lose state/filters. Better to open a new tab (page).
                                    p_page = await context.new_page()
                                    await p_page.goto(p_url, timeout=30000)
                                    
                                    # Find Transaction History table
                                    # We can iterate through tables to find one with "Transaction History" nearby or specific headers
                                    # Based on debug: Table headers likely contain "TRANSACTION TYPE"
                                    
                                    # Wait for tables
                                    await p_page.wait_for_selector('table')
                                    p_tables = await p_page.query_selector_all('table')
                                    
                                    found_salary = False
                                    for table in p_tables:
                                        # Check headers
                                        headers = await table.query_selector_all('th')
                                        header_texts = [await h.inner_text() for h in headers]
                                        
                                        if "TRANSACTION TYPE" in header_texts and "SALARY" in header_texts:
                                            # This is the one. Iterate rows.
                                            p_rows = await table.query_selector_all('tbody tr') # or just tr if no tbody
                                            if not p_rows:
                                                p_rows = await table.query_selector_all('tr')
                                                
                                            for p_row in p_rows:
                                                cols = await p_row.query_selector_all('td')
                                                if len(cols) < 4: continue
                                                
                                                # Columns: DATE, TEAM, TRANSACTION TYPE, SALARY
                                                # Indexes might vary? Debug showed: ['DATE', 'TEAM', 'TRANSACTION TYPE', 'SALARY']
                                                # So Salary is index 3 (0-based)
                                                
                                                # Check headers index mapping to be safe? 
                                                # Let's assume standard order or map it.
                                                try:
                                                    type_idx = header_texts.index("TRANSACTION TYPE")
                                                    salary_idx = header_texts.index("SALARY")
                                                except:
                                                    continue
                                                    
                                                if len(cols) <= max(type_idx, salary_idx): continue
                                                
                                                t_type = await cols[type_idx].inner_text()
                                                t_salary = await cols[salary_idx].inner_text()
                                                
                                                if "Cut" not in t_type:
                                                    # Found valid salary
                                                    clean_s = re.sub(r'[^\d]', '', t_salary)
                                                    if clean_s:
                                                        price = int(clean_s)
                                                        print(f"    Found real salary: ${price} (Type: {t_type})")
                                                        found_salary = True
                                                        break
                                        if found_salary: break
                                    
                                    await p_page.close()
                                    
                                except Exception as e:
                                    print(f"    Error checking history for {name}: {e}")
                                    # Don't fail the whole script, just keep original price (likely $1)
                                    if 'p_page' in locals(): await p_page.close()
                            
                            # Points (Current year points, check column index)
                            # From valid inspection: Index 9 is "2025 PTS" (nth-child(10) potentially if 1-based and including hidden/icon?)
                            # Previous analysis: Headers: 1=Icon, 2=Name, 3=Team, 4=Salary, ..., 9=2025 PTS
                            # So nth-child(9) or (10)? 
                            # 'salary_cell' was nth-child(4).
                            # Let's try nth-child(9) based on headers list index (header 9 was PTS).
                            # Actually, headers are often: [Empty, Name, Team, Salary...]. 
                            # If Salary is index 4 (1-based), then Name=2, Team=3.
                            # So index 9 should be nth-child(9).
                            
                            points_cell = await row.query_selector('td:nth-child(9)')
                            total_points = 0.0
                            if points_cell:
                                points_text = await points_cell.inner_text()
                                try:
                                    total_points = float(points_text.replace(',',''))
                                except:
                                    total_points = 0.0

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
                                    "season": target_season,
                                    "price": price,
                                    "team_name": fantasy_team
                                }
                                supabase.table('league_prices').upsert(price_data, on_conflict='player_id, league_id, season').execute()
                                
                                # Match with NFL Stats
                                # Simple name match for now
                                player_stats_row = nfl_stats[nfl_stats['player'] == name]
                                
                                # If multiple matches, try to filter by team if possible or take first?
                                # This is a common issue.
                                if len(player_stats_row) > 1:
                                    # Try matching team
                                    # NFL team abbr might differ (NO vs NOS, SF vs SFO...)
                                    # Simple check
                                    team_match = player_stats_row[player_stats_row['team'] == nfl_team]
                                    if not team_match.empty:
                                        player_stats_row = team_match
                                
                                games_played = 0
                                snaps = 0
                                
                                if not player_stats_row.empty:
                                    # Sum up if multiple rows remain (rare after team filter)
                                    games_played = int(player_stats_row['games_played'].sum())
                                    snaps = int(player_stats_row['total_snaps'].sum())
                                
                                ppg = 0.0
                                pps = 0.0
                                if games_played > 0:
                                    ppg = round(total_points / games_played, 2)
                                if snaps > 0:
                                    pps = round(total_points / snaps, 4)
                                    
                                # Upsert Stats
                                stats_data = {
                                    "player_id": player_uuid,
                                    "season": target_season,
                                    "total_points": total_points,
                                    "games_played": games_played,
                                    "snaps": snaps,
                                    "ppg": ppg,
                                    "pps": pps
                                }
                                supabase.table('player_stats').upsert(stats_data, on_conflict='player_id, season').execute()
                                
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
