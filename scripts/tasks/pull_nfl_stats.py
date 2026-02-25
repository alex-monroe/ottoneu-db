"""Task: Pull NFL snap counts via nfl_data_py (sync, no browser needed)."""

import nfl_data_py as nfl

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

        # Compute H1 (weeks 1-8) and H2 (weeks 9-16) snap splits
        H1_WEEKS = list(range(1, 9))
        H2_WEEKS = list(range(9, 17))

        snaps_h1 = snaps[snaps["week"].isin(H1_WEEKS)].copy()
        snaps_h1["total_snaps_calc"] = snaps_h1["offense_snaps"] + snaps_h1["defense_snaps"] + snaps_h1["st_snaps"]
        h1_agg = snaps_h1.groupby(["player", "position", "team"]).agg(
            h1_snaps=("total_snaps_calc", "sum"),
            h1_games=("game_id", "nunique"),
        ).reset_index()

        snaps_h2 = snaps[snaps["week"].isin(H2_WEEKS)].copy()
        snaps_h2["total_snaps_calc"] = snaps_h2["offense_snaps"] + snaps_h2["defense_snaps"] + snaps_h2["st_snaps"]
        h2_agg = snaps_h2.groupby(["player", "position", "team"]).agg(
            h2_snaps=("total_snaps_calc", "sum"),
            h2_games=("game_id", "nunique"),
        ).reset_index()

        stats = stats.merge(
            h1_agg[["player", "position", "team", "h1_snaps", "h1_games"]],
            on=["player", "position", "team"], how="left"
        )
        stats = stats.merge(
            h2_agg[["player", "position", "team", "h2_snaps", "h2_games"]],
            on=["player", "position", "team"], how="left"
        )
        for col in ["h1_snaps", "h1_games", "h2_snaps", "h2_games"]:
            stats[col] = stats[col].fillna(0).astype(int)

        print(f"Loaded {len(stats)} player snap records for {season}.")
        return TaskResult(success=True, data={"stats": stats, "season": season})

    except Exception as e:
        return TaskResult(success=False, error=str(e))
