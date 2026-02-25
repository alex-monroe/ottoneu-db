/**
 * Frontend configuration constants for Ottoneu League 309.
 *
 * Configuration values are loaded from the shared config.json in the repo root.
 */

import config from "../../config.json";

export const LEAGUE_ID = config.LEAGUE_ID;
export const SEASON = config.SEASON;
export const HISTORICAL_SEASONS = config.HISTORICAL_SEASONS;
export const MY_TEAM = config.MY_TEAM;
export const NUM_TEAMS = config.NUM_TEAMS;
export const CAP_PER_TEAM = config.CAP_PER_TEAM;
export const MIN_GAMES = config.MIN_GAMES;

// Replacement level: approximate number of fantasy-relevant players per position
// in a 12-team superflex league (accounts for 2 QBs starting per team).
// Used as fallback when salary-implied method lacks sufficient data.
export const REPLACEMENT_LEVEL: Record<string, number> = config.REPLACEMENT_LEVEL;

// Salary-implied replacement level constants
export const SALARY_REPLACEMENT_PERCENTILE = config.SALARY_REPLACEMENT_PERCENTILE;
export const MIN_SALARY_PLAYERS = config.MIN_SALARY_PLAYERS;

// NOTE: Database salaries already reflect the end-of-season $4/$1 bump.
// No additional salary projection is needed.

// Arbitration constants
export const ARB_BUDGET_PER_TEAM = config.ARB_BUDGET_PER_TEAM;
export const ARB_MIN_PER_TEAM = config.ARB_MIN_PER_TEAM;
export const ARB_MAX_PER_TEAM = config.ARB_MAX_PER_TEAM;
export const ARB_MAX_PER_PLAYER_PER_TEAM = config.ARB_MAX_PER_PLAYER_PER_TEAM;
export const ARB_MAX_PER_PLAYER_LEAGUE = config.ARB_MAX_PER_PLAYER_LEAGUE;

// Simulation parameters
export const NUM_SIMULATIONS = 100;
export const VALUE_VARIATION = 0.20; // ±20% value variation per team

export const POSITIONS = config.POSITIONS as readonly ["QB", "RB", "WR", "TE", "K"];

export const POSITION_COLORS: Record<string, string> = {
    QB: "#EF4444",
    RB: "#3B82F6",
    WR: "#10B981",
    TE: "#F59E0B",
    K: "#8B5CF6",
};

// All 32 NFL team abbreviations as used by Ottoneu (note: "LA" for Rams, "JAC" for Jaguars).
// Used to distinguish college players (whose nfl_team field contains a college name).
export const NFL_TEAM_CODES = new Set(config.NFL_TEAM_CODES);

/** Returns true if the nfl_team value represents a college rather than an NFL team. */
export function isCollegePlayer(nflTeam: string): boolean {
    return nflTeam !== "Unknown" && !NFL_TEAM_CODES.has(nflTeam);
}
