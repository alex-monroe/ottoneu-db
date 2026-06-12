/**
 * Analysis and projection data fetching.
 *
 * This module builds on the unified data layer (data.ts) to provide
 * projection-enriched player data for analysis pages.
 *
 * Core data fetching (fetchPlayers, fetchPlayerList, fetchPlayerDetail)
 * lives in data.ts — import from there for non-projection needs.
 */

import { supabase, fetchAllRows } from "./supabase";
import { LEAGUE_ID } from "./config";
import { getStatsSeason, getProjectionSeason } from "./season";
import { fetchPlayers, fetchDraftSharksMap, type DraftSharksValue } from "./data";
import type { Player, PlayerHoverData, BacktestPlayer, ProjectionModel, BacktestMetrics } from "./types";

// Re-export from config/arb-logic for backward compatibility
export * from "./arb-logic";
export type { Player, SimulationResult } from "./types";

// Re-export core data fetchers so existing imports from analysis.ts still work
export {
  fetchPlayers,
  fetchPublicArbPlayers,
  fetchPlayersEndOfSeason,
  fetchPlayersPreArb,
} from "./data";

/**
 * @deprecated Use `fetchPlayers()` from `@/lib/data` instead.
 * This alias exists for backward compatibility during migration.
 */
export const fetchAndMergeData = fetchPlayers;

// === Projection Year Config ===
// The active projection season is resolved dynamically via the season-cycle
// resolver (see web/lib/season.ts: getProjectionSeason). Pages derive their
// selectable projection years from { statsSeason, projectionSeason } rather
// than a hardcoded list.

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
  // Paginate model_projections — a single model+season can exceed the 1000-row cap.
  const data = await fetchAllRows((from, to) =>
    supabase
      .from("model_projections")
      .select("player_id, projected_ppg, feature_values")
      .eq("model_id", modelId)
      .eq("season", season)
      .order("player_id").range(from, to),
  );

  const map = new Map<string, { ppg: number; featureValues: Record<string, number | null> | null }>();
  for (const row of data) {
    const fv = row.feature_values
      ? typeof row.feature_values === "string"
        ? JSON.parse(row.feature_values)
        : row.feature_values
      : null;
    map.set(row.player_id, { ppg: row.projected_ppg, featureValues: fv });
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
  // Paginate players (~1,252) and league_prices (~1,252) past the 1000-row cap.
  const [players, targetStats, prices] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from("players").select("id, name, position, nfl_team").gt("ottoneu_id", 0).order("id").range(from, to),
    ),
    // Paginate player_stats — a single season exceeds the 1000-row cap.
    fetchAllRows((from, to) =>
      supabase
        .from("player_stats")
        .select("player_id, ppg, games_played")
        .eq("season", targetSeason)
        .order("player_id").range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("league_prices")
        .select("player_id, price, team_name")
        .eq("league_id", LEAGUE_ID)
        .order("id").range(from, to),
    ),
  ]);

  const playerMap = new Map(players.map((p) => [String(p.id), p]));
  const targetStatsMap = new Map(targetStats.map((s) => [String(s.player_id), s]));
  const pricesMap = new Map(prices.map((p) => [String(p.player_id), p]));

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
): Promise<Map<string, { ppg: number; method: string; games: number | null }>> {
  // Paginate: a single season of player_projections (~1,289-1,458) exceeds the
  // 1000-row cap, so a plain select silently drops ~25% of projected players.
  const projectionsData = await fetchAllRows((from, to) =>
    supabase
      .from("player_projections")
      .select("player_id, projected_ppg, projection_method, projected_games")
      .eq("season", season)
      .order("id").range(from, to),
  );

  const projections = new Map<string, { ppg: number; method: string; games: number | null }>();
  if (projectionsData) {
    projectionsData.forEach(p => {
      projections.set(p.player_id, {
        ppg: p.projected_ppg,
        method: p.projection_method,
        games: p.projected_games,
      });
    });
  }

  return projections;
}

/**
 * Fetch projection map as a plain object (JSON-serializable, for passing to client components).
 */
export async function fetchProjectionMap(
  season: number
): Promise<Record<string, { ppg: number; method: string; games: number | null }>> {
  const map = await buildProjectionMap(season);
  return Object.fromEntries(map);
}

/**
 * Build a PlayerHoverData map from player data and an optional projection map.
 * Used by server components to pass hover card data to client components.
 */
export function buildHoverDataMap(
  players: Player[],
  projMap: Record<string, { ppg: number; method: string; games?: number | null }> | null = null,
  dsMap: Record<string, DraftSharksValue> | null = null
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
          ...(dsMap?.[p.player_id]
            ? {
                ds_auction_value: dsMap[p.player_id].ds_auction_value,
                market_auction_value: dsMap[p.player_id].market_auction_value,
              }
            : {}),
        },
      ])
  );
}

/**
 * Fetch the projection-access-gated extras (projection map + Draft Sharks map)
 * used to enrich hover cards. Returns nulls when the user lacks access so
 * callers can pass the result straight into buildHoverDataMap.
 */
export async function fetchHoverExtras(
  hasProjectionsAccess: boolean,
  season?: number
): Promise<{
  projMap: Record<string, { ppg: number; method: string }> | null;
  dsMap: Record<string, DraftSharksValue> | null;
}> {
  if (!hasProjectionsAccess) {
    return { projMap: null, dsMap: null };
  }
  const resolvedSeason = season ?? (await getProjectionSeason());
  const [projMap, dsMap] = await Promise.all([
    fetchProjectionMap(resolvedSeason),
    fetchDraftSharksMap(resolvedSeason),
  ]);
  return { projMap, dsMap };
}

export interface ProjectedPlayer extends Player {
  observed_ppg: number;
  projection_method?: string;
}

// === Backtest / Projection Accuracy ===

/**
 * Fetch current-season data + db projections.
 * All rostered players are included.
 *
 * @param baseFetcher - optional override for the player data source.
 *   Use `fetchPlayersPreArb` for pre-arbitration salary context.
 */
export async function fetchPlayersWithProjectedPpg(
  baseFetcher: () => Promise<Player[]> = fetchPlayers
): Promise<Player[]> {
  const currentPlayers = await baseFetcher();

  if (currentPlayers.length === 0) {
    throw new Error("Failed to fetch current players data for projection mapping");
  }

  const projectionMap = await buildProjectionMap(await getStatsSeason());

  return currentPlayers.map((player) => {
    const projEntry = projectionMap.get(player.player_id);
    if (projEntry === undefined) return player; // no projection: use observed PPG
    // ppg = raw projected rate (for display); projected_games lets the value
    // math (calculateVorp) availability-discount it without changing the rate.
    return { ...player, ppg: projEntry.ppg, projected_games: projEntry.games };
  });
}

/**
 * Fetch historical + target-season data from DB and calculate error for backtesting.
 */
export async function fetchBacktestData(
  targetSeason: number
): Promise<BacktestPlayer[]> {
  // Paginate players (~1,252) and league_prices (~1,252) past the 1000-row cap.
  const [players, targetStats, prices] =
    await Promise.all([
      fetchAllRows((from, to) =>
        supabase.from("players").select("id, name, position, nfl_team").gt("ottoneu_id", 0).order("id").range(from, to),
      ),
      // Paginate player_stats — a single season exceeds the 1000-row cap.
      fetchAllRows((from, to) =>
        supabase
          .from("player_stats")
          .select("player_id, ppg, games_played")
          .eq("season", targetSeason)
          .order("player_id").range(from, to),
      ),
      fetchAllRows((from, to) =>
        supabase
          .from("league_prices")
          .select("player_id, price, team_name")
          .eq("league_id", LEAGUE_ID)
          .order("id").range(from, to),
      ),
    ]);

  const playerMap = new Map(
    players.map((p) => [String(p.id), p])
  );
  const targetStatsMap = new Map(
    targetStats.map((s) => [String(s.player_id), s])
  );
  const pricesMap = new Map(
    prices.map((p) => [String(p.player_id), p])
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
 *
 * @param projectionYear - season to fetch projections for.
 * @param baseFetcher - optional override for the player data source.
 *   Use `fetchPlayersPreArb` for pre-arbitration salary context.
 */
export async function fetchAndMergeProjectedData(
  projectionYear?: number,
  baseFetcher: () => Promise<Player[]> = fetchPlayers
): Promise<ProjectedPlayer[]> {
  const currentPlayers = await baseFetcher();

  if (currentPlayers.length === 0) {
    throw new Error("Failed to fetch current players data for projection mapping");
  }

  const projectionMap = await buildProjectionMap(
    projectionYear ?? (await getProjectionSeason())
  );

  const projected: ProjectedPlayer[] = [];
  for (const player of currentPlayers) {
    const projEntry = projectionMap.get(player.player_id);
    if (projEntry === undefined) continue; // exclude players with no projection

    projected.push({
      ...player,
      observed_ppg: player.ppg,
      ppg: projEntry.ppg,
      projected_games: projEntry.games,
      projection_method: projEntry.method,
    });
  }

  return projected;
}

// === Projection Board (rookie-inclusive) ===

/**
 * Projection methods used for players with no NFL track record. These players
 * have a `player_projections` row but no `player_stats` history, so a stats-keyed
 * fetch (fetchPlayers) silently drops them. The board treats them as rookies.
 */
const ROOKIE_PROJECTION_METHODS = new Set([
  "rookie_draft_capital",
  "college_prospect",
]);

/** Human-readable label for a rookie projection source. */
export function rookieSourceLabel(method: string): string | null {
  switch (method) {
    case "rookie_draft_capital":
      return "Rookie";
    case "college_prospect":
      return "College";
    default:
      return null;
  }
}

function ageFromBirthDate(birth: string | null): number | null {
  if (!birth) return null;
  const ts = Date.parse(birth);
  if (Number.isNaN(ts)) return null;
  return Math.floor((Date.now() - ts) / (365.25 * 86_400_000));
}

export interface ProjectionBoardRow {
  player_id: string;
  ottoneu_id: number;
  name: string;
  position: string;
  nfl_team: string;
  team_name: string | null;
  price: number;
  /** Observed PPG in `statsSeason` (null for players with no NFL history). */
  observed_ppg: number | null;
  projected_ppg: number;
  /** projected − observed (null when there is no observed baseline). */
  ppg_delta: number | null;
  projection_method: string;
  is_rookie: boolean;
  age: number | null;
  games_played: number;
  overall_rank: number;
  position_rank: number;
}

/**
 * Fetch every projected player for `projectionYear` — including rookies and
 * college prospects that have no `player_stats` history. Unlike
 * `fetchAndMergeProjectedData` (which builds on the stats-keyed `fetchPlayers`
 * and therefore drops historyless players), this uses `player_projections` as
 * the source of truth for inclusion and left-joins stats/prices/identity.
 *
 * Rows are sorted by projected PPG (desc) with overall + positional ranks.
 */
export async function fetchProjectionBoard(
  projectionYear: number,
  statsSeason: number
): Promise<ProjectionBoardRow[]> {
  const [players, stats, prices, projMap] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("players")
        .select("id, ottoneu_id, name, position, nfl_team, birth_date, is_college")
        .gt("ottoneu_id", 0)
        .order("id").range(from, to),
    ),
    // Paginate player_stats — a single season exceeds the 1000-row cap.
    fetchAllRows((from, to) =>
      supabase
        .from("player_stats")
        .select("player_id, ppg, games_played")
        .eq("season", statsSeason)
        .order("player_id").range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("league_prices")
        .select("player_id, price, team_name")
        .eq("league_id", LEAGUE_ID)
        .order("id").range(from, to),
    ),
    buildProjectionMap(projectionYear),
  ]);

  const playerMap = new Map(players.map((p) => [String(p.id), p]));
  const statsMap = new Map(
    stats.map((s) => [String(s.player_id), s])
  );
  const pricesMap = new Map(prices.map((p) => [String(p.player_id), p]));

  const rows: Array<Omit<ProjectionBoardRow, "overall_rank" | "position_rank">> =
    [];
  for (const [playerId, proj] of projMap.entries()) {
    const player = playerMap.get(playerId);
    if (!player) continue;

    const stats = statsMap.get(playerId);
    const priceRow = pricesMap.get(playerId);
    const observed = stats ? Number(stats.ppg) || 0 : null;
    const isRookie =
      ROOKIE_PROJECTION_METHODS.has(proj.method) || Boolean(player.is_college);

    rows.push({
      player_id: playerId,
      ottoneu_id: player.ottoneu_id ?? 0,
      name: player.name,
      position: player.position ?? "",
      nfl_team: player.nfl_team ?? "",
      team_name: priceRow?.team_name ?? null,
      price: priceRow ? Number(priceRow.price) || 0 : 0,
      observed_ppg: observed,
      projected_ppg: proj.ppg,
      ppg_delta: observed === null ? null : proj.ppg - observed,
      projection_method: proj.method,
      is_rookie: isRookie,
      age: ageFromBirthDate(player.birth_date ?? null),
      games_played: stats ? Number(stats.games_played) || 0 : 0,
    });
  }

  rows.sort((a, b) => b.projected_ppg - a.projected_ppg);

  const posCounters: Record<string, number> = {};
  return rows.map((r, i) => {
    posCounters[r.position] = (posCounters[r.position] ?? 0) + 1;
    return { ...r, overall_rank: i + 1, position_rank: posCounters[r.position] };
  });
}
