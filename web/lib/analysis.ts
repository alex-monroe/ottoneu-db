import { supabase } from "./supabase";
import {
  LEAGUE_ID,
  SEASON,
  HISTORICAL_SEASONS,
  Player,
} from "./arb-logic";
import { WeightedAveragePPG, RookieTrajectoryPPG, SeasonData } from "./projection-methods";
import type { MultiSeasonStats } from "./types";

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

  const merged: Player[] = [];

  for (const player of players) {
    const pStats = stats.find((s) => s.player_id === player.id);
    const pPrice = prices.find((p) => p.player_id === player.id);

    // Include all players that have stats, even if no price (free agents)
    if (!pStats) continue;

    merged.push({
      player_id: player.id,
      name: player.name,
      position: player.position,
      nfl_team: player.nfl_team,
      price: pPrice ? Number(pPrice.price) || 0 : 0,
      team_name: pPrice?.team_name || null,
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

export async function fetchMultiSeasonStats(
  seasons: number[] = HISTORICAL_SEASONS
): Promise<MultiSeasonStats[]> {
  const res = await supabase
    .from("player_stats")
    .select("player_id, season, ppg, games_played, h1_snaps, h1_games, h2_snaps, h2_games")
    .in("season", seasons);

  if (!res.data) return [];

  return res.data.map((row) => ({
    player_id: String(row.player_id),
    season: Number(row.season),
    ppg: Number(row.ppg) || 0,
    games_played: Number(row.games_played) || 0,
    h1_snaps: row.h1_snaps != null ? Number(row.h1_snaps) : undefined,
    h1_games: row.h1_games != null ? Number(row.h1_games) : undefined,
    h2_snaps: row.h2_snaps != null ? Number(row.h2_snaps) : undefined,
    h2_games: row.h2_games != null ? Number(row.h2_games) : undefined,
  }));
}

/**
 * Build a player_id → { ppg, method } map using composite projection:
 * - 1-season players: RookieTrajectoryPPG
 * - 2+ season players: WeightedAveragePPG
 */
function buildProjectionMap(
  multiSeasonStats: MultiSeasonStats[]
): Map<string, { ppg: number; method: string }> {
  const rookieMethod = new RookieTrajectoryPPG();
  const veteranMethod = new WeightedAveragePPG();
  const grouped = new Map<string, SeasonData[]>();

  for (const row of multiSeasonStats) {
    const existing = grouped.get(row.player_id) ?? [];
    existing.push({
      season: row.season,
      ppg: row.ppg,
      games_played: row.games_played,
      h1_snaps: row.h1_snaps,
      h1_games: row.h1_games,
      h2_snaps: row.h2_snaps,
      h2_games: row.h2_games,
    });
    grouped.set(row.player_id, existing);
  }

  const projections = new Map<string, { ppg: number; method: string }>();
  for (const [playerId, history] of grouped.entries()) {
    const chosenMethod = history.length === 1 ? rookieMethod : veteranMethod;
    const projected = chosenMethod.projectPpg(history);
    if (projected !== null) {
      projections.set(playerId, { ppg: projected, method: chosenMethod.name });
    }
  }

  return projections;
}

export interface ProjectedPlayer extends Player {
  observed_ppg: number;
  projection_method?: string;
}

// === Backtest / Projection Accuracy ===

import type { BacktestPlayer } from "./types";

const ALL_DB_SEASONS = [2022, 2023, 2024, 2025];

/**
 * Fetch current-season data + multi-season history, apply composite projections
 * (RookieTrajectoryPPG for 1-season players, WeightedAveragePPG for veterans),
 * and return Player[] with ppg = projected PPG where available, observed PPG
 * otherwise. All rostered players are included (no exclusions).
 *
 * Drop-in compatible with fetchAndMergeData() — returns Player[] not ProjectedPlayer[].
 */
export async function fetchPlayersWithProjectedPpg(): Promise<Player[]> {
  const [currentPlayers, multiSeasonStats] = await Promise.all([
    fetchAndMergeData(),
    fetchMultiSeasonStats(),
  ]);

  if (currentPlayers.length === 0 || multiSeasonStats.length === 0) {
    return currentPlayers;
  }

  const projectionMap = buildProjectionMap(multiSeasonStats);

  return currentPlayers.map((player) => {
    const projEntry = projectionMap.get(player.player_id);
    if (projEntry === undefined) return player; // no projection: use observed PPG
    return { ...player, ppg: projEntry.ppg };
  });
}

/**
 * Fetch historical + target-season data and apply WeightedAveragePPG projections
 * to produce per-player projected vs actual PPG for backtesting.
 */
export async function fetchBacktestData(
  targetSeason: number
): Promise<BacktestPlayer[]> {
  const histSeasons = ALL_DB_SEASONS.filter((s) => s < targetSeason).slice(-3);
  if (histSeasons.length === 0) return [];

  const [playersRes, targetStatsRes, histStatsRes, pricesRes] =
    await Promise.all([
      supabase.from("players").select("id, name, position, nfl_team"),
      supabase
        .from("player_stats")
        .select("player_id, ppg, games_played")
        .eq("season", targetSeason),
      supabase
        .from("player_stats")
        .select("player_id, season, ppg, games_played, h1_snaps, h1_games, h2_snaps, h2_games")
        .in("season", histSeasons),
      supabase
        .from("league_prices")
        .select("player_id, price, team_name")
        .eq("league_id", LEAGUE_ID)
        .eq("season", targetSeason),
    ]);

  if (!playersRes.data || !targetStatsRes.data || !histStatsRes.data) return [];

  const playerMap = new Map(
    playersRes.data.map((p) => [String(p.id), p])
  );
  const targetStatsMap = new Map(
    targetStatsRes.data.map((s) => [String(s.player_id), s])
  );
  const pricesMap = new Map(
    (pricesRes.data ?? []).map((p) => [String(p.player_id), p])
  );

  // Group history stats by player_id (include H1/H2 snap fields for rookie projection)
  const historyByPlayer = new Map<string, SeasonData[]>();
  for (const row of histStatsRes.data) {
    const playerId = String(row.player_id);
    const existing = historyByPlayer.get(playerId) ?? [];
    existing.push({
      season: Number(row.season),
      ppg: Number(row.ppg) || 0,
      games_played: Number(row.games_played) || 0,
      h1_snaps: row.h1_snaps != null ? Number(row.h1_snaps) : undefined,
      h1_games: row.h1_games != null ? Number(row.h1_games) : undefined,
      h2_snaps: row.h2_snaps != null ? Number(row.h2_snaps) : undefined,
      h2_games: row.h2_games != null ? Number(row.h2_games) : undefined,
    });
    historyByPlayer.set(playerId, existing);
  }

  const rookieMethod = new RookieTrajectoryPPG();
  const veteranMethod = new WeightedAveragePPG();
  const result: BacktestPlayer[] = [];

  for (const [playerId, history] of historyByPlayer.entries()) {
    const chosenMethod = history.length === 1 ? rookieMethod : veteranMethod;
    const projected = chosenMethod.projectPpg(history);
    if (projected === null) continue;

    const targetStats = targetStatsMap.get(playerId);
    if (!targetStats) continue; // player had no stats in target season

    const player = playerMap.get(playerId);
    if (!player) continue;

    const priceRow = pricesMap.get(playerId);
    const actual_ppg = Number(targetStats.ppg) || 0;
    const error = actual_ppg - projected;
    const sortedSeasons = [...history]
      .sort((a, b) => a.season - b.season)
      .map((h) => h.season);

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
      seasons_used: sortedSeasons.join(", "),
      games_played: Number(targetStats.games_played) || 0,
      projection_method: chosenMethod.name,
    });
  }

  return result;
}

/**
 * Fetch current-season data + multi-season history, apply WeightedAveragePPG
 * projections, and return players with ppg = projected_ppg and observed_ppg
 * preserved for display.
 *
 * Players with no projection history are excluded.
 */
export async function fetchAndMergeProjectedData(
  projectionYear: number = DEFAULT_PROJECTION_YEAR
): Promise<ProjectedPlayer[]> {
  const historicalSeasons = getHistoricalSeasonsForYear(projectionYear);
  const [currentPlayers, multiSeasonStats] = await Promise.all([
    fetchAndMergeData(),
    fetchMultiSeasonStats(historicalSeasons),
  ]);

  if (currentPlayers.length === 0) return [];
  if (multiSeasonStats.length === 0) {
    // No history available — fall back to observed PPG
    return currentPlayers.map((p) => ({ ...p, observed_ppg: p.ppg }));
  }

  const projectionMap = buildProjectionMap(multiSeasonStats);

  const projected: ProjectedPlayer[] = [];
  for (const player of currentPlayers) {
    const projEntry = projectionMap.get(player.player_id);
    if (projEntry === undefined) continue; // exclude players with no history

    projected.push({
      ...player,
      observed_ppg: player.ppg,
      ppg: projEntry.ppg,
      projection_method: projEntry.method,
    });
  }

  return projected;
}
