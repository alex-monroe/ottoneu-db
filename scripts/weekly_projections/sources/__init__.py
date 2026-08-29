"""Weekly-projection providers. One module per source, all returning WeeklyRow."""

from scripts.weekly_projections.sources.base import WeeklyRow

__all__ = ["WeeklyRow"]
