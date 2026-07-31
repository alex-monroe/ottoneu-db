"""Task type constants and shared data structures for the scraper job queue."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Task type constants. The Ottoneu browser-scraping tasks (scrape_roster,
# scrape_player_card) were replaced by plain-HTTP tools (reconcile_roster.py,
# scrape_player_cards.py); only the browser-free nflverse pulls remain on the queue.
PULL_NFL_STATS = "pull_nfl_stats"
PULL_PLAYER_STATS = "pull_player_stats"

ALL_TASK_TYPES = [PULL_NFL_STATS, PULL_PLAYER_STATS]


@dataclass
class TaskResult:
    """Result returned by a task handler."""
    success: bool
    data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    child_jobs: list[dict[str, Any]] = field(default_factory=list)
