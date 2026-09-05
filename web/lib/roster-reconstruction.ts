import { supabase, fetchAllRows } from "./supabase";
import { LEAGUE_ID, CAP_PER_TEAM, NFL_REGULAR_SEASON_WEEKS } from "./config";
import { getSeasonContextNow, type SeasonContext } from "./season";

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

/**
 * League seasons we hold roster history for, newest first.
 *
 * Derived from the oldest and newest `season` in `transactions` rather than a
 * DISTINCT scan — PostgREST has no DISTINCT, and a league logs moves every
 * season once it starts, so two one-row queries beat paginating the column.
 */
export async function fetchRosterSeasons(): Promise<number[]> {
  const bound = (ascending: boolean) =>
    supabase
      .from("transactions")
      .select("season")
      .eq("league_id", LEAGUE_ID)
      .order("season", { ascending })
      .limit(1);
  const [newest, oldest] = await Promise.all([bound(false), bound(true)]);
  const max = (newest.data as { season: number }[] | null)?.[0]?.season;
  const min = (oldest.data as { season: number }[] | null)?.[0]?.season;
  if (max == null || min == null) return [];
  const seasons: number[] = [];
  for (let s = Number(max); s >= Number(min); s--) seasons.push(s);
  return seasons;
}

/**
 * Roster inputs for one league season's timeline.
 *
 * `season` selects which season's timeline to end on and defaults to the one
 * we're currently managing. Transactions are fetched **cumulatively** (every
 * season up to and including it), because a keeper league's roster state is
 * carried across the January rollover: a player added in the 2025 auction and
 * never cut has no 2026 acquisition row at all. Replaying a single season in
 * isolation therefore starts from an empty league and only ever finds that
 * season's own adds — which is why a mid-2026 date used to show two rostered
 * players league-wide instead of ~230.
 */
export async function fetchRosterData(season?: number): Promise<RosterData> {
  const ctx = await getSeasonContextNow();
  const leagueSeason = season ?? ctx.leagueSeason;
  // Player stats give the PPG context: the current season shows the most
  // recent completed NFL season (pre-kickoff there is nothing else to show),
  // while a past season shows its own — those games are in the books.
  const statsSeason =
    leagueSeason === ctx.leagueSeason ? ctx.statsSeason : leagueSeason;
  // Paginate the league-wide reads (players ~1,252, league_prices ~1,252, and
  // transactions which can approach the cap) past PostgREST's 1000-row default.
  const [transactions, players, stats, leaguePrices] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("transactions")
        .select("player_id, transaction_type, team_name, salary, transaction_date")
        .eq("league_id", LEAGUE_ID)
        .lte("season", leagueSeason)
        .order("transaction_date", { ascending: true })
        .order("id").range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase.from("players").select("id, ottoneu_id, name, position, nfl_team").gt("ottoneu_id", 0).order("id").range(from, to),
    ),
    // Paginate player_stats — a single season exceeds the 1000-row cap.
    fetchAllRows((from, to) =>
      supabase
        .from("player_stats")
        .select("player_id, ppg, pps, games_played, snaps")
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
  ]);

  return {
    transactions: transactions as RawTransaction[],
    players: players as RawPlayer[],
    stats: stats as RawStats[],
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
    } else if (type.includes("increase") || type.includes("decrease")) {
      // Ottoneu logs the season-rollover raise and arbitration as their own
      // event carrying the player's *new* salary, not the delta. Re-price the
      // roster spot and keep the acquisition we already know about; if history
      // starts mid-tenure the row itself still names the team holding him.
      const prior = playerStateMap.get(txn.player_id);
      const held = prior && isRealTeam(prior.team) ? prior : null;
      const team = held?.team ?? txn.team_name;
      if (isRealTeam(team)) {
        playerStateMap.set(txn.player_id, {
          team,
          salary: txn.salary ?? held?.salary ?? 0,
          acquired_date: held?.acquired_date ?? txn.transaction_date,
          acquisition_type: held?.acquisition_type ?? txn.transaction_type,
        });
      }
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

export interface RosterSnapshotOptions {
  /** League season being viewed; defaults to the one currently being managed. */
  season?: number;
  /** Earliest transaction date on record, which bounds how far back we can replay. */
  earliestDate?: string | null;
}

/** Add `days` to a YYYY-MM-DD date, returning a YYYY-MM-DD string. */
function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whichever of two YYYY-MM-DD dates comes first / last. */
const earlier = (a: string, b: string) => (a < b ? a : b);
const later = (a: string, b: string) => (a > b ? a : b);

/**
 * NFL Week 1's Thursday kickoff for a season we have no calendar row for.
 *
 * Ottoneu's finances page only publishes the *current* season's calendar, so a
 * past season's boundary dates can never be scraped after the fact. The NFL's
 * own rule fills the gap: Week 1 kicks off the Thursday after Labor Day (the
 * first Monday in September). Verified against 2019-2026.
 */
export function nflKickoff(season: number): string {
  const sept1 = `${season}-09-01`;
  const toMonday = (1 - new Date(`${sept1}T00:00:00Z`).getUTCDay() + 7) % 7;
  return addDays(sept1, toMonday + 3);
}

/**
 * One quick-jump per NFL week that has actually begun, anchored to kickoff.
 *
 * Weeks past `latest` are omitted rather than rendered dead: a button for a
 * game that has not been played can only show today's roster, which reads as a
 * bug. Week N is that week's Thursday, so the snapshot is the roster the teams
 * carried into the slate.
 */
function weekQuickDates(kickoff: string | null, latest: string): RosterSnapshot[] {
  if (!kickoff) return [];
  const weeks: RosterSnapshot[] = [];
  for (let w = 1; w <= NFL_REGULAR_SEASON_WEEKS; w++) {
    const date = addDays(kickoff, (w - 1) * 7);
    if (date > latest) break;
    weeks.push({ label: `Wk ${w}`, date });
  }
  return weeks;
}

/**
 * Build the roster-snapshot scaffolding (date range, quick-jump buttons, and
 * the default snapshot) for the league season being viewed.
 *
 * Pure (no DB access) so it stays client-bundle-safe; the rosters page resolves
 * the context server-side and passes the result down. `opts.season` picks the
 * season — omit it for the one we're currently managing, which is the only one
 * with published calendar dates and a live "Today".
 *
 * Current season: weeks are anchored to Ottoneu's `regular_season_start`, and
 * the default snapshot flips to "Pre-Draft" once the keeper deadline has passed
 * (the pre_draft phase), per the season-cycle spec. The "Pre-Draft" quick-jump
 * anchors to the day before the auction when Ottoneu has published an auction
 * date — that is the last roster state before the draft reshuffles it. Without
 * one it falls back to the day before kickoff. Once the auction has happened
 * (post_draft) the default is "Today", since the pre-auction snapshot is no
 * longer the interesting view.
 *
 * Past season: there is no calendar row (see {@link nflKickoff}) and no
 * "Today", so weeks anchor to the NFL's own kickoff rule, the window closes the
 * day the next season began, and the default is that closing day — the roster
 * as the season finished.
 */
export function buildRosterSnapshots(
  ctx: Pick<SeasonContext, "phase" | "leagueSeason" | "deadlines">,
  today: string = new Date().toISOString().slice(0, 10),
  opts: RosterSnapshotOptions = {},
): RosterSnapshotConfig {
  const season = opts.season ?? ctx.leagueSeason;
  return season === ctx.leagueSeason
    ? currentSeasonSnapshots(ctx, today)
    : pastSeasonSnapshots(ctx, season, today, opts.earliestDate ?? null);
}

function currentSeasonSnapshots(
  ctx: Pick<SeasonContext, "phase" | "leagueSeason" | "deadlines">,
  today: string,
): RosterSnapshotConfig {
  const kickoff = ctx.deadlines.regular_season_start ?? null;
  const seasonStart = ctx.deadlines.season_start ?? null;
  const auctionDate = ctx.deadlines.auction_date ?? null;
  const preDraftAnchor = auctionDate ?? kickoff;
  const preDraftDate = preDraftAnchor ? addDays(preDraftAnchor, -1) : null;

  const quickDates: RosterSnapshot[] = [];
  if (preDraftDate) quickDates.push({ label: "Pre-Draft", date: preDraftDate });
  if (auctionDate && auctionDate <= today) {
    quickDates.push({ label: "Post-Draft", date: auctionDate });
  }
  quickDates.push(...weekQuickDates(kickoff, today));
  quickDates.push({ label: "Today", date: today });

  const min = seasonStart ?? preDraftDate ?? `${ctx.leagueSeason}-01-01`;
  const defaultDate =
    ctx.phase === "pre_draft" && preDraftDate ? preDraftDate : today;

  return { dateRange: { min, max: today }, quickDates, defaultDate };
}

function pastSeasonSnapshots(
  ctx: Pick<SeasonContext, "leagueSeason" | "deadlines">,
  season: number,
  today: string,
  earliestDate: string | null,
): RosterSnapshotConfig {
  // A season runs until the next one starts. We know that date only for the
  // season immediately before the current one (it is the live calendar row's
  // `season_start`); older seasons fall back to the calendar year.
  const successorStart =
    season + 1 === ctx.leagueSeason ? ctx.deadlines.season_start ?? null : null;
  const seasonEnd = successorStart ? addDays(successorStart, -1) : `${season}-12-31`;
  const max = earlier(seasonEnd, today);
  // Nothing is reconstructible before the first move we hold, but that bound is
  // only relevant while it falls inside the season being viewed.
  const min = earliestDate ? later(earliestDate, `${season}-01-01`) : `${season}-01-01`;

  const quickDates = weekQuickDates(nflKickoff(season), max);
  quickDates.push({ label: "Season End", date: max });

  return { dateRange: { min: earlier(min, max), max }, quickDates, defaultDate: max };
}
