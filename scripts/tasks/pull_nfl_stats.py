"""Task: Pull NFL snap counts via nfl_data_py (sync, no browser needed)."""

import nfl_data_py as nfl
import pandas as pd

from scripts.tasks import TaskResult


def run(params: dict) -> TaskResult:
    """Pull NFL snap counts for a given season.

    Params:
        season (int): NFL season year (default 2025)

    Returns a TaskResult with data["stats"] containing the aggregated DataFrame.
    """
    season = params.get("season", 2025)
    print(f"Loading NFL snap counts for {season}...")

    try:
        snaps = nfl.import_snap_counts([season])

        if "game_type" in snaps.columns:
            snaps = snaps[snaps["game_type"] == "REG"]

        stats = snaps.groupby(["player", "position", "team"]).agg({
            "offense_snaps": "sum",
            "defense_snaps": "sum",
            "st_snaps": "sum",
            "game_id": "nunique",
        }).reset_index()

        stats.rename(columns={"game_id": "games_played"}, inplace=True)
        stats["total_snaps"] = stats["offense_snaps"] + stats["defense_snaps"] + stats["st_snaps"]

        print(f"Loaded {len(stats)} player snap records for {season}.")
        return TaskResult(success=True, data={"stats": stats, "season": season})

    except Exception as e:
        return TaskResult(success=False, error=str(e))
