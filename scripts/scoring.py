"""The league's full fantasy scoring: SCORING_SETTINGS plus SCORING_EXTRAS.

SCORING_SETTINGS holds the categories every stat source carries (yards, TDs,
receptions, interceptions, made kicks). SCORING_EXTRAS holds the rest of what
Ottoneu scores — fumbles lost, two-point conversions, missed field goals and
PATs. Matching Ottoneu's box scores to the hundredth needs both (see
scripts/rebuild_score_worm.py), so any points-from-stats calculation scores
over FULL_SCORING.

Stat keys are the scoring keys, so scoring a stat line is a dot product: a
source only has to map its columns onto these names.
"""

from __future__ import annotations

import pandas as pd

from scripts.config import SCORING_EXTRAS, SCORING_SETTINGS

FULL_SCORING: dict[str, float] = {**SCORING_SETTINGS, **SCORING_EXTRAS}

EXTRA_KEYS: tuple[str, ...] = tuple(SCORING_EXTRAS.keys())


def _col(df: pd.DataFrame, name: str) -> pd.Series:
    """A numeric column, or zeros when the frame lacks it."""
    if name not in df.columns:
        return pd.Series(0.0, index=df.index)
    return pd.to_numeric(df[name], errors="coerce").fillna(0.0)


def add_nflverse_extras(df: pd.DataFrame) -> pd.DataFrame:
    """Add the SCORING_EXTRAS stat columns to an nflverse ``stats_player`` frame.

    Works on the season (``stats_player_reg``) and weekly (``stats_player_week``)
    files alike, and returns ``df`` with the new columns set in place:

    - ``fumbles_lost``: ``fumbles_lost_total`` — every fumble lost, returns
      included, as the play-by-play rebuild counts them. Falls back to the sum of
      the sack/rushing/receiving splits for a file without the total.
    - ``two_point_pass``: ``passing_2pt_conversions``.
    - ``two_point_rush_rec``: ``rushing_2pt_conversions`` + ``receiving_2pt_conversions``.
    - ``fg_missed`` / ``pat_missed``: attempts minus makes. nflverse's own
      ``fg_missed`` / ``pat_missed`` leave out blocked kicks, which Ottoneu
      docks too.

    Missing source columns count as zero.
    """
    if "fumbles_lost_total" in df.columns:
        df["fumbles_lost"] = _col(df, "fumbles_lost_total")
    else:
        df["fumbles_lost"] = (
            _col(df, "sack_fumbles_lost")
            + _col(df, "rushing_fumbles_lost")
            + _col(df, "receiving_fumbles_lost")
        )
    df["two_point_pass"] = _col(df, "passing_2pt_conversions")
    df["two_point_rush_rec"] = _col(df, "rushing_2pt_conversions") + _col(df, "receiving_2pt_conversions")
    df["fg_missed"] = (_col(df, "fg_att") - _col(df, "fg_made")).clip(lower=0)
    df["pat_missed"] = (_col(df, "pat_att") - _col(df, "pat_made")).clip(lower=0)
    return df


def score_stats(stats: dict) -> float:
    """Unrounded Ottoneu points for a stat line keyed by FULL_SCORING names.

    Missing or None values count as zero.
    """
    return sum((stats.get(stat) or 0) * multiplier for stat, multiplier in FULL_SCORING.items())
