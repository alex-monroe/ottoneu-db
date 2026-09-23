/**
 * Podcast power rankings: two ballots in, one countdown out.
 *
 * Each host ranks all twelve teams ahead of an NFL week, independently and
 * without seeing the other's ordering. The show then reveals the consolidated
 * list from twelfth up to first. This module owns both halves of that: the
 * consolidation maths (pure, below) and the reads/writes the /podcast pages and
 * /api/podcast routes need.
 *
 * ## How the ballots are consolidated
 *
 * **Mean rank.** A team's consolidated position is the average of its positions
 * across the submitted ballots, ascending. With two voters this is the same
 * ordering a Borda count gives, and it has the property that matters on air:
 * every disagreement is legible as a number, so "he had them fourth, I had them
 * ninth" is right there on the card rather than lost inside a score.
 *
 * **Ties break towards conviction, not consensus.** Two voters produce ties
 * constantly — (1st, 3rd) and (2nd, 2nd) both average 2.0 — so the tiebreak is
 * load-bearing rather than a formality. It runs:
 *
 *   1. lower mean rank;
 *   2. then the better *best* rank — the team somebody was willing to put
 *      higher wins the slot, which is the more interesting argument to have out
 *      loud than rewarding the team nobody felt strongly about;
 *   3. then the better worst rank;
 *   4. then team name, so the order is fully deterministic and re-rendering the
 *      reveal page mid-episode cannot reshuffle it.
 *
 * **Only submitted ballots count.** A draft (`submitted_at IS NULL`) is
 * invisible here, which is what keeps the hosts honest while they are still
 * building their lists.
 *
 * **A team nobody ranked is dropped**, not floated to the bottom: it means the
 * league gained a team since the ballots were locked, and inventing a position
 * for it would be worse than saying so. The page reports those separately.
 *
 * ## Two kinds of note, and why one of them is not in `Ballot`
 *
 * Each entry carries two free-text fields with opposite audiences:
 *
 * - `note` — the on-air line. It rides along on `BallotEntry`, reaches the
 *   reveal card through `VoterRank`, and the other host sees it the moment you
 *   lock in. That is the point of it.
 * - `prep_note` — your working notes on that team: the case for moving them,
 *   what you want to remember to say, what you talked yourself out of. It is
 *   **deliberately absent from `Ballot` and `BallotEntry`**. `fetchBallots`
 *   never selects the column, so the objects that flow to consolidation and
 *   the reveal have no field for it to leak through — privacy by construction
 *   rather than by remembering to strip it. The one read that returns it,
 *   `fetchPrepNotes`, takes a `userId` and returns only that host's own.
 *
 * ## Host ballots and listener ballots
 *
 * Signed-in listeners can cast a ballot too (`voter_kind = 'listener'`,
 * migration 045). Those votes feed the public community ranking in
 * `./community-rankings` and **never the reveal**. That separation also lives
 * in which reads exist: `fetchBallots` returns host ballots unless a caller
 * asks for `"everyone"` by name, and the only caller that does is the
 * community ranking. So the reveal, the host hub and the host ballot page —
 * none of which pass a scope — cannot count a listener, or list one by name.
 */

import { cache } from "react";
import { fetchAllRows, getSupabaseAdmin } from "./supabase";
import { LEAGUE_ID } from "./config";
import { getDisplayWeeks } from "./nfl-week";
import { getLeagueStatus } from "./matchups";
import { getLeagueSeason } from "./season";
import { fetchLeagueTeams } from "./team-binding";
import { formatRecord, type Matchup } from "./standings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Whose ballot this is. Stamped from `is_podcaster` when the ballot is saved, so
 * a host whose role is later revoked keeps their locked ballot in the episode
 * they already recorded.
 */
export type VoterKind = "host" | "listener";

/**
 * Which ballots a read returns. `"hosts"` is the default everywhere; only the
 * community ranking asks for `"everyone"`.
 */
export type BallotScope = "hosts" | "everyone";

export interface BallotEntry {
  teamName: string;
  /** 1 = best. Unique within a ballot; the database enforces it. */
  rank: number;
  /** The host's line on this team, read out when the slot is revealed. */
  note: string | null;
}

export interface Ballot {
  userId: string;
  /** Who to credit on air: their bound team, else their email's local part. */
  displayName: string;
  voterKind: VoterKind;
  /** Null while the ballot is still a draft. */
  submittedAt: string | null;
  entries: BallotEntry[];
}

/** One host's opinion of one team, as it appears on a revealed card. */
export interface VoterRank {
  userId: string;
  displayName: string;
  rank: number;
  note: string | null;
}

export interface ConsolidatedRow {
  /** Consolidated position, 1 = best. */
  rank: number;
  teamName: string;
  /** Average position across the ballots that ranked this team. */
  meanRank: number;
  bestRank: number;
  worstRank: number;
  /** `worstRank - bestRank` — how far apart the hosts were. 0 = agreement. */
  spread: number;
  /** Every host's placement, in ballot order. */
  votes: VoterRank[];
  /** Where this team landed last week, or null if there is no prior week. */
  previousRank: number | null;
  /** `previousRank - rank`: positive climbed, negative fell, null = new. */
  movement: number | null;
}

/** What the reveal screen needs for one week. */
export interface WeekRankings {
  season: number;
  week: number;
  rows: ConsolidatedRow[];
  /** Hosts whose ballot counted, in the order their columns are drawn. */
  voters: { userId: string; displayName: string }[];
  /** Teams on the roster list that no submitted ballot ranked. */
  unranked: string[];
}

// ---------------------------------------------------------------------------
// Consolidation (pure)
// ---------------------------------------------------------------------------

/** Mean of a non-empty list. */
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Fold ballots into one ordering.
 *
 * @param ballots  The ballots to count. Callers pass only submitted ones;
 *                 this function does not filter, so tests can score drafts.
 * @param teams    The league's current teams. Anything a ballot ranks that is
 *                 not in this list is ignored — a team that has since left.
 * @param previousOrder Last week's consolidated order, best first, for the
 *                 movement arrows. Empty or omitted leaves `movement` null.
 */
export function consolidate(
  ballots: readonly Ballot[],
  teams: readonly string[],
  previousOrder: readonly string[] = [],
): ConsolidatedRow[] {
  const previous = new Map(previousOrder.map((name, i) => [name, i + 1]));
  const inLeague = new Set(teams);

  const rows = teams
    .map((teamName) => {
      const votes: VoterRank[] = [];
      for (const ballot of ballots) {
        const entry = ballot.entries.find((e) => e.teamName === teamName);
        if (!entry) continue;
        votes.push({
          userId: ballot.userId,
          displayName: ballot.displayName,
          rank: entry.rank,
          note: entry.note,
        });
      }
      if (votes.length === 0) return null;
      const ranks = votes.map((v) => v.rank);
      return {
        teamName,
        meanRank: mean(ranks),
        bestRank: Math.min(...ranks),
        worstRank: Math.max(...ranks),
        spread: Math.max(...ranks) - Math.min(...ranks),
        votes,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  rows.sort(
    (a, b) =>
      a.meanRank - b.meanRank ||
      a.bestRank - b.bestRank ||
      a.worstRank - b.worstRank ||
      a.teamName.localeCompare(b.teamName),
  );

  return rows.map((row, i) => {
    const rank = i + 1;
    // A team missing from last week's order has no movement to show — that is
    // "new", not "held steady", so both fields stay null.
    const previousRank =
      previous.size > 0 && inLeague.has(row.teamName)
        ? (previous.get(row.teamName) ?? null)
        : null;
    return {
      ...row,
      rank,
      previousRank,
      movement: previousRank === null ? null : previousRank - rank,
    };
  });
}

/**
 * The team the hosts disagreed on most, for the "biggest split" callout.
 * Null when every ballot agreed, or when there was only one ballot.
 */
export function biggestDisagreement(
  rows: readonly ConsolidatedRow[],
): ConsolidatedRow | null {
  let best: ConsolidatedRow | null = null;
  for (const row of rows) {
    if (row.spread === 0) continue;
    if (!best || row.spread > best.spread) best = row;
  }
  return best;
}

/**
 * Whether `order` is a complete ranking of `teams` — every team once, nothing
 * else. A ballot that is not a total order breaks the mean-rank maths, so this
 * gates submission rather than being checked only in the UI.
 */
export function isCompleteBallot(
  order: readonly string[],
  teams: readonly string[],
): boolean {
  if (order.length !== teams.length) return false;
  const seen = new Set(order);
  if (seen.size !== order.length) return false;
  return teams.every((t) => seen.has(t));
}

/** Human label for a movement delta, e.g. "+3", "−2", "—". */
export function movementLabel(movement: number | null): string {
  if (movement === null) return "new";
  if (movement === 0) return "—";
  return movement > 0 ? `+${movement}` : `−${Math.abs(movement)}`;
}

// ---------------------------------------------------------------------------
// Reads / writes
// ---------------------------------------------------------------------------

/** Fall back to the email's local part when an account has no team bound. */
function displayNameFor(user: { email: string; team_name: string | null }): string {
  return user.team_name?.trim() || user.email.split("@")[0];
}

interface BallotRow {
  id: string;
  user_id: string;
  voter_kind: string;
  submitted_at: string | null;
}

/**
 * Every ballot for one week, drafts included, with the entries attached.
 *
 * **Host ballots only, unless `scope` says `"everyone"`.** The reveal, the host
 * hub and the host ballot page all call this without a scope, which is what
 * keeps a listener's vote out of the countdown and a listener's name off the
 * hosts' screens. Pinned by `power-rankings.test.ts`.
 *
 * Two queries plus a name lookup rather than one embedded select: keeping the
 * generated Supabase types honest about the join is more trouble than the
 * round-trip is worth. The entries are paginated because listener ballots make
 * the count open-ended — twelve rows a ballot passes 1000 at 84 voters.
 */
export async function fetchBallots(
  season: number,
  week: number,
  scope: BallotScope = "hosts",
): Promise<Ballot[]> {
  const db = getSupabaseAdmin();
  let ballotQuery = db
    .from("power_ranking_ballots")
    .select("id, user_id, voter_kind, submitted_at")
    .eq("league_id", LEAGUE_ID)
    .eq("season", season)
    .eq("week", week);
  if (scope === "hosts") ballotQuery = ballotQuery.eq("voter_kind", "host");
  const { data: ballotRows } = await ballotQuery.order("created_at", { ascending: true }); // pagination-safe: one row per account per week

  const ballots = (ballotRows ?? []) as BallotRow[];
  if (ballots.length === 0) return [];

  const [entryRows, { data: userRows }] = await Promise.all([
    fetchAllRows((from, to) =>
      db
        .from("power_ranking_entries")
        .select("ballot_id, team_name, rank, note")
        .in("ballot_id", ballots.map((b) => b.id))
        .order("ballot_id", { ascending: true })
        .order("team_name", { ascending: true })
        .range(from, to),
    ),
    db
      .from("users")
      .select("id, email, team_name")
      .in("id", ballots.map((b) => b.user_id)), // pagination-safe: one row per voter, bounded by the site's accounts
  ]);

  const names = new Map(
    (userRows ?? []).map((u) => [u.id, displayNameFor(u)] as const),
  );
  const byBallot = new Map<string, BallotEntry[]>();
  for (const row of entryRows) {
    const list = byBallot.get(row.ballot_id) ?? [];
    list.push({ teamName: row.team_name, rank: row.rank, note: row.note ?? null });
    byBallot.set(row.ballot_id, list);
  }

  return ballots.map((b) => ({
    userId: b.user_id,
    displayName: names.get(b.user_id) ?? "Unknown voter",
    voterKind: b.voter_kind === "listener" ? "listener" : "host",
    submittedAt: b.submitted_at,
    entries: (byBallot.get(b.id) ?? []).sort((x, y) => x.rank - y.rank),
  }));
}

/**
 * One account's own ballot for one week, whichever kind it is, or null.
 *
 * The listener vote page reads through this rather than the all-voters scope
 * of `fetchBallots`, so rendering one listener's ballot never loads anybody
 * else's.
 */
export async function fetchOwnBallot(
  season: number,
  week: number,
  userId: string,
): Promise<Ballot | null> {
  const db = getSupabaseAdmin();
  const { data: row } = await db
    .from("power_ranking_ballots")
    .select("id, voter_kind, submitted_at")
    .eq("league_id", LEAGUE_ID)
    .eq("season", season)
    .eq("week", week)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return null;

  const { data: entries } = await db
    .from("power_ranking_entries")
    .select("team_name, rank, note")
    .eq("ballot_id", row.id)
    .order("rank", { ascending: true }); // pagination-safe: one row per team, twelve of them

  return {
    userId,
    displayName: "",
    voterKind: row.voter_kind === "listener" ? "listener" : "host",
    submittedAt: row.submitted_at,
    entries: (entries ?? []).map((e) => ({
      teamName: e.team_name,
      rank: e.rank,
      note: e.note ?? null,
    })),
  };
}

/** Only the ballots that count towards the reveal. */
export function submittedOnly(ballots: readonly Ballot[]): Ballot[] {
  return ballots.filter((b) => b.submittedAt !== null);
}

/**
 * One host's private working notes for one week, keyed by team name.
 *
 * Separate from `fetchBallots` on purpose. The notes are the host's own
 * scratch pad — never read out, never shown to the other host — so the read
 * that returns them is scoped to a single `userId` and its result never joins
 * the `Ballot` objects that consolidation and the reveal screen consume. There
 * is no code path that could hand somebody else's notes to a page, because
 * there is no query that fetches them.
 */
export async function fetchPrepNotes(
  season: number,
  week: number,
  userId: string,
): Promise<Record<string, string>> {
  const db = getSupabaseAdmin();
  const { data: ballot } = await db
    .from("power_ranking_ballots")
    .select("id")
    .eq("league_id", LEAGUE_ID)
    .eq("season", season)
    .eq("week", week)
    .eq("user_id", userId)
    .maybeSingle();
  if (!ballot) return {};

  const { data: rows } = await db
    .from("power_ranking_entries")
    .select("team_name, prep_note")
    .eq("ballot_id", ballot.id); // pagination-safe: one row per team, twelve of them

  const out: Record<string, string> = {};
  for (const row of rows ?? []) {
    if (row.prep_note) out[row.team_name] = row.prep_note;
  }
  return out;
}

/**
 * The consolidated week, including last week's order for the movement arrows.
 * React-cached so the hub, the ballot page and the reveal share one read.
 *
 * Hosts only — this is the reveal. The all-votes ranking is
 * `fetchCommunityRankings` in `./community-rankings`.
 */
export const fetchWeekRankings = cache(
  async (season: number, week: number, teams: readonly string[]): Promise<WeekRankings> => {
    const [current, prior] = await Promise.all([
      fetchBallots(season, week),
      week > 1 ? fetchBallots(season, week - 1) : Promise.resolve([]),
    ]);

    const submitted = submittedOnly(current);
    const previousOrder = consolidate(submittedOnly(prior), teams).map((r) => r.teamName);
    const rows = consolidate(submitted, teams, previousOrder);
    const ranked = new Set(rows.map((r) => r.teamName));

    return {
      season,
      week,
      rows,
      voters: submitted.map((b) => ({ userId: b.userId, displayName: b.displayName })),
      unranked: teams.filter((t) => !ranked.has(t)),
    };
  },
);

export interface SaveBallotInput {
  userId: string;
  /**
   * Required, with no default: a write that forgot it would otherwise land as
   * whichever kind the default named, and a listener ballot defaulting to
   * "host" is a listener vote in the reveal.
   */
  voterKind: VoterKind;
  season: number;
  week: number;
  /** Teams best-first. Position in the array is the rank. */
  order: readonly string[];
  /** Optional per-team on-air note, keyed by team name. */
  notes?: Record<string, string>;
  /** Optional per-team private working note, keyed by team name. */
  prepNotes?: Record<string, string>;
  /** True locks the ballot in and exposes it to consolidation. */
  submit: boolean;
}

/**
 * Write one host's ballot for one week, creating it if this is their first save.
 *
 * The entries are replaced wholesale rather than diffed. Supabase's REST client
 * has no transactions, so a reorder that tried to update ranks in place would
 * trip the per-ballot rank uniqueness constraint halfway through; deleting the
 * dozen rows and re-inserting them cannot collide with itself.
 */
export async function saveBallot(input: SaveBallotInput): Promise<void> {
  const db = getSupabaseAdmin();
  const { userId, voterKind, season, week, order, notes = {}, prepNotes = {}, submit } = input;

  const { data: ballot, error: ballotError } = await db
    .from("power_ranking_ballots")
    .upsert(
      {
        league_id: LEAGUE_ID,
        season,
        week,
        user_id: userId,
        voter_kind: voterKind,
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "league_id,season,week,user_id" },
    )
    .select("id")
    .single();

  if (ballotError || !ballot) {
    throw new Error(ballotError?.message ?? "Could not save the ballot");
  }

  const { error: deleteError } = await db
    .from("power_ranking_entries")
    .delete()
    .eq("ballot_id", ballot.id);
  if (deleteError) throw new Error(deleteError.message);

  if (order.length === 0) return;

  const { error: insertError } = await db.from("power_ranking_entries").insert(
    order.map((teamName, i) => ({
      ballot_id: ballot.id,
      team_name: teamName,
      rank: i + 1,
      note: notes[teamName]?.trim() || null,
      prep_note: prepNotes[teamName]?.trim() || null,
    })),
  );
  if (insertError) throw new Error(insertError.message);
}

// ---------------------------------------------------------------------------
// Page context
// ---------------------------------------------------------------------------

/** What a team's card shows beside its slot, so the reveal has some substance. */
export interface TeamRecord {
  record: string;
  pointsFor: number;
  /** Where they actually sit in the standings — the fact a power ranking argues with. */
  standingsRank: number;
  /** Their game the week before the one being ranked; null in week 1 or on a bye. */
  lastGame: LastGame | null;
}

/**
 * The most recent result going into a ranking — "they just dropped 140" or
 * "they lost to the worst team in the league" is usually the first sentence
 * said about a team, and the record alone cannot say it.
 */
export interface LastGame {
  week: number;
  opponent: string;
  points: number | null;
  opponentPoints: number | null;
  /** Null until the game is final — a Monday-night score is not a result yet. */
  result: "W" | "L" | "T" | null;
  final: boolean;
}

/**
 * Every team's game in the week before `week`, keyed by team name. A team with
 * no game that week (a bye, or week 1 having no week 0) is simply absent.
 */
export function lastGames(
  matchups: readonly Matchup[],
  week: number,
): Record<string, LastGame> {
  const out: Record<string, LastGame> = {};
  for (const m of matchups) {
    if (m.week !== week - 1) continue;
    const final = m.status === "final";
    const sides = [
      [m.home_team_name, m.home_score, m.away_team_name, m.away_score],
      [m.away_team_name, m.away_score, m.home_team_name, m.home_score],
    ] as const;
    for (const [team, points, opponent, opponentPoints] of sides) {
      let result: LastGame["result"] = null;
      if (final && points != null && opponentPoints != null) {
        result = points > opponentPoints ? "W" : points < opponentPoints ? "L" : "T";
      }
      out[team] = { week: m.week, opponent, points, opponentPoints, result, final };
    }
  }
  return out;
}

export interface PowerRankingContext {
  season: number;
  /** The week being ranked — "pre week 3" is week 3. */
  week: number;
  /** Weeks the hosts can switch between: everything up to and including now. */
  weeks: number[];
  /**
   * The league's teams in current standings order. That ordering is the
   * starting position for a new ballot: a host reorders from where the league
   * actually stands rather than from an alphabetical list nobody thinks in.
   */
  teams: string[];
  records: Record<string, TeamRecord>;
}

/**
 * Resolve the week being ranked and everything both podcast pages need about
 * the league.
 *
 * The default week is the *upcoming* slate — a power ranking is a preview, so
 * "pre week 3" is what you record on the Tuesday that week 3 opens, which is
 * exactly the boundary `nfl-week.ts` flips on. Out of season there is no
 * upcoming week and it falls back to 1.
 */
export async function fetchPowerRankingContext(
  requestedWeek?: number,
): Promise<PowerRankingContext> {
  const [display, league, leagueSeason, allTeams] = await Promise.all([
    getDisplayWeeks(),
    getLeagueStatus(),
    getLeagueSeason(),
    fetchLeagueTeams(),
  ]);

  const season = display.season ?? league?.season ?? leagueSeason;
  const latestWeek = Math.max(display.upcoming ?? 1, 1);
  const week =
    requestedWeek && requestedWeek >= 1 && requestedWeek <= latestWeek
      ? requestedWeek
      : latestWeek;

  const standings = league?.standings ?? [];
  // Only the league's own season: ranking an old season's week against this
  // season's schedule would pair teams with games they never played.
  const previous =
    league && league.season === season ? lastGames(league.matchups, week) : {};
  const records: Record<string, TeamRecord> = {};
  for (const row of standings) {
    records[row.team_name] = {
      record: formatRecord(row),
      pointsFor: row.points_for,
      standingsRank: row.rank,
      lastGame: previous[row.team_name] ?? null,
    };
  }

  // Standings order first, then anything holding a roster but not yet in the
  // game log (a brand-new franchise before week 1), so no team is missable.
  const ordered = standings.map((r) => r.team_name);
  const seen = new Set(ordered);
  const teams = [...ordered, ...allTeams.filter((t) => !seen.has(t))];

  return {
    season,
    week,
    weeks: Array.from({ length: latestWeek }, (_, i) => i + 1),
    teams: teams.length > 0 ? teams : allTeams,
    records,
  };
}
