/**
 * Unified data access layer for all web pages.
 *
 * This is the SINGLE place where data is fetched from Supabase and assembled
 * into typed objects. All pages should import from here instead of querying
 * Supabase directly or using page-specific fetch functions.
 *
 * Salary source of truth: `league_prices` table (current views).
 * Historical salary: transaction replay via `roster-reconstruction.ts`.
 */

import { supabase } from "./supabase";
import { LEAGUE_ID, SEASON } from "./config";
import type {
  Player,
  PlayerListItem,
  PublicArbPlayer,
  PlayerCardData,
  SeasonStats,
  Transaction,
} from "./types";

// ─── Core Fetchers ───────────────────────────────────────────────────────────

/**
 * Fetch all players with current season stats and league prices.
 * Used by analysis pages (VORP, surplus, arb, projections, etc.).
 *
 * Only includes players that have current-season stats.
 * Salary comes exclusively from `league_prices`.
 */
export async function fetchPlayers(): Promise<Player[]> {
  const [playersRes, statsRes, pricesRes] = await Promise.all([
    supabase.from("players").select("*").gt("ottoneu_id", 0),
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

  const merged: Player[] = [];

  for (const player of players) {
    const pStats = statsMap.get(String(player.id));
    const pPrice = pricesMap.get(String(player.id));

    // Only include players with current-season stats
    if (!pStats) continue;

    merged.push({
      player_id: player.id,
      ottoneu_id: player.ottoneu_id ?? 0,
      name: player.name,
      position: player.position ?? "",
      nfl_team: player.nfl_team ?? "",
      birth_date: player.birth_date ?? null,
      is_college: player.is_college ?? false,
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

/**
 * Fetch all players for the player directory page.
 * Includes all players (even those without stats), with nullable stats/price.
 * Salary comes exclusively from `league_prices` — no transaction override.
 */
export async function fetchPlayerList(): Promise<PlayerListItem[]> {
  const [playersRes, statsRes, pricesRes] = await Promise.all([
    supabase
      .from("players")
      .select("id, ottoneu_id, name, position, nfl_team")
      .gt("ottoneu_id", 0)
      .order("name"),
    supabase
      .from("player_stats")
      .select("player_id, total_points, games_played, ppg")
      .eq("season", SEASON),
    supabase
      .from("league_prices")
      .select("player_id, price, team_name")
      .eq("league_id", LEAGUE_ID),
  ]);

  const players = playersRes.data;
  if (!players) return [];

  const statsMap = new Map((statsRes.data ?? []).map((s) => [s.player_id, s]));
  const priceMap = new Map((pricesRes.data ?? []).map((p) => [p.player_id, p]));

  return players.map((p) => {
    const s = statsMap.get(p.id);
    const pr = priceMap.get(p.id);

    return {
      id: p.id,
      ottoneu_id: p.ottoneu_id,
      name: p.name,
      position: p.position ?? "",
      nfl_team: p.nfl_team ?? "",
      price: pr?.price != null ? Number(pr.price) : null,
      team_name: pr?.team_name || null,
      total_points: s ? Number(s.total_points) : null,
      ppg: s ? Number(s.ppg) : null,
      games_played: s?.games_played ?? null,
    };
  });
}

/**
 * Fetch a single player's full card data including season stats and transactions.
 * Salary comes from `league_prices` — transactions are displayed for history only.
 */
export async function fetchPlayerDetail(
  ottoneuId: number
): Promise<PlayerCardData | null> {
  const { data: player } = await supabase
    .from("players")
    .select("id, ottoneu_id, name, position, nfl_team, birth_date")
    .eq("ottoneu_id", ottoneuId)
    .single();

  if (!player) return null;

  const [statsRes, priceRes, txnRes] = await Promise.all([
    supabase
      .from("player_stats")
      .select("season, total_points, games_played, snaps, ppg, pps")
      .eq("player_id", player.id)
      .order("season", { ascending: false }),
    supabase
      .from("league_prices")
      .select("price, team_name")
      .eq("player_id", player.id)
      .eq("league_id", LEAGUE_ID)
      .maybeSingle(),
    supabase
      .from("transactions")
      .select(
        "id, transaction_type, team_name, from_team, salary, transaction_date, raw_description"
      )
      .eq("player_id", player.id)
      .eq("league_id", LEAGUE_ID)
      .order("transaction_date", { ascending: false }),
  ]);

  const pr = priceRes.data;
  const txns: Transaction[] = txnRes.data ?? [];

  // Salary from league_prices only — no transaction override
  const currentPrice = pr?.price != null ? Number(pr.price) : null;
  const currentTeam = pr?.team_name || null;

  const seasonStats: SeasonStats[] = (statsRes.data ?? []).map((row) => ({
    season: row.season,
    total_points: row.total_points != null ? Number(row.total_points) : null,
    games_played: row.games_played ?? null,
    snaps: row.snaps ?? null,
    ppg: row.ppg != null ? Number(row.ppg) : null,
    pps: row.pps != null ? Number(row.pps) : null,
  }));

  return {
    id: player.id,
    ottoneu_id: player.ottoneu_id,
    name: player.name,
    position: player.position ?? "",
    nfl_team: player.nfl_team ?? "",
    birth_date: player.birth_date ?? null,
    price: currentPrice,
    team_name: currentTeam,
    seasonStats,
    transactions: txns,
  };
}

/**
 * Fetch opponent-rostered players with PPG and games played.
 * Used by the public arb planner — no surplus/value data exposed.
 */
export async function fetchPublicArbPlayers(): Promise<PublicArbPlayer[]> {
  const players = await fetchPlayers();

  return players
    .filter((p) => p.team_name && p.team_name !== "" && p.team_name !== "FA")
    .map((p) => ({
      player_id: p.player_id,
      ottoneu_id: p.ottoneu_id,
      name: p.name,
      position: p.position,
      nfl_team: p.nfl_team,
      birth_date: p.birth_date,
      is_college: p.is_college,
      price: p.price,
      team_name: p.team_name,
      ppg: p.ppg,
      games_played: p.games_played,
    }));
}

/**
 * Fetch a single player's active projection for a given season.
 */
export async function fetchPlayerProjection(
  playerId: string,
  season = 2026
): Promise<{ projected_ppg: number; projection_method: string } | null> {
  const { data, error } = await supabase
    .from("player_projections")
    .select("projected_ppg, projection_method")
    .eq("player_id", playerId)
    .eq("season", season)
    .maybeSingle();

  if (error || !data) return null;

  return {
    projected_ppg: Number(data.projected_ppg),
    projection_method: data.projection_method,
  };
}
