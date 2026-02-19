import { supabase } from "./supabase";
import {
  LEAGUE_ID,
  SEASON,
  HISTORICAL_SEASONS,
  Player,
} from "./arb-logic";
import { WeightedAveragePPG, SeasonData } from "./projection-methods";
import type { MultiSeasonStats } from "./types";

export * from "./arb-logic";

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
    .select("player_id, season, ppg, games_played")
    .in("season", seasons);

  if (!res.data) return [];

  return res.data.map((row) => ({
    player_id: String(row.player_id),
    season: Number(row.season),
    ppg: Number(row.ppg) || 0,
    games_played: Number(row.games_played) || 0,
  }));
}

/**
 * Build a player_id → projected_ppg map using WeightedAveragePPG.
 */
function buildProjectionMap(
  multiSeasonStats: MultiSeasonStats[]
): Map<string, number> {
  const method = new WeightedAveragePPG();
  const grouped = new Map<string, SeasonData[]>();

  for (const row of multiSeasonStats) {
    const existing = grouped.get(row.player_id) ?? [];
    existing.push({
      season: row.season,
      ppg: row.ppg,
      games_played: row.games_played,
    });
    grouped.set(row.player_id, existing);
  }

  const projections = new Map<string, number>();
  for (const [playerId, history] of grouped.entries()) {
    const projected = method.projectPpg(history);
    if (projected !== null) {
      projections.set(playerId, projected);
    }
  }

  return projections;
}

export interface ProjectedPlayer extends Player {
  observed_ppg: number;
}

/**
 * Fetch current-season data + multi-season history, apply WeightedAveragePPG
 * projections, and return players with ppg = projected_ppg and observed_ppg
 * preserved for display.
 *
 * Players with no projection history are excluded.
 */
export async function fetchAndMergeProjectedData(): Promise<ProjectedPlayer[]> {
  const [currentPlayers, multiSeasonStats] = await Promise.all([
    fetchAndMergeData(),
    fetchMultiSeasonStats(),
  ]);

  if (currentPlayers.length === 0) return [];
  if (multiSeasonStats.length === 0) {
    // No history available — fall back to observed PPG
    return currentPlayers.map((p) => ({ ...p, observed_ppg: p.ppg }));
  }

  const projectionMap = buildProjectionMap(multiSeasonStats);

  const projected: ProjectedPlayer[] = [];
  for (const player of currentPlayers) {
    const projectedPpg = projectionMap.get(player.player_id);
    if (projectedPpg === undefined) continue; // exclude players with no history

    projected.push({
      ...player,
      observed_ppg: player.ppg,
      ppg: projectedPpg,
    });
  }

  return projected;
}
