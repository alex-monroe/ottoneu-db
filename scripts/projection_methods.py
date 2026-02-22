"""Projection methods for forecasting player PPG.

Each method implements the ProjectionMethod protocol:
    project_ppg(history) -> float | None

history is a list of SeasonData dicts with keys:
    season: int
    ppg: float
    games_played: int

Adding a new projection method = one new class, no pipeline changes needed.
"""

from __future__ import annotations
from typing import Optional, Protocol, TypedDict


class SeasonData(TypedDict, total=False):
    season: int       # required
    ppg: float        # required
    games_played: int # required
    h1_snaps: int
    h1_games: int
    h2_snaps: int
    h2_games: int


class ProjectionMethod(Protocol):
    name: str

    def project_ppg(self, history: list[SeasonData]) -> Optional[float]:
        """Project next-season PPG from historical season data.

        Args:
            history: List of season records, sorted ascending by season.

        Returns:
            Projected PPG, or None if insufficient data.
        """
        ...


class WeightedAveragePPG:
    """Games-weighted, recency-weighted average PPG.

    Most recent season gets highest recency weight. Each season's contribution
    is further scaled by games_played / 17 to discount injury-shortened years.

    Recency weights (most recent first): 0.50, 0.30, 0.20
    """

    name = "weighted_average_ppg"

    # Recency weights from most-recent to oldest season
    RECENCY_WEIGHTS = [0.50, 0.30, 0.20]

    def project_ppg(self, history: list[SeasonData]) -> Optional[float]:
        if not history:
            return None

        # Sort ascending by season and take up to 3 most recent
        sorted_history = sorted(history, key=lambda s: s["season"])
        recent = sorted_history[-3:]  # at most 3 seasons, most recent last

        # Assign recency weights from the end (most recent = weight[0])
        n = len(recent)
        weights_to_use = self.RECENCY_WEIGHTS[:n]

        numerator = 0.0
        denominator = 0.0

        for i, season_data in enumerate(reversed(recent)):
            recency_w = weights_to_use[i]
            games_scale = season_data["games_played"] / 17.0
            effective_w = recency_w * games_scale

            numerator += season_data["ppg"] * effective_w
            denominator += effective_w

        if denominator == 0:
            return None

        return numerator / denominator


class RookieTrajectoryPPG:
    """Projection for players with exactly one prior season (rookies/first-year).

    Uses H2 snaps-per-game / H1 snaps-per-game as a usage trajectory factor.
    Projected PPG = season_ppg × clamp(h2_spg / h1_spg, 0.75, 1.50)

    Falls back to season_ppg if H1 snap data is missing or zero.
    """

    name = "rookie_trajectory"
    MIN_FACTOR = 0.75
    MAX_FACTOR = 1.50

    def project_ppg(self, history: list[SeasonData]) -> Optional[float]:
        if len(history) != 1:
            return None
        s = history[0]
        if not s.get("ppg"):
            return None
        h1_spg = (s.get("h1_snaps") or 0) / max(s.get("h1_games") or 1, 1)
        h2_spg = (s.get("h2_snaps") or 0) / max(s.get("h2_games") or 1, 1)
        if h1_spg == 0:
            return float(s["ppg"])
        factor = min(max(h2_spg / h1_spg, self.MIN_FACTOR), self.MAX_FACTOR)
        return s["ppg"] * factor


class CollegeProspectPPG:
    """Projection for college players with no NFL history.

    Uses the average PPG of first-year NFL players (rookies) at the same
    position as the projected value. Requires a pre-computed map of
    position -> average rookie PPG passed at construction time.
    """

    name = "college_prospect"

    def __init__(self, avg_rookie_ppg_by_position: dict[str, float]):
        self._avg_ppg = avg_rookie_ppg_by_position

    def project_ppg(self, history: list[SeasonData], position: str | None = None) -> Optional[float]:
        """Return the average rookie PPG for the given position.

        Args:
            history: Ignored for college players (they have no NFL history).
            position: The player's position (QB, RB, WR, TE).

        Returns:
            Average rookie PPG at position, or None if position is unknown.
        """
        if not position:
            return None
        return self._avg_ppg.get(position)
