/**
 * Analysis and projection data fetching.
 *
 * This module builds on the unified data layer (data.ts) to provide
 * projection-enriched player data for analysis pages.
 *
 * Core data fetching (fetchPlayers, fetchPlayerList, fetchPlayerDetail)
 * lives in data.ts — import from there for non-projection needs.
 */

import { supabase } from "./supabase";
import { LEAGUE_ID, SEASON } from "./config";
import { fetchPlayers } from "./data";
import type { Player, PlayerHoverData, BacktestPlayer, ProjectionModel, BacktestMetrics } from "./types";

// Re-export from config/arb-logic for backward compatibility
export * from "./arb-logic";
export type { Player, SimulationResult } from "./types";

// Re-export core data fetchers so existing imports from analysis.ts still work
export { fetchPlayers, fetchPublicArbPlayers } from "./data";

/**
 * @deprecated Use `fetchPlayers()` from `@/lib/data` instead.
 * This alias exists for backward compatibility during migration.
 */
export const fetchAndMergeData = fetchPlayers;

// === Projection Year Config ===
export const PROJECTION_YEARS = [2025, 2026] as const;
export type ProjectionYear = typeof PROJECTION_YEARS[number];
export const DEFAULT_PROJECTION_YEAR: ProjectionYear = 2026;

export function getHistoricalSeasonsForYear(year: number): number[] {
  return [year - 3, year - 2, year - 1]; // e.g. 2026 → [2023, 2024, 2025]
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
    is_baseline: m.is_baseline ?? false,
    is_active: m.is_active ?? false,
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
    supabase.from("players").select("id, name, position, nfl_team").gt("ottoneu_id", 0),
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

/**
 * Fetch projection map as a plain object (JSON-serializable, for passing to client components).
 */
export async function fetchProjectionMap(
  season: number
): Promise<Record<string, { ppg: number; method: string }>> {
  const map = await buildProjectionMap(season);
  return Object.fromEntries(map);
}

/**
 * Build a PlayerHoverData map from player data and an optional projection map.
 * Used by server components to pass hover card data to client components.
 */
export function buildHoverDataMap(
  players: Player[],
  projMap: Record<string, { ppg: number; method: string }> | null = null
): Record<string, PlayerHoverData> {
  return Object.fromEntries(
    players
      .filter((p) => p.ottoneu_id != null)
      .map((p) => [
        p.player_id,
        {
          ottoneu_id: p.ottoneu_id!,
          position: p.position,
          nfl_team: p.nfl_team,
          price: p.price,
          team_name: p.team_name,
          ppg: p.ppg,
          games_played: p.games_played,
          ...(projMap?.[p.player_id]
            ? {
                projected_ppg: projMap[p.player_id].ppg,
                projection_method: projMap[p.player_id].method,
              }
            : {}),
        },
      ])
  );
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
  const currentPlayers = await fetchPlayers();

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
      supabase.from("players").select("id, name, position, nfl_team").gt("ottoneu_id", 0),
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
      seasons_used: 'N/A',
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
  const currentPlayers = await fetchPlayers();

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
