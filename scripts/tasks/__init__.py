"""Task type constants and shared data structures for the scraper job queue."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Task type constants
PULL_NFL_STATS = "pull_nfl_stats"
PULL_PLAYER_STATS = "pull_player_stats"
SCRAPE_ROSTER = "scrape_roster"
SCRAPE_PLAYER_CARD = "scrape_player_card"

ALL_TASK_TYPES = [PULL_NFL_STATS, PULL_PLAYER_STATS, SCRAPE_ROSTER, SCRAPE_PLAYER_CARD]

# Tasks that require a Playwright browser
BROWSER_TASKS = {SCRAPE_ROSTER, SCRAPE_PLAYER_CARD}


@dataclass
class TaskResult:
    """Result returned by a task handler."""
    success: bool
    data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    child_jobs: list[dict[str, Any]] = field(default_factory=list)
