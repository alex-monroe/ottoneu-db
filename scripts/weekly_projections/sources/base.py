"""The shape every weekly-projection source normalises to."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class WeeklyRow:
    """One player's projected (or actual) line for one NFL week.

    `stats` is keyed by scripts.config.SCORING_SETTINGS names, so
    scripts.weekly_projections.scoring can score it without knowing the source.
    """

    name: str
    position: str
    team: str
    week: int
    season: int
    stats: dict = field(default_factory=dict)
    opponent: str | None = None
