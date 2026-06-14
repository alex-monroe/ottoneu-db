/**
 * Frontend configuration constants for Ottoneu League 309.
 *
 * The constants between the GENERATED markers below are emitted from the shared
 * config JSON by the `just gen-config` generator (scripts/gen_config) — do not
 * hand-edit them; edit the config JSON and regenerate. Hand-written constants
 * and helpers (simulation params, position colors, isCollegePlayer) live below
 * the block.
 *
 * Notes on the generated block:
 *   - The current season / phase / salary-snapshot dates are NOT static config —
 *     they are resolved from the league_calendar table (web/lib/season.ts:
 *     getStatsSeason / getProjectionSeason / getLeagueSeason / getSalarySnapshotDates).
 *   - REPLACEMENT_LEVEL approximates fantasy-relevant players per position in a
 *     12-team superflex league (2 QBs start/team); fallback when the
 *     salary-implied method lacks data.
 *   - Database salaries already reflect the end-of-season $4/$1 bump.
 *   - NFL_TEAM_CODES is a Set for O(1) college-player detection.
 */

import config from "../../config.json";

// --- BEGIN GENERATED CONFIG (do not edit; run `just gen-config`) ---
export const LEAGUE_ID = config.LEAGUE_ID;
export const MY_TEAM = config.MY_TEAM;
export const HISTORICAL_SEASONS = config.HISTORICAL_SEASONS;
export const NUM_TEAMS = config.NUM_TEAMS;
export const CAP_PER_TEAM = config.CAP_PER_TEAM;
export const POSITIONS = config.POSITIONS as unknown as readonly ["QB", "RB", "WR", "TE", "K"];
export const COLLEGE_POSITIONS: readonly string[] = config.COLLEGE_POSITIONS;
export const SCORING_SETTINGS = config.SCORING_SETTINGS;
export const MIN_GAMES = config.MIN_GAMES;
export const REPLACEMENT_LEVEL: Record<string, number> = config.REPLACEMENT_LEVEL;
export const SALARY_REPLACEMENT_PERCENTILE = config.SALARY_REPLACEMENT_PERCENTILE;
export const MIN_SALARY_PLAYERS = config.MIN_SALARY_PLAYERS;
export const ARB_BUDGET_PER_TEAM = config.ARB_BUDGET_PER_TEAM;
export const ARB_MIN_PER_TEAM = config.ARB_MIN_PER_TEAM;
export const ARB_MAX_PER_TEAM = config.ARB_MAX_PER_TEAM;
export const ARB_MAX_PER_PLAYER_PER_TEAM = config.ARB_MAX_PER_PLAYER_PER_TEAM;
export const ARB_MAX_PER_PLAYER_LEAGUE = config.ARB_MAX_PER_PLAYER_LEAGUE;
export const NFL_TEAM_CODES = new Set(config.NFL_TEAM_CODES);
// --- END GENERATED CONFIG ---

// Simulation parameters (hand-written — not in config.json)
export const NUM_SIMULATIONS = 100;
export const VALUE_VARIATION = 0.20; // ±20% value variation per team

export const POSITION_COLORS: Record<string, string> = {
    QB: "#EF4444",
    RB: "#3B82F6",
    WR: "#10B981",
    TE: "#F59E0B",
    K: "#8B5CF6",
};

/** Returns true if the nfl_team value represents a college rather than an NFL team. */
export function isCollegePlayer(nflTeam: string): boolean {
    return nflTeam !== "Unknown" && !NFL_TEAM_CODES.has(nflTeam);
}
