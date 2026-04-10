/**
 * Ottoneu Half PPR scoring formula.
 *
 * Fantasy points are always derivable from raw NFL stats. This module provides
 * the canonical TypeScript implementation of the scoring rules so that any
 * future need to compute points from stats uses a single source of truth.
 *
 * Scoring weights are loaded from the shared config.json.
 */

import { SCORING_SETTINGS } from "./config";

/** Raw stat line that can be scored. All fields default to 0 if absent. */
export interface ScorableStats {
  passing_yards?: number;
  passing_tds?: number;
  interceptions?: number;
  rushing_yards?: number;
  rushing_tds?: number;
  receptions?: number;
  receiving_yards?: number;
  receiving_tds?: number;
  fg_made_0_39?: number;
  fg_made_40_49?: number;
  fg_made_50_plus?: number;
  pat_made?: number;
}

/**
 * Calculate Ottoneu Half PPR fantasy points from raw NFL stats.
 *
 * This is the single source of truth for the scoring formula.
 * The same weights are used by the Python scraper when computing
 * nfl_stats.total_points.
 */
export function calculateFantasyPoints(stats: ScorableStats): number {
  return (
    (stats.passing_yards ?? 0) * SCORING_SETTINGS.passing_yards +
    (stats.passing_tds ?? 0) * SCORING_SETTINGS.passing_tds +
    (stats.interceptions ?? 0) * SCORING_SETTINGS.interceptions +
    (stats.rushing_yards ?? 0) * SCORING_SETTINGS.rushing_yards +
    (stats.rushing_tds ?? 0) * SCORING_SETTINGS.rushing_tds +
    (stats.receptions ?? 0) * SCORING_SETTINGS.receptions +
    (stats.receiving_yards ?? 0) * SCORING_SETTINGS.receiving_yards +
    (stats.receiving_tds ?? 0) * SCORING_SETTINGS.receiving_tds +
    (stats.fg_made_0_39 ?? 0) * SCORING_SETTINGS.fg_made_0_39 +
    (stats.fg_made_40_49 ?? 0) * SCORING_SETTINGS.fg_made_40_49 +
    (stats.fg_made_50_plus ?? 0) * SCORING_SETTINGS.fg_made_50_plus +
    (stats.pat_made ?? 0) * SCORING_SETTINGS.pat_made
  );
}
