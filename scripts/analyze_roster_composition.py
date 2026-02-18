"""Roster composition analysis — data-driven replacement level discovery.

Reconstructs rosters at 5 snapshot dates during the season and counts
rostered players per position league-wide. Proposes data-driven replacement
levels for use in config.py.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from config import get_supabase_client, LEAGUE_ID, SEASON, POSITIONS

# 5 snapshot dates spanning the season
YEAR = SEASON
SNAPSHOT_DATES = [
    f"{YEAR}-09-05",  # Pre-season
    f"{YEAR}-10-01",  # ~Week 4
    f"{YEAR}-10-29",  # ~Week 8
    f"{YEAR}-11-26",  # ~Week 12
    f"{YEAR}-12-25",  # ~Week 16
]


def reconstruct_roster_at_date(transactions: list, target_date: str) -> dict:
    """Replay transactions up to target_date.

    Returns dict of player_id -> team_name for all currently rostered players.
    Mirrors the logic in web/lib/roster-reconstruction.ts.
    """
    player_state = {}

    for txn in transactions:
        txn_date = txn.get("transaction_date", "")
        if not txn_date or txn_date > target_date:
            continue

        t = txn["transaction_type"].lower()
        player_id = txn["player_id"]

        if "cut" in t or "drop" in t:
            player_state[player_id] = None
        elif (
            "move" in t
            or "add" in t
            or "auction" in t
            or "waiver" in t
            or "signed" in t
            or "rostered" in t
        ):
            if txn.get("team_name"):
                player_state[player_id] = txn["team_name"]

    return {pid: team for pid, team in player_state.items() if team is not None}


def main():
    supabase = get_supabase_client()

    print(f"Fetching data for season {SEASON}...")

    txn_res = (
        supabase.table("transactions")
        .select("player_id, transaction_type, team_name, salary, transaction_date")
        .eq("league_id", LEAGUE_ID)
        .eq("season", SEASON)
        .order("transaction_date", desc=False)
        .execute()
    )
    transactions = txn_res.data or []
    print(f"  {len(transactions)} transactions loaded")

    players_res = supabase.table("players").select("id, name, position").execute()
    players = {p["id"]: p for p in (players_res.data or [])}

    stats_res = (
        supabase.table("player_stats")
        .select("player_id, ppg, total_points, games_played")
        .eq("season", SEASON)
        .execute()
    )
    stats = {s["player_id"]: s for s in (stats_res.data or [])}

    print(f"  {len(players)} players, {len(stats)} player stats\n")

    # Reconstruct rosters at each snapshot date
    snapshot_counts = {}
    snapshot_rosters = {}

    for date in SNAPSHOT_DATES:
        rostered = reconstruct_roster_at_date(transactions, date)

        pos_counts = {pos: 0 for pos in POSITIONS}
        pos_players = {pos: [] for pos in POSITIONS}

        for player_id, team in rostered.items():
            player = players.get(player_id)
            if not player:
                continue
            pos = player.get("position", "")
            if pos not in pos_counts:
                continue

            pos_counts[pos] += 1
            player_stat = stats.get(player_id, {})
            pos_players[pos].append(
                {
                    "name": player["name"],
                    "team": team,
                    "ppg": float(player_stat.get("ppg", 0) or 0),
                    "total_points": float(player_stat.get("total_points", 0) or 0),
                    "games_played": int(player_stat.get("games_played", 0) or 0),
                }
            )

        snapshot_counts[date] = pos_counts
        snapshot_rosters[date] = pos_players

    # Print per-snapshot breakdown
    col_w = 13
    print("=" * 70)
    print("ROSTERED PLAYER COUNTS BY POSITION PER SNAPSHOT")
    print("=" * 70)

    header = f"{'Position':<10}" + "".join(f"{d:<{col_w}}" for d in SNAPSHOT_DATES) + f"{'Avg':<8}"
    print(header)
    print("-" * len(header))

    averages = {}
    for pos in POSITIONS:
        counts = [snapshot_counts[date][pos] for date in SNAPSHOT_DATES]
        avg = sum(counts) / len(counts)
        averages[pos] = avg
        row = f"{pos:<10}" + "".join(f"{c:<{col_w}}" for c in counts) + f"{avg:<8.1f}"
        print(row)

    print()

    # Proposed replacement levels
    bench_levels = {}
    waiver_levels = {}

    print("=" * 70)
    print("PROPOSED REPLACEMENT LEVELS")
    print("=" * 70)
    print(f"{'Position':<8} {'Bench Level':<14} {'Waiver Level':<14}")
    print(f"{'':8} {'(avg rostered)':<14} {'(bench + 1)':<14}")
    print("-" * 36)

    for pos in POSITIONS:
        bench = round(averages[pos])
        waiver = bench + 1
        bench_levels[pos] = bench
        waiver_levels[pos] = waiver
        print(f"{pos:<8} {bench:<14} {waiver:<14}")

    print()

    # Show boundary players at Week 16 snapshot
    last_date = SNAPSHOT_DATES[-1]
    print("=" * 70)
    print(f"BOUNDARY PLAYERS AT {last_date} (WEEK 16 SNAPSHOT)")
    print("=" * 70)

    for pos in POSITIONS:
        if pos == "K":
            continue

        bench_rank = bench_levels[pos]
        waiver_rank = waiver_levels[pos]

        pos_player_list = snapshot_rosters[last_date][pos]
        sorted_players = sorted(pos_player_list, key=lambda p: p["ppg"], reverse=True)
        total = len(sorted_players)

        print(f"\n{pos} — {total} rostered at Week 16 (bench: #{bench_rank}, waiver: #{waiver_rank})")
        print(f"  {'Rank':<6} {'Name':<28} {'Team':<20} {'PPG':<8}")
        print("  " + "-" * 62)

        for i, p in enumerate(sorted_players, 1):
            marker = ""
            if i == bench_rank:
                marker = " <- BENCH REPLACEMENT"
            elif i == waiver_rank:
                marker = " <- WAIVER REPLACEMENT"

            # Show top 5 and players near the boundary
            near_boundary = abs(i - bench_rank) <= 3 or abs(i - waiver_rank) <= 3
            if i <= 5 or near_boundary:
                print(f"  {i:<6} {p['name']:<28} {p['team']:<20} {p['ppg']:<8.2f}{marker}")

    print()
    print("=" * 70)
    print("COPY INTO config.py:")
    print("=" * 70)
    bench_str = "{" + ", ".join(f"'{p}': {bench_levels[p]}" for p in POSITIONS) + "}"
    waiver_str = "{" + ", ".join(f"'{p}': {waiver_levels[p]}" for p in POSITIONS) + "}"
    print(f"BENCH_REPLACEMENT_LEVEL = {bench_str}")
    print(f"WAIVER_REPLACEMENT_LEVEL = {waiver_str}")
    print(f"REPLACEMENT_LEVEL = WAIVER_REPLACEMENT_LEVEL  # backward compat")


if __name__ == "__main__":
    main()
