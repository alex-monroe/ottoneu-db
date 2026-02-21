/**
 * Frontend configuration constants for Ottoneu League 309.
 *
 * NOTE: These constants must stay in sync with scripts/config.py.
 * When updating league settings or analysis parameters, update both files.
 */

export const LEAGUE_ID = 309;
export const SEASON = 2025;
export const HISTORICAL_SEASONS = [2022, 2023, 2024];
export const MY_TEAM = "The Witchcraft";
export const NUM_TEAMS = 12;
export const CAP_PER_TEAM = 400;
export const MIN_GAMES = 4;

// Replacement level: approximate number of fantasy-relevant players per position
// in a 12-team superflex league (accounts for 2 QBs starting per team).
// Used as fallback when salary-implied method lacks sufficient data.
export const REPLACEMENT_LEVEL: Record<string, number> = {
    QB: 24,
    RB: 30,
    WR: 30,
    TE: 20,
    K: 13,
};

// Salary-implied replacement level constants
export const SALARY_REPLACEMENT_PERCENTILE = 0.25; // bottom quartile of rostered salaries
export const MIN_SALARY_PLAYERS = 3;               // min players needed to use salary method

// NOTE: Database salaries already reflect the end-of-season $4/$1 bump.
// No additional salary projection is needed.

// Arbitration constants
export const ARB_BUDGET_PER_TEAM = 60;
export const ARB_MIN_PER_TEAM = 1;
export const ARB_MAX_PER_TEAM = 8;
export const ARB_MAX_PER_PLAYER_PER_TEAM = 4;
export const ARB_MAX_PER_PLAYER_LEAGUE = 44;

// Simulation parameters
export const NUM_SIMULATIONS = 100;
export const VALUE_VARIATION = 0.20; // ±20% value variation per team

export const POSITIONS = ["QB", "RB", "WR", "TE", "K"] as const;

export const POSITION_COLORS: Record<string, string> = {
    QB: "#EF4444",
    RB: "#3B82F6",
    WR: "#10B981",
    TE: "#F59E0B",
    K: "#8B5CF6",
};
