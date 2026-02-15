import os
import streamlit as st
import pandas as pd
import plotly.express as px
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Supabase Setup
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    st.error("Supabase URL and Key must be set in .env file")
    st.stop()

@st.cache_resource
def init_supabase():
    return create_client(SUPABASE_URL, SUPABASE_KEY)

supabase = init_supabase()

@st.cache_data(ttl=600)
def load_data(league_id=309, season=2025):
    # Fetch Players
    players_resp = supabase.table('players').select('*').execute()
    players_df = pd.DataFrame(players_resp.data)

    # Fetch Stats
    stats_resp = supabase.table('player_stats').select('*').eq('season', season).execute()
    stats_df = pd.DataFrame(stats_resp.data)

    # Fetch Prices
    prices_resp = supabase.table('league_prices').select('*').eq('league_id', league_id).execute()
    prices_df = pd.DataFrame(prices_resp.data)

    if players_df.empty or stats_df.empty or prices_df.empty:
        return pd.DataFrame()

    # Merge Data
    # players -> stats
    merged = pd.merge(players_df, stats_df, left_on='id', right_on='player_id', how='inner', suffixes=('', '_stats'))
    
    # merged -> prices
    final_df = pd.merge(merged, prices_df, left_on='id', right_on='player_id', how='inner', suffixes=('', '_price'))

    # Clean up columns
    # We have 'price' from league_prices
    # Calculate Efficiency
    # Avoid division by zero
    final_df['ppg'] = pd.to_numeric(final_df['ppg'], errors='coerce').fillna(0)
    final_df['total_points'] = pd.to_numeric(final_df['total_points'], errors='coerce').fillna(0)
    final_df['price'] = pd.to_numeric(final_df['price'], errors='coerce').fillna(0)
    
    # $/PPG: If PPG is 0, this is technically infinite, but practically we might want to just set it to 0 or NaN for plotting
    # For visualization, let's filter out 0 PPG or handle it. 
    # Or maybe user wants to see 0 ppg players with high salary (bad value).
    # Let's calculate it, handling 0.
    final_df['cost_per_ppg'] = final_df.apply(lambda row: row['price'] / row['ppg'] if row['ppg'] > 0 else 0, axis=1)

    return final_df

st.set_page_config(page_title="Ottoneu Player Efficiency", layout="wide")
st.title("Ottoneu Player Efficiency Visualization")

# Sidebar Filters
st.sidebar.header("Filters")
selected_season = st.sidebar.number_input("Season", min_value=2020, max_value=2030, value=2025)
min_games = st.sidebar.slider("Minimum Games Played", 0, 17, 1)

# Load Data
with st.spinner("Loading data from Supabase..."):
    df = load_data(season=selected_season)

if df.empty:
    st.warning("No data found for the selected season.")
else:
    # Apply Filters
    df_filtered = df[df['games_played'] >= min_games]
    
    positions = sorted(df_filtered['position'].unique().tolist())
    selected_positions = st.sidebar.multiselect("Positions", positions, default=positions)
    df_filtered = df_filtered[df_filtered['position'].isin(selected_positions)]

    st.write(f"Showing {len(df_filtered)} players")

    # Visualization
    # X: Total Points
    # Y: Cost per PPG implies efficiency usually. 
    # Or maybe Cost per Point? User asked for "salary per points per game vs total points"
    # So Y = Salary / PPG. X = Total Points.
    
    fig = px.scatter(
        df_filtered,
        x="total_points",
        y="cost_per_ppg",
        size="price", # Bubble size = Price? Or maybe just consistent? User didn't specify. Let's make it price to show cost weight.
        color="position",
        hover_name="name",
        hover_data=["nfl_team", "price", "ppg", "games_played"],
        title=f"Player Cost Efficiency (Salary/PPG) vs Volume (Total Points) - {selected_season}",
        labels={
            "total_points": "Total Points",
            "cost_per_ppg": "Salary per PPG ($)",
            "price": "Salary ($)",
            "ppg": "Points Per Game"
        },
        template="plotly_dark"
    )
    
    # Add a tooltip for better UX
    fig.update_traces(marker=dict(line=dict(width=1, color='DarkSlateGrey')))

    st.plotly_chart(fig, use_container_width=True)

    # Data Table
    st.subheader("Player Data")
    st.dataframe(df_filtered[['name', 'position', 'nfl_team', 'price', 'total_points', 'ppg', 'cost_per_ppg', 'games_played']].sort_values('total_points', ascending=False))
