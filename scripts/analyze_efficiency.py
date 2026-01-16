import os
import asyncio
from supabase import create_client, Client
from dotenv import load_dotenv
import pandas as pd

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_data(season=2025):
    print(f"Fetching data for season {season}...")
    
    # Fetch League Prices
    # We need to getAll if > 1000 rows, but likely < 1000 for one league.
    prices_res = supabase.table('league_prices').select('*').eq('season', season).execute()
    prices_data = prices_res.data
    
    # Fetch Player Stats
    stats_res = supabase.table('player_stats').select('*').eq('season', season).execute()
    stats_data = stats_res.data
    
    # Fetch Players (for names/positions)
    players_res = supabase.table('players').select('*').execute()
    players_data = players_res.data
    
    return pd.DataFrame(prices_data), pd.DataFrame(stats_data), pd.DataFrame(players_data)

def analyze_efficiency(prices_df, stats_df, players_df):
    if prices_df.empty or stats_df.empty or players_df.empty:
        print("Data missing, cannot analyze.")
        return

    print("Processing data...")
    
    # Merge Data
    # 1. Merge Players into Prices to get Name, Position, Team
    # Rename id in players to player_id or join on correct columns
    players_df.rename(columns={'id': 'player_id_ref'}, inplace=True)
    
    # players: id, name, position, nfl_team
    # prices: player_id, price
    merged_df = pd.merge(prices_df, players_df, left_on='player_id', right_on='player_id_ref', how='left')
    
    # 2. Merge Stats
    # stats: player_id, ppg, pps, total_points
    merged_df = pd.merge(merged_df, stats_df, on='player_id', how='left', suffixes=('', '_stats'))
    
    # Calculate Efficiency
    # Cost per PPG = Price / PPG
    # Cost per PPS = Price / PPS
    
    # Clean up data
    merged_df['ppg'] = pd.to_numeric(merged_df['ppg'], errors='coerce').fillna(0)
    merged_df['pps'] = pd.to_numeric(merged_df['pps'], errors='coerce').fillna(0)
    merged_df['price'] = pd.to_numeric(merged_df['price'], errors='coerce').fillna(0)
    
    # Avoid division by zero
    # We want valid players only. Let's say:
    # - Must have played > 0 games or have > 0 points
    # - Price > 0 (Free players are infinitely efficient or irrelevant for "spending" analysis, but technically $0 cost. 
    #   Let's focus on players with a cost first, or handle $0 as $1 for math? 
    #   Usually people want to know who to BUY. $1 is min cost usually in auctions if drafted.
    #   Let's filter for Price >= 1 and PPG > 0.
    
    analysis_df = merged_df[ (merged_df['price'] > 0) & (merged_df['ppg'] > 0) ].copy()
    
    analysis_df['cost_per_ppg'] = analysis_df['price'] / analysis_df['ppg']
    
    # For PPS, protect against 0 PPS again just in case
    analysis_df['cost_per_pps'] = analysis_df.apply(
        lambda row: row['price'] / row['pps'] if row['pps'] > 0 else 9999.0, axis=1
    )
    
    # Rounding
    analysis_df['cost_per_ppg'] = analysis_df['cost_per_ppg'].round(2)
    analysis_df['cost_per_pps'] = analysis_df['cost_per_pps'].round(2)
    
    return analysis_df

def generate_report(df):
    output_file = "analysis_results.md"
    positions = ['QB', 'RB', 'WR', 'TE'] # Main fantasy positions
    
    with open(output_file, "w") as f:
        f.write("# Ottoneu Player Efficiency Analysis (2025)\n\n")
        f.write("Top 10 players by position based on Cost Efficiency.\n")
        f.write("Lower is better (Less $ paid per point).\n\n")
        
        for pos in positions:
            pos_df = df[df['position'] == pos]
            if pos_df.empty:
                f.write(f"## {pos}\nNo data found.\n\n")
                continue
                
            f.write(f"## {pos}\n\n")
            
            # Top 10 by $/PPG
            f.write("### Top 10 by Cost per PPG ($/PPG)\n")
            top_ppg = pos_df.sort_values(by='cost_per_ppg', ascending=True).head(10)
            
            # Select columns
            cols = ['name', 'nfl_team', 'price', 'ppg', 'cost_per_ppg', 'games_played']
            table_ppg = top_ppg[cols].to_markdown(index=False)
            f.write(table_ppg)
            f.write("\n\n")
            
            # Top 10 by $/PPS
            f.write("### Top 10 by Cost per PPS ($/PPS)\n")
            top_pps = pos_df.sort_values(by='cost_per_pps', ascending=True).head(10)
            
            cols_pps = ['name', 'nfl_team', 'price', 'pps', 'cost_per_pps', 'snaps']
            table_pps = top_pps[cols_pps].to_markdown(index=False)
            f.write(table_pps)
            f.write("\n\n")
            
    print(f"Report generated: {output_file}")


if __name__ == "__main__":
    prices, stats, players = fetch_data()
    result_df = analyze_efficiency(prices, stats, players)
    if result_df is not None:
        generate_report(result_df)
