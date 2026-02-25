
from scripts.config import get_supabase_client

supabase = get_supabase_client()

def check_data():
    print("Checking database for player stats and prices...")
    
    # Check player_stats
    stats_response = supabase.table('player_stats').select('count', count='exact').execute()
    stats_count = stats_response.count
    print(f"Player Stats count: {stats_count}")
    
    # Check league_prices
    prices_response = supabase.table('league_prices').select('count', count='exact').execute()
    prices_count = prices_response.count
    print(f"League Prices count: {prices_count}")
    
    if stats_count > 0 and prices_count > 0:
        # Get a sample joined row to ensure we can link them
        # We can't do complex joins easily with simple supabase-js client syntax in python efficiently without RPC,
        # but we can fetch a few prices and fetch stats for those player_ids.
        
        print("\nSampling data integrity...")
        prices_data = supabase.table('league_prices').select('*').limit(5).execute()
        for price_row in prices_data.data:
            player_id = price_row['player_id']
            stat_res = supabase.table('player_stats').select('*').eq('player_id', player_id).execute()
            player_res = supabase.table('players').select('*').eq('id', player_id).execute()
            
            p_name = player_res.data[0]['name'] if player_res.data else "Unknown"
            stat_data = stat_res.data[0] if stat_res.data else None
            
            print(f"Player: {p_name}, Price: ${price_row['price']}, Stats Found: {stat_data is not None}")
            if stat_data:
                print(f"  -> PPG: {stat_data.get('ppg')}, PPS: {stat_data.get('pps')}")
    else:
        print("Data appears to be missing.")

if __name__ == "__main__":
    check_data()
