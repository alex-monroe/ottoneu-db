import { supabase } from "./supabase";
import { LEAGUE_ID, SEASON, CAP_PER_TEAM } from "./config";

// === Types ===

export interface RosterEntry {
  player_id: string;
  ottoneu_id?: number;
  name: string;
  position: string;
  nfl_team: string;
  salary: number;
  acquired_date: string;
  acquisition_type: string;
  ppg: number | null;
  pps: number | null;
  games_played: number | null;
  snaps: number | null;
  [key: string]: string | number | null | undefined;
}

export interface TeamRoster {
  team_name: string;
  players: RosterEntry[];
  total_salary: number;
  cap_space: number;
}

// === Raw DB types ===

interface RawTransaction {
  player_id: string;
  transaction_type: string;
  team_name: string | null;
  salary: number | null;
  transaction_date: string | null;
}

interface RawPlayer {
  id: string;
  ottoneu_id?: number;
  name: string;
  position: string;
  nfl_team: string;
}

interface RawStats {
  player_id: string;
  ppg: number | null;
  pps: number | null;
  games_played: number | null;
  snaps: number | null;
}

interface RawLeaguePrice {
  player_id: string;
  price: number | null;
  team_name: string | null;
}

export interface RosterData {
  transactions: RawTransaction[];
  players: RawPlayer[];
  stats: RawStats[];
  leaguePrices: RawLeaguePrice[];
}

// === Data Fetching ===

export async function fetchRosterData(): Promise<RosterData> {
  const [txnRes, playersRes, statsRes, pricesRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("player_id, transaction_type, team_name, salary, transaction_date")
      .eq("league_id", LEAGUE_ID)
      .eq("season", SEASON)
      .order("transaction_date", { ascending: true }),
    supabase.from("players").select("id, ottoneu_id, name, position, nfl_team").gt("ottoneu_id", 0),
    supabase
      .from("player_stats")
      .select("player_id, ppg, pps, games_played, snaps")
      .eq("season", SEASON),
    supabase
      .from("league_prices")
      .select("player_id, price, team_name")
      .eq("league_id", LEAGUE_ID),
  ]);

  return {
    transactions: (txnRes.data as RawTransaction[]) ?? [],
    players: (playersRes.data as RawPlayer[]) ?? [],
    stats: (statsRes.data as RawStats[]) ?? [],
    leaguePrices: (pricesRes.data as RawLeaguePrice[]) ?? [],
  };
}

// === Reconstruction Algorithm ===

interface PlayerState {
  team: string | null;
  salary: number;
  acquired_date: string;
  acquisition_type: string;
}

export function reconstructRostersAtDate(
  transactions: RawTransaction[],
  players: RawPlayer[],
  stats: RawStats[],
  targetDate: string,
  leaguePrices?: RawLeaguePrice[]
): TeamRoster[] {
  const today = new Date().toISOString().slice(0, 10);
  const useCurrentPrices = targetDate >= today && leaguePrices && leaguePrices.length > 0;

  // If viewing current rosters, use league_prices as the source of truth
  if (useCurrentPrices) {
    const playerMap = new Map<string, RawPlayer>(players.map((p) => [p.id, p]));
    const statsMap = new Map<string, RawStats>(stats.map((s) => [s.player_id, s]));

    // Find the latest transaction per player for acquired_date/acquisition_type
    const latestTxnMap = new Map<string, { acquired_date: string; acquisition_type: string }>();
    for (const txn of transactions) {
      if (!txn.transaction_date) continue;
      const type = txn.transaction_type.toLowerCase();
      if (type.includes("cut") || type.includes("drop")) continue;
      const existing = latestTxnMap.get(txn.player_id);
      if (!existing || txn.transaction_date >= existing.acquired_date) {
        latestTxnMap.set(txn.player_id, {
          acquired_date: txn.transaction_date,
          acquisition_type: txn.transaction_type,
        });
      }
    }

    const teamMap = new Map<string, RosterEntry[]>();
    for (const lp of leaguePrices) {
      if (!lp.team_name || lp.price == null) continue;
      const player = playerMap.get(lp.player_id);
      if (!player) continue;
      const pStats = statsMap.get(lp.player_id);
      const txnInfo = latestTxnMap.get(lp.player_id);

      const entry: RosterEntry = {
        player_id: lp.player_id,
        ottoneu_id: player.ottoneu_id,
        name: player.name,
        position: player.position,
        nfl_team: player.nfl_team,
        salary: lp.price,
        acquired_date: txnInfo?.acquired_date ?? "",
        acquisition_type: txnInfo?.acquisition_type ?? "",
        ppg: pStats?.ppg ?? null,
        pps: pStats?.pps ?? null,
        games_played: pStats?.games_played ?? null,
        snaps: pStats?.snaps ?? null,
      };

      const list = teamMap.get(lp.team_name) ?? [];
      list.push(entry);
      teamMap.set(lp.team_name, list);
    }

    return Array.from(teamMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([team_name, players]) => {
        const total_salary = players.reduce((sum, p) => sum + p.salary, 0);
        return {
          team_name,
          players: players.sort((a, b) => a.name.localeCompare(b.name)),
          total_salary,
          cap_space: CAP_PER_TEAM - total_salary,
        };
      });
  }

  // Historical reconstruction: replay transactions up to targetDate
  const playerStateMap = new Map<string, PlayerState>();

  for (const txn of transactions) {
    if (!txn.transaction_date) continue;
    if (txn.transaction_date > targetDate) continue;

    const type = txn.transaction_type.toLowerCase();

    if (type.includes("cut") || type.includes("drop")) {
      playerStateMap.set(txn.player_id, {
        team: null,
        salary: txn.salary ?? 0,
        acquired_date: txn.transaction_date,
        acquisition_type: txn.transaction_type,
      });
    } else if (
      type.includes("move") ||
      type.includes("add") ||
      type.includes("auction") ||
      type.includes("waiver") ||
      type.includes("signed") ||
      type.includes("rostered")
    ) {
      if (txn.team_name) {
        playerStateMap.set(txn.player_id, {
          team: txn.team_name,
          salary: txn.salary ?? 0,
          acquired_date: txn.transaction_date,
          acquisition_type: txn.transaction_type,
        });
      }
    }
  }

  // Build lookup maps
  const playerMap = new Map<string, RawPlayer>(players.map((p) => [p.id, p]));
  const statsMap = new Map<string, RawStats>(stats.map((s) => [s.player_id, s]));

  // Group by team
  const teamMap = new Map<string, RosterEntry[]>();

  for (const [player_id, state] of playerStateMap.entries()) {
    if (!state.team) continue;

    const player = playerMap.get(player_id);
    if (!player) continue;

    const pStats = statsMap.get(player_id);

    const entry: RosterEntry = {
      player_id,
      ottoneu_id: player.ottoneu_id,
      name: player.name,
      position: player.position,
      nfl_team: player.nfl_team,
      salary: state.salary,
      acquired_date: state.acquired_date,
      acquisition_type: state.acquisition_type,
      ppg: pStats?.ppg ?? null,
      pps: pStats?.pps ?? null,
      games_played: pStats?.games_played ?? null,
      snaps: pStats?.snaps ?? null,
    };

    const list = teamMap.get(state.team) ?? [];
    list.push(entry);
    teamMap.set(state.team, list);
  }

  // Build TeamRoster[] sorted alphabetically
  const rosters: TeamRoster[] = Array.from(teamMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([team_name, players]) => {
      const total_salary = players.reduce((sum, p) => sum + p.salary, 0);
      return {
        team_name,
        players: players.sort((a, b) => a.name.localeCompare(b.name)),
        total_salary,
        cap_space: CAP_PER_TEAM - total_salary,
      };
    });

  return rosters;
}

// === Convenience Utilities ===

export function getRosterForTeam(rosters: TeamRoster[], teamName: string): TeamRoster | undefined {
  return rosters.find((r) => r.team_name === teamName);
}

export function getDateRange(): { min: string; max: string } {
  const today = new Date().toISOString().slice(0, 10);
  return { min: "2025-09-01", max: today };
}
