import nfl_data_py as nfl

try:
    print("Fetching 2025 snap counts...")
    # Fetch snap counts for 2025
    snaps = nfl.import_snap_counts([2025])
    print(f"Loaded {len(snaps)} snap records.")
    print(snaps.head())
    
    print("\nColumns available:")
    print(snaps.columns.tolist())
    
    print("\nSample Player (Josh Allen):")
    josh_allen = snaps[snaps['player'] == 'Josh Allen'] 
    print(josh_allen)
    
except Exception as e:
    print(f"Error: {e}")
