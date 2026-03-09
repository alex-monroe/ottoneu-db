import { supabase } from "./supabase";
import {
  LEAGUE_ID,
  SEASON,
} from "./config";
import type { Player, BacktestPlayer, VorpPlayer, SurplusPlayer, ArbitrationTarget } from "./types";

import { allocateArbitrationBudget } from "./arbitration-budget";
export type { Player, SimulationResult } from "./types";
export { allocateArbitrationBudget };
export { runArbitrationSimulation } from "./simulation";
export { analyzeProjectedSalary } from "./salary-analysis";
export { NUM_SIMULATIONS, VALUE_VARIATION } from "./config";
export { SEASON, LEAGUE_ID, ARB_BUDGET_PER_TEAM, ARB_MIN_PER_TEAM, ARB_MAX_PER_TEAM, ARB_MAX_PER_PLAYER_PER_TEAM, NUM_TEAMS, CAP_PER_TEAM, MIN_GAMES, MY_TEAM } from "./config";
export { POSITIONS, POSITION_COLORS } from "./types";

// === Projection Year Config ===
export const PROJECTION_YEARS = [2025, 2026] as const;
export type ProjectionYear = typeof PROJECTION_YEARS[number];
export const DEFAULT_PROJECTION_YEAR: ProjectionYear = 2026;

export function getHistoricalSeasonsForYear(year: number): number[] {
  return [year - 3, year - 2, year - 1]; // e.g. 2026 → [2023, 2024, 2025]
}

// === Data Fetching ===
export async function fetchAndMergeData(): Promise<Player[]> {
  const [playersRes, statsRes, pricesRes] = await Promise.all([
    supabase.from("players").select("*"),
    supabase.from("player_stats").select("*").eq("season", SEASON),
    supabase
      .from("league_prices")
      .select("*")
      .eq("league_id", LEAGUE_ID),
  ]);

  const players = playersRes.data;
  const stats = statsRes.data;
  const prices = pricesRes.data;

  if (!players || !stats || !prices) return [];

  const statsMap = new Map(stats.map((s) => [String(s.player_id), s]));
  const pricesMap = new Map(prices.map((p) => [String(p.player_id), p]));

  const merged: Player[] = [];

  for (const player of players) {
    const pStats = statsMap.get(String(player.id));
    const pPrice = pricesMap.get(String(player.id));

    // Include all players that have stats, even if no price (free agents)
    if (!pStats) continue;

    merged.push({
      player_id: player.id,
      name: player.name,
      position: player.position,
      nfl_team: player.nfl_team,
      price: pPrice ? Number(pPrice.price) || 0 : 0,
      team_name: pPrice?.team_name || null,
      birth_date: player.birth_date ?? null,
      is_college: player.is_college ?? false,
      total_points: Number(pStats.total_points) || 0,
      games_played: Number(pStats.games_played) || 0,
      snaps: Number(pStats.snaps) || 0,
      ppg: Number(pStats.ppg) || 0,
      pps: Number(pStats.pps) || 0,
    });
  }

  return merged;
}

// === Multi-Season Projection ===

/**
 * Build a player_id → { ppg, method } map using data from player_projections table.
 */
async function buildProjectionMap(
  season: number
): Promise<Map<string, { ppg: number; method: string }>> {
  const { data: projectionsData, error: projectionsError } = await supabase
    .from("player_projections")
    .select("player_id, projected_ppg, projection_method")
    .eq("season", season);

  if (projectionsError) throw projectionsError;

  const projections = new Map<string, { ppg: number; method: string }>();
  if (projectionsData) {
    projectionsData.forEach(p => {
      projections.set(p.player_id, { ppg: p.projected_ppg, method: p.projection_method });
    });
  }

  return projections;
}

export interface ProjectedPlayer extends Player {
  observed_ppg: number;
  projection_method?: string;
}

// === Backtest / Projection Accuracy ===

/**
 * Fetch current-season data + db projections.
 * All rostered players are included.
 */
export async function fetchPlayersWithProjectedPpg(): Promise<Player[]> {
  const currentPlayers = await fetchAndMergeData();

  if (currentPlayers.length === 0) {
    return currentPlayers;
  }

  const projectionMap = await buildProjectionMap(SEASON);

  return currentPlayers.map((player) => {
    const projEntry = projectionMap.get(player.player_id);
    if (projEntry === undefined) return player; // no projection: use observed PPG
    return { ...player, ppg: projEntry.ppg };
  });
}

/**
 * Fetch historical + target-season data from DB and calculate error for backtesting.
 */
export async function fetchBacktestData(
  targetSeason: number
): Promise<BacktestPlayer[]> {
  const [playersRes, targetStatsRes, pricesRes] =
    await Promise.all([
      supabase.from("players").select("id, name, position, nfl_team"),
      supabase
        .from("player_stats")
        .select("player_id, ppg, games_played")
        .eq("season", targetSeason),
      supabase
        .from("league_prices")
        .select("player_id, price, team_name")
        .eq("league_id", LEAGUE_ID)
        .eq("season", targetSeason),
    ]);

  if (!playersRes.data || !targetStatsRes.data) return [];

  const playerMap = new Map(
    playersRes.data.map((p) => [String(p.id), p])
  );
  const targetStatsMap = new Map(
    targetStatsRes.data.map((s) => [String(s.player_id), s])
  );
  const pricesMap = new Map(
    (pricesRes.data ?? []).map((p) => [String(p.player_id), p])
  );

  const projectionMap = await buildProjectionMap(targetSeason);
  const result: BacktestPlayer[] = [];

  for (const [playerId, targetStats] of targetStatsMap.entries()) {
    const player = playerMap.get(playerId);
    if (!player) continue;

    const projEntry = projectionMap.get(playerId);
    if (!projEntry) continue; // Skip players with no projection

    const priceRow = pricesMap.get(playerId);
    const actual_ppg = Number(targetStats.ppg) || 0;
    const projected = projEntry.ppg;
    const error = actual_ppg - projected;

    result.push({
      player_id: playerId,
      name: player.name,
      position: player.position,
      nfl_team: player.nfl_team,
      team_name: priceRow?.team_name ?? null,
      price: priceRow ? Number(priceRow.price) || 0 : 0,
      projected_ppg: projected,
      actual_ppg,
      error,
      abs_error: Math.abs(error),
      seasons_used: 'N/A', // Deprecated stat now that it's in DB
      games_played: Number(targetStats.games_played) || 0,
      projection_method: projEntry.method,
    });
  }

  return result;
}

// === Analysis Metrics Fetching ===

/**
 * Fetch VORP data and merge with player data.
 */
export async function fetchVorpData(
  playersInput?: Player[],
  season: number = SEASON
): Promise<{ players: VorpPlayer[], replacementPpg: Record<string, number>, replacementN: Record<string, number> }> {
  const currentPlayers = playersInput ?? await fetchAndMergeData();
  if (currentPlayers.length === 0) return { players: [], replacementPpg: {}, replacementN: {} };

  const { data: vorpData, error } = await supabase
    .from("player_vorp")
    .select("*")
    .eq("season", season);

  if (error) throw error;

  const vorpMap = new Map(vorpData.map((v) => [v.player_id, v]));
  const players = [];
  const replacementPpg: Record<string, number> = {};
  const replacementN: Record<string, number> = {}; // Not stored in DB directly right now, but we can return empty or derive

  for (const player of currentPlayers) {
    const v = vorpMap.get(player.player_id);
    if (!v) continue;

    players.push({
      ...player,
      replacement_ppg: Number(v.replacement_ppg),
      vorp_per_game: Number(v.vorp_per_game),
      full_season_vorp: Number(v.full_season_vorp),
    });

    // Naively extract replacement PPG from the data
    if (!replacementPpg[player.position]) {
      replacementPpg[player.position] = Number(v.replacement_ppg);
    }
  }

  return { players, replacementPpg, replacementN };
}

/**
 * Fetch Surplus data and merge with player data.
 */
export async function fetchSurplusData(
  playersInput?: Player[],
  season: number = SEASON
): Promise<SurplusPlayer[]> {
  const basePlayers = playersInput ?? await fetchAndMergeData();
  if (basePlayers.length === 0) return [];

  // VORP is required for SurplusPlayer interface
  const { data: vorpData, error: vorpError } = await supabase
    .from("player_vorp")
    .select("*")
    .eq("season", season);
  if (vorpError) throw vorpError;

  const { data: surplusData, error } = await supabase
    .from("player_surplus")
    .select("*")
    .eq("season", season);

  if (error) throw error;

  const vorpMap = new Map(vorpData.map((v) => [v.player_id, v]));
  const surplusMap = new Map(surplusData.map((s) => [s.player_id, s]));
  const players = [];

  for (const player of basePlayers) {
    const v = vorpMap.get(player.player_id);
    const s = surplusMap.get(player.player_id);
    if (!v || !s) continue;

    players.push({
      ...player,
      replacement_ppg: Number(v.replacement_ppg),
      vorp_per_game: Number(v.vorp_per_game),
      full_season_vorp: Number(v.full_season_vorp),
      dollar_value: Number(s.dollar_value),
      surplus: Number(s.surplus),
    });
  }

  return players;
}

/**
 * Fetch Arbitration data and merge with player data.
 */
export async function fetchArbitrationData(
  playersInput?: Player[],
  adjustments?: Map<string, number> | Record<string, number>,
  season: number = SEASON
): Promise<ArbitrationTarget[]> {
  // If the frontend does adjustments, we might need to handle them or just return the DB base.
  // The backend already calculates the baseline arbitration targets.
  // Since adjustments are dynamic, we calculate the dynamic values if adjustments are passed.
  // But for the pure DB fetch, we do this:

  const basePlayers = await fetchSurplusData(playersInput, season);
  if (basePlayers.length === 0) return [];

  const { data: arbData, error } = await supabase
    .from("arbitration_targets")
    .select("*")
    .eq("season", season);

  if (error) throw error;

  const arbMap = new Map(arbData.map((a) => [a.player_id, a]));
  const players = [];

  for (const player of basePlayers) {
    const a = arbMap.get(player.player_id);
    if (!a) continue; // Only opponents who are arbitration targets have this

    let currentSurplus = player.surplus;
    let currentDollarValue = player.dollar_value;

    // Apply dynamic adjustments if provided
    let adj = 0;
    if (adjustments) {
        if (adjustments instanceof Map) {
            adj = adjustments.get(player.player_id) ?? 0;
        } else {
            adj = adjustments[player.player_id] ?? 0;
        }
    }
    currentDollarValue += adj;
    currentSurplus += adj;

    players.push({
      ...player,
      dollar_value: currentDollarValue,
      surplus: currentSurplus,
      salary_after_arb: Number(a.salary_after_arb),
      surplus_after_arb: currentSurplus - (Number(a.salary_after_arb) - player.price),
    });
  }

  return players.sort((a, b) => b.surplus_after_arb - a.surplus_after_arb);
}

/**
 * Fetch current-season data + projections.
 * Players with no projection history are excluded.
 */
export async function fetchAndMergeProjectedData(
  projectionYear: number = DEFAULT_PROJECTION_YEAR
): Promise<ProjectedPlayer[]> {
  const currentPlayers = await fetchAndMergeData();

  if (currentPlayers.length === 0) return [];

  const projectionMap = await buildProjectionMap(projectionYear);

  const projected: ProjectedPlayer[] = [];
  for (const player of currentPlayers) {
    const projEntry = projectionMap.get(player.player_id);
    if (projEntry === undefined) continue; // exclude players with no projection

    projected.push({
      ...player,
      observed_ppg: player.ppg,
      ppg: projEntry.ppg,
      projection_method: projEntry.method,
    });
  }

  return projected;
}
