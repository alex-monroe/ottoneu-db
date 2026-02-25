import { supabase } from "./supabase";
import {
  LEAGUE_ID,
  SEASON,
  Player,
} from "./arb-logic";
import type { BacktestPlayer } from "./types";

export * from "./arb-logic";

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

  const statsMap = new Map(stats.map((s) => [s.player_id, s]));
  const pricesMap = new Map(prices.map((p) => [p.player_id, p]));

  const merged: Player[] = [];

  for (const player of players) {
    const pStats = statsMap.get(player.id);
    const pPrice = pricesMap.get(player.id);

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
