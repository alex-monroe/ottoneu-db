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
import { LEAGUE_ID, SEASON, SEASON_END_DATE, PRE_ARB_DATE } from "./config";
import type {
  Player,
  PlayerListItem,
  PublicArbPlayer,
  PlayerCardData,
  SeasonStats,
  Transaction,
} from "./types";

// ─── Salary-at-Date (Transaction Replay) ─────────────────────────────────────

/**
 * Build a player_id → { salary, team_name } map by replaying transactions
 * up to a cutoff date. For players without transaction history, falls back
 * to league_prices (nearly all are $1 bench stashes or college prospects).
 *
 * @param salaryDate - inclusive cutoff date (YYYY-MM-DD). Transactions on
 *   this date ARE included.
 */
async function buildSalaryMapAtDate(
  salaryDate: string
): Promise<Map<string, { salary: number; team_name: string | null }>> {
  // Fetch ALL transactions (both seasons) — we need the full history
  // to capture players acquired before the current season.
  const [txnRes, pricesRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("player_id, transaction_type, team_name, salary, transaction_date")
      .eq("league_id", LEAGUE_ID)
      .lte("transaction_date", salaryDate)
      .order("transaction_date", { ascending: true }),
    supabase
      .from("league_prices")
      .select("player_id, price, team_name")
      .eq("league_id", LEAGUE_ID),
  ]);

  const transactions = txnRes.data ?? [];
  const leaguePrices = pricesRes.data ?? [];

  // Replay transactions to build point-in-time salary state
  const salaryMap = new Map<string, { salary: number; team_name: string | null }>();

  for (const txn of transactions) {
    if (!txn.transaction_date) continue;
    const type = txn.transaction_type.toLowerCase();

    if (type.includes("cut") || type.includes("drop")) {
      salaryMap.set(txn.player_id, { salary: txn.salary ?? 0, team_name: null });
    } else {
      salaryMap.set(txn.player_id, {
        salary: txn.salary ?? 0,
        team_name: txn.team_name,
      });
    }
  }

  // For players in league_prices without any transaction history,
  // fall back to current price. These are overwhelmingly $1 bench stashes
  // or college prospects whose salary hasn't changed.
  for (const lp of leaguePrices) {
    if (!salaryMap.has(lp.player_id) && lp.price != null && lp.team_name) {
      salaryMap.set(lp.player_id, {
        salary: Number(lp.price),
        team_name: lp.team_name,
      });
    }
  }

  return salaryMap;
}

/**
 * Fetch players with stats, using salary from a specific historical date
 * via transaction replay.
 *
 * Use `SEASON_END_DATE` for end-of-season analysis (VORP, surplus).
 * Use `PRE_ARB_DATE` for pre-arbitration analysis (arb targets, simulation).
 */
export async function fetchPlayersAtDate(salaryDate: string): Promise<Player[]> {
  const [playersRes, statsRes, salaryMap] = await Promise.all([
    supabase.from("players").select("*").gt("ottoneu_id", 0),
    supabase.from("player_stats").select("*").eq("season", SEASON),
    buildSalaryMapAtDate(salaryDate),
  ]);

  if (playersRes.error) throw new Error(`Failed to fetch players: ${playersRes.error.message}`);
  if (statsRes.error) throw new Error(`Failed to fetch player stats: ${statsRes.error.message}`);

  const players = playersRes.data;
  const stats = statsRes.data;

  if (!players || !stats) {
    throw new Error("Failed to fetch data: returned null from Supabase");
  }

  const statsMap = new Map(stats.map((s) => [String(s.player_id), s]));

  const merged: Player[] = [];

  for (const player of players) {
    const pStats = statsMap.get(String(player.id));
    if (!pStats) continue;

    const salaryEntry = salaryMap.get(String(player.id));

    merged.push({
      player_id: player.id,
      ottoneu_id: player.ottoneu_id ?? 0,
      name: player.name,
      position: player.position ?? "",
      nfl_team: player.nfl_team ?? "",
      birth_date: player.birth_date ?? null,
      is_college: player.is_college ?? false,
      price: salaryEntry?.salary ?? 0,
      team_name: salaryEntry?.team_name ?? null,
      total_points: Number(pStats.total_points) || 0,
      games_played: Number(pStats.games_played) || 0,
      snaps: Number(pStats.snaps) || 0,
      ppg: Number(pStats.ppg) || 0,
      pps: Number(pStats.pps) || 0,
    });
  }

  return merged;
}

/** Fetch players with end-of-season salaries (before +$4/+$1 bump). */
export function fetchPlayersEndOfSeason(): Promise<Player[]> {
  return fetchPlayersAtDate(SEASON_END_DATE);
}

/** Fetch players with pre-arbitration salaries (after auto bump, before arb results). */
export function fetchPlayersPreArb(): Promise<Player[]> {
  return fetchPlayersAtDate(PRE_ARB_DATE);
}

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
 * Uses pre-arbitration salaries (after auto bump, before arb results).
 */
export async function fetchPublicArbPlayers(): Promise<PublicArbPlayer[]> {
  const players = await fetchPlayersPreArb();

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

// ─── Active Projection Model ──────────────────────────────────────────────────

export interface ActiveProjectionModel {
  id: string;
  name: string;
  version: number;
  description: string | null;
  features: string[];
}

/**
 * Fetch the projection model currently flagged is_active=TRUE.
 *
 * Single source of truth for "which model is the site serving right now".
 * Methodology blurbs across /projections, /arbitration, /projection-accuracy
 * read from this so they stay in sync with what `promote.py` last set.
 */
export async function fetchActiveProjectionModel(): Promise<ActiveProjectionModel | null> {
  const { data, error } = await supabase
    .from("projection_models")
    .select("id, name, version, description, features")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;

  const features = Array.isArray(data.features)
    ? (data.features as string[])
    : typeof data.features === "string"
      ? (JSON.parse(data.features) as string[])
      : [];

  return {
    id: data.id,
    name: data.name,
    version: data.version,
    description: data.description ?? null,
    features,
  };
}
