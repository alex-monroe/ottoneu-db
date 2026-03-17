"""Ottoneu Half-PPR scoring formula applied to FantasyPros stat-line projections."""

from __future__ import annotations


def stats_to_ppg(row: dict, games: int = 17) -> float | None:
    """Convert a projected stat line to Ottoneu Half-PPR PPG.

    Ottoneu scoring (from docs/references/ottoneu-rules.md):
        passing_yds * 0.04 + passing_tds * 4 + interceptions * -2
        + rushing_yds * 0.1 + rushing_tds * 6
        + receptions * 0.5 + receiving_yds * 0.1 + receiving_tds * 6

    Args:
        row: Dict with projected stat totals. Missing keys default to 0.
        games: Number of games to divide by for PPG. Defaults to 17.

    Returns:
        Projected PPG as a float, or None if games <= 0.
    """
    if games <= 0:
        return None

    def g(key: str) -> float:
        val = row.get(key, 0)
        try:
            return float(val) if val is not None else 0.0
        except (ValueError, TypeError):
            return 0.0

    total_points = (
        g("pass_yds") * 0.04
        + g("pass_tds") * 4.0
        + g("interceptions") * -2.0
        + g("rush_yds") * 0.1
        + g("rush_tds") * 6.0
        + g("receptions") * 0.5
        + g("rec_yds") * 0.1
        + g("rec_tds") * 6.0
    )

    return total_points / games
