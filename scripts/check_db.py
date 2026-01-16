import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

def check_database():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    print("--- Verifying Database Content ---")
    
    # Check total count
    response = supabase.table('players').select('*', count='exact').execute()
    print(f"Total Players in DB: {response.count}")
    
    # Get top 5 most expensive players in League 309
    # We join league_prices with players
    print("\n--- Top 5 Most Expensive Players (League 309) ---")
    
    # Supabase-py join syntax can be tricky, let's do two queries or use proper select
    # select player_id, price, team_name, players(name, position, nfl_team)
    
    try:
        data = supabase.table('league_prices')\
            .select('price, team_name, players(name, position, nfl_team)')\
            .eq('league_id', 309)\
            .order('price', desc=True)\
            .limit(5)\
            .execute()
            
        rows = data.data
        for i, row in enumerate(rows, 1):
            player = row['players']
            if player: # Ensure player data exists
                print(f"{i}. {player['name']} ({player['position']} - {player['nfl_team']}): ${row['price']} [Owner: {row['team_name']}]")
            else:
                print(f"{i}. Unknown Player: ${row['price']}")
                
    except Exception as e:
        print(f"Error querying top players: {e}")

if __name__ == "__main__":
    check_database()
