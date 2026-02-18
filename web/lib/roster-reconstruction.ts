import { supabase } from "./supabase";
import { LEAGUE_ID, SEASON, CAP_PER_TEAM } from "./arb-logic";

// === Types ===

export interface RosterEntry {
  player_id: string;
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

export interface RosterData {
  transactions: RawTransaction[];
  players: RawPlayer[];
  stats: RawStats[];
}

// === Data Fetching ===

export async function fetchRosterData(): Promise<RosterData> {
  const [txnRes, playersRes, statsRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("player_id, transaction_type, team_name, salary, transaction_date")
      .eq("league_id", LEAGUE_ID)
      .eq("season", SEASON)
      .order("transaction_date", { ascending: true }),
    supabase.from("players").select("id, name, position, nfl_team"),
    supabase
      .from("player_stats")
      .select("player_id, ppg, pps, games_played, snaps")
      .eq("season", SEASON),
  ]);

  return {
    transactions: (txnRes.data as RawTransaction[]) ?? [],
    players: (playersRes.data as RawPlayer[]) ?? [],
    stats: (statsRes.data as RawStats[]) ?? [],
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
  targetDate: string
): TeamRoster[] {
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
