import { supabase, fetchAllRows } from "./supabase";
import { LEAGUE_ID, CAP_PER_TEAM } from "./config";
import { getLeagueSeason, getStatsSeason, type SeasonContext } from "./season";

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
  // Transactions follow the league season we're managing (the roster timeline);
  // player stats follow the most recent completed NFL season (PPG context).
  const [leagueSeason, statsSeason] = await Promise.all([
    getLeagueSeason(),
    getStatsSeason(),
  ]);
  // Paginate the league-wide reads (players ~1,252, league_prices ~1,252, and
  // transactions which can approach the cap) past PostgREST's 1000-row default.
  const [transactions, players, statsRes, leaguePrices] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("transactions")
        .select("player_id, transaction_type, team_name, salary, transaction_date")
        .eq("league_id", LEAGUE_ID)
        .eq("season", leagueSeason)
        .order("transaction_date", { ascending: true })
        .order("id").range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase.from("players").select("id, ottoneu_id, name, position, nfl_team").gt("ottoneu_id", 0).order("id").range(from, to),
    ),
    supabase
      .from("player_stats")
      .select("player_id, ppg, pps, games_played, snaps")
      .eq("season", statsSeason),
    fetchAllRows((from, to) =>
      supabase
        .from("league_prices")
        .select("player_id, price, team_name")
        .eq("league_id", LEAGUE_ID)
        .order("id").range(from, to),
    ),
  ]);

  return {
    transactions: transactions as RawTransaction[],
    players: players as RawPlayer[],
    stats: (statsRes.data as RawStats[]) ?? [],
    leaguePrices: leaguePrices as RawLeaguePrice[],
  };
}

// === Reconstruction Algorithm ===

interface PlayerState {
  team: string | null;
  salary: number;
  acquired_date: string;
  acquisition_type: string;
}

// "FA" (and empty/null) in league_prices/transactions denotes free agents,
// not a real fantasy team — those players are not on anyone's roster.
function isRealTeam(team: string | null | undefined): team is string {
  return team != null && team !== "" && team !== "FA";
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
      if (!isRealTeam(lp.team_name) || lp.price == null) continue;
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
      if (isRealTeam(txn.team_name)) {
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
    if (!isRealTeam(state.team)) continue;

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

export interface RosterSnapshot {
  label: string;
  date: string;
}

export interface RosterSnapshotConfig {
  dateRange: { min: string; max: string };
  quickDates: RosterSnapshot[];
  defaultDate: string;
}

/** Add `days` to a YYYY-MM-DD date, returning a YYYY-MM-DD string. */
function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Build the season-aware roster-snapshot scaffolding (date range, quick-jump
 * buttons, and the phase-appropriate default) from the resolved season context.
 *
 * Pure (no DB access) so it stays client-bundle-safe; the rosters page resolves
 * the context server-side and passes the result down. Weeks are anchored to the
 * league season's kickoff; the default snapshot flips to "Pre-Draft" once the
 * keeper deadline has passed (the pre_draft phase), per the season-cycle spec.
 */
export function buildRosterSnapshots(
  ctx: Pick<SeasonContext, "phase" | "leagueSeason" | "deadlines">,
  today: string = new Date().toISOString().slice(0, 10),
): RosterSnapshotConfig {
  const kickoff = ctx.deadlines.regular_season_start ?? null;
  const seasonStart = ctx.deadlines.season_start ?? null;
  const preDraftDate = kickoff ? addDays(kickoff, -1) : null;

  const quickDates: RosterSnapshot[] = [];
  if (preDraftDate) quickDates.push({ label: "Pre-Draft", date: preDraftDate });
  if (kickoff) {
    quickDates.push({ label: "Wk 1", date: kickoff });
    quickDates.push({ label: "Wk 8", date: addDays(kickoff, 49) });
    quickDates.push({ label: "Wk 16", date: addDays(kickoff, 105) });
  }
  quickDates.push({ label: "Today", date: today });

  const min = seasonStart ?? preDraftDate ?? `${ctx.leagueSeason}-01-01`;
  const defaultDate =
    ctx.phase === "pre_draft" && preDraftDate ? preDraftDate : today;

  return { dateRange: { min, max: today }, quickDates, defaultDate };
}
