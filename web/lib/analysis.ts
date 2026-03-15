import { supabase } from "./supabase";
import {
  LEAGUE_ID,
  SEASON,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  MY_TEAM,
} from "./arb-logic";
import type { Player, BacktestPlayer, ProjectionModel, BacktestMetrics } from "./types";

export * from "./arb-logic";
export type { Player, SimulationResult } from "./types";

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

  if (playersRes.error) throw new Error(`Failed to fetch players: ${playersRes.error.message}`);
  if (statsRes.error) throw new Error(`Failed to fetch player stats: ${statsRes.error.message}`);
  if (pricesRes.error) throw new Error(`Failed to fetch league prices: ${pricesRes.error.message}`);

  const players = playersRes.data;
  const stats = statsRes.data;
  const prices = pricesRes.data;

  if (!players || !stats || !prices) {
    throw new Error("Failed to fetch data: returned null from Supabase");
  }

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
      position: player.position ?? "",
      nfl_team: player.nfl_team ?? "",
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

/**
 * Fetch opponent-rostered players with 2025 PPG and games played only.
 * Used by the public arb planner — no surplus/value data exposed.
 */
export async function fetchPublicArbPlayers(): Promise<import("./types").PublicArbPlayer[]> {
  const [playersRes, statsRes, pricesRes] = await Promise.all([
    supabase.from("players").select("*"),
    supabase.from("player_stats").select("*").eq("season", SEASON),
    supabase.from("league_prices").select("*").eq("league_id", LEAGUE_ID),
  ]);

  if (playersRes.error) throw new Error(`Failed to fetch players: ${playersRes.error.message}`);
  if (statsRes.error) throw new Error(`Failed to fetch player stats: ${statsRes.error.message}`);
  if (pricesRes.error) throw new Error(`Failed to fetch league prices: ${pricesRes.error.message}`);

  const players = playersRes.data;
  const stats = statsRes.data;
  const prices = pricesRes.data;

  if (!players || !stats || !prices) {
    throw new Error("Failed to fetch data: returned null from Supabase");
  }

  const statsMap = new Map(stats.map((s) => [String(s.player_id), s]));
  const pricesMap = new Map(prices.map((p) => [String(p.player_id), p]));

  const result: import("./types").PublicArbPlayer[] = [];

  for (const player of players) {
    const pStats = statsMap.get(String(player.id));
    const pPrice = pricesMap.get(String(player.id));

    // Only include players that have stats
    if (!pStats) continue;

    const teamName = pPrice?.team_name || null;

    // Filter to rostered players only (exclude FA/unrostered)
    if (!teamName || teamName === "" || teamName === "FA") continue;

    result.push({
      player_id: String(player.id),
      name: player.name,
      position: player.position ?? "",
      nfl_team: player.nfl_team ?? "",
      price: pPrice ? Number(pPrice.price) || 0 : 0,
      team_name: teamName,
      ppg: Number(pStats.ppg) || 0,
      games_played: Number(pStats.games_played) || 0,
    });
  }

  return result;
}

// === Projection Model Fetching ===

/**
 * Fetch available projection models from the projection_models table.
 */
export async function fetchAvailableModels(): Promise<ProjectionModel[]> {
  const { data, error } = await supabase
    .from("projection_models")
    .select("id, name, version, description, features, is_baseline, is_active")
    .order("name");

  if (error) throw new Error(`Failed to fetch projection models: ${error.message}`);
  return (data || []).map((m) => ({
    id: m.id,
    name: m.name,
    version: m.version,
    description: m.description,
    features: Array.isArray(m.features) ? m.features as string[] : JSON.parse(String(m.features) || "[]"),
    is_baseline: m.is_baseline,
    is_active: m.is_active,
  }));
}

/**
 * Fetch cached backtest results for a model and season.
 */
export async function fetchCachedBacktestResults(
  modelId: string,
  season: number
): Promise<BacktestMetrics[]> {
  const { data, error } = await supabase
    .from("backtest_results")
    .select("*")
    .eq("model_id", modelId)
    .eq("season", season);

  if (error) throw new Error(`Failed to fetch backtest results: ${error.message}`);
  return data || [];
}

/**
 * Build a projection map from model_projections for a specific model and season.
 */
async function buildModelProjectionMap(
  modelId: string,
  season: number
): Promise<Map<string, { ppg: number; featureValues: Record<string, number | null> | null }>> {
  const { data, error } = await supabase
    .from("model_projections")
    .select("player_id, projected_ppg, feature_values")
    .eq("model_id", modelId)
    .eq("season", season);

  if (error) throw new Error(`Failed to fetch model projections: ${error.message}`);

  const map = new Map<string, { ppg: number; featureValues: Record<string, number | null> | null }>();
  if (data) {
    for (const row of data) {
      const fv = row.feature_values
        ? typeof row.feature_values === "string"
          ? JSON.parse(row.feature_values)
          : row.feature_values
        : null;
      map.set(row.player_id, { ppg: row.projected_ppg, featureValues: fv });
    }
  }
  return map;
}

/**
 * Fetch backtest data using a specific projection model instead of player_projections.
 */
export async function fetchModelBacktestData(
  targetSeason: number,
  modelId: string
): Promise<BacktestPlayer[]> {
  const [playersRes, targetStatsRes, pricesRes] = await Promise.all([
    supabase.from("players").select("id, name, position, nfl_team"),
    supabase
      .from("player_stats")
      .select("player_id, ppg, games_played")
      .eq("season", targetSeason),
    supabase
      .from("league_prices")
      .select("player_id, price, team_name")
      .eq("league_id", LEAGUE_ID),
  ]);

  if (playersRes.error) throw new Error(`Failed to fetch players: ${playersRes.error.message}`);
  if (targetStatsRes.error) throw new Error(`Failed to fetch target season stats: ${targetStatsRes.error.message}`);
  if (pricesRes.error) throw new Error(`Failed to fetch target season prices: ${pricesRes.error.message}`);

  if (!playersRes.data || !targetStatsRes.data) {
    throw new Error("Failed to fetch data: returned null from Supabase");
  }

  const playerMap = new Map(playersRes.data.map((p) => [String(p.id), p]));
  const targetStatsMap = new Map(targetStatsRes.data.map((s) => [String(s.player_id), s]));
  const pricesMap = new Map((pricesRes.data ?? []).map((p) => [String(p.player_id), p]));

  const projectionMap = await buildModelProjectionMap(modelId, targetSeason);
  const result: BacktestPlayer[] = [];

  for (const [playerId, targetStats] of targetStatsMap.entries()) {
    const player = playerMap.get(playerId);
    if (!player) continue;

    const projEntry = projectionMap.get(playerId);
    if (!projEntry) continue;

    const priceRow = pricesMap.get(playerId);
    const actual_ppg = Number(targetStats.ppg) || 0;
    const projected = projEntry.ppg;
    const error = actual_ppg - projected;

    result.push({
      player_id: playerId,
      name: player.name,
      position: player.position ?? "",
      nfl_team: player.nfl_team ?? "",
      team_name: priceRow?.team_name ?? null,
      price: priceRow ? Number(priceRow.price) || 0 : 0,
      projected_ppg: projected,
      actual_ppg,
      error,
      abs_error: Math.abs(error),
      seasons_used: "N/A",
      games_played: Number(targetStats.games_played) || 0,
      projection_method: "model",
      feature_values: projEntry.featureValues,
    });
  }

  return result;
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

  if (projectionsError) {
    throw new Error(`Failed to fetch player projections: ${projectionsError.message}`);
  }

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
    throw new Error("Failed to fetch current players data for projection mapping");
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
        .eq("league_id", LEAGUE_ID),
    ]);

  if (playersRes.error) throw new Error(`Failed to fetch players: ${playersRes.error.message}`);
  if (targetStatsRes.error) throw new Error(`Failed to fetch target season stats: ${targetStatsRes.error.message}`);
  if (pricesRes.error) throw new Error(`Failed to fetch target season prices: ${pricesRes.error.message}`);

  if (!playersRes.data || !targetStatsRes.data) {
    throw new Error("Failed to fetch data: returned null from Supabase");
  }

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
      position: player.position ?? "",
      nfl_team: player.nfl_team ?? "",
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

  if (currentPlayers.length === 0) {
    throw new Error("Failed to fetch current players data for projection mapping");
  }

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
