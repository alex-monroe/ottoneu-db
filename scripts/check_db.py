from config import get_supabase_client, LEAGUE_ID

def check_database() -> None:
    """Verify database content and display top players."""
    supabase = get_supabase_client()
    
    print("--- Verifying Database Content ---")
    
    # Check total count
    response = supabase.table('players').select('*', count='exact').execute()
    print(f"Total Players in DB: {response.count}")
    
    # Get top 5 most expensive players in the league
    # We join league_prices with players
    print(f"\n--- Top 5 Most Expensive Players (League {LEAGUE_ID}) ---")

    # Supabase-py join syntax can be tricky, let's do two queries or use proper select
    # select player_id, price, team_name, players(name, position, nfl_team)

    try:
        data = supabase.table('league_prices')\
            .select('price, team_name, players(name, position, nfl_team)')\
            .eq('league_id', LEAGUE_ID)\
            .order('price', desc=True)\
            .limit(5)\
            .execute()
            
        rows = data.data
        for i, row in enumerate(rows, 1):
            player = row['players']
            if player: # Ensure player data exists
                print(f"{i}. {player['name']} ({player['position']} - "
                      f"{player['nfl_team']}): ${row['price']} "
                      f"[Owner: {row['team_name']}]")
            else:
                print(f"{i}. Unknown Player: ${row['price']}")
                
    except Exception as e:
        print(f"Error querying top players: {e}")

if __name__ == "__main__":
    check_database()
