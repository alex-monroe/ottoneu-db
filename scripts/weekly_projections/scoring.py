"""Ottoneu scoring applied to a single game's projected (or actual) stat line.

The seasonal twin, scripts/feature_projections/external_sources/scoring.py,
hardcodes its multipliers and divides by a game count to produce PPG. This one
reads the multipliers from scripts.scoring.FULL_SCORING — SCORING_SETTINGS plus
SCORING_EXTRAS (fumbles lost, two-point conversions, missed kicks), so a scoring
change in config.json propagates automatically — and returns points for ONE game,
the unit the weekly feature is about.

It also scores kickers, which the seasonal helper omits entirely: Ottoneu's field
goals are distance-tiered (3/4/5 points by yardage bucket), which is exactly the
reason we never take a source's own fantasy point total. Their "half PPR" is not
this league's half PPR.
"""

from __future__ import annotations

from scripts.scoring import FULL_SCORING

# Our normalised stat keys are deliberately the FULL_SCORING keys, so scoring
# is a dot product and a new scoring category needs no code change here — only a
# source-side mapping to the new key.
STAT_KEYS: tuple[str, ...] = tuple(FULL_SCORING.keys())


def _num(value) -> float:
    """Coerce a stat value to a float, treating missing/garbage as zero."""
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def score_stat_line(stats: dict) -> float:
    """Ottoneu points for a single game from a normalised stat line.

    Args:
        stats: Dict keyed by the names in FULL_SCORING. Missing keys count
            as zero, so a WR's stat line needs no passing entries.

    Returns:
        Points for that one game, rounded to two decimals.

    Mirrors scripts/tasks/pull_player_stats._calc_points, which scores actual
    season totals the same way.
    """
    total = 0.0
    for stat, multiplier in FULL_SCORING.items():
        total += _num(stats.get(stat)) * multiplier
    return round(total, 2)


def normalised_stats(stats: dict) -> dict:
    """Keep only the keys that score, dropping zero/absent ones.

    Keeps the jsonb we persist small and readable: a kicker's row carries field
    goals and extra points, not eight zeroed passing categories.
    """
    return {k: _num(stats[k]) for k in STAT_KEYS if k in stats and _num(stats[k]) != 0.0}
