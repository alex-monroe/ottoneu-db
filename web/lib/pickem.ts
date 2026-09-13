/**
 * Weekly pick'em: pick the winner of every league matchup in a week, then see
 * how everyone did.
 *
 * Signed-in users pick; the board is public. This module owns four things:
 *
 * 1. **When a week locks.** Thursday 20:00 America/New_York of the NFL week —
 *    fifteen minutes before Thursday Night Football — or noon on Thanksgiving,
 *    when the first game kicks off at 12:30. Only the current NFL week can be
 *    picked, and only until then. `league_matchups.status` cannot be the lock:
 *    Ottoneu marks a week in progress when the fantasy week opens on
 *    Wednesday, a day before a snap is played. No calendar date for the season
 *    means no Thursday to lock on, so the week stays closed (fails closed).
 *
 * 2. **Who can see whose picks.** Nobody sees anybody else's picks before the
 *    lock — the last person to pick would just copy the room. That is enforced
 *    by what the board read returns, not by what the page chooses to draw:
 *    `buildBoard` given `revealed: false` produces no names and no picks, only
 *    a count of players.
 *
 * 3. **Scoring.** One point per pick of a team that won a *final* game. A game
 *    that ends level is a push: no point, and not a miss. Players are ranked on
 *    points alone, sharing a rank when level (1, 2, 2, 4) — a tiebreak on
 *    fewer misses would reward skipping games.
 *
 * 4. **Board names.** The board is public, so it shows a name the player chose
 *    (`pickem_players`), never an email. It is prefilled with their bound team,
 *    must be unique in the league, and cannot be another franchise's name.
 */

import { getSupabaseAdmin } from "./supabase";
import { LEAGUE_ID } from "./config";
import { getDisplayWeeks, getSeasonAnchor } from "./nfl-week";
import { leagueTzInstant } from "./community-rankings";
import { getLeagueStatus } from "./matchups";
import { formatRecord, type Matchup } from "./standings";
import { MAX_NAME_LENGTH, MIN_NAME_LENGTH } from "./schemas/pickem";

// ---------------------------------------------------------------------------
// The lock (pure)
// ---------------------------------------------------------------------------

/** Days from a week's opening Tuesday to its Thursday. */
const TUESDAY_TO_THURSDAY = 2;

/** Local hour a week locks on an ordinary Thursday: just before the 8:15 game. */
export const LOCK_HOUR = 20;

/** Local hour a week locks on Thanksgiving: just before the 12:30 game. */
export const THANKSGIVING_LOCK_HOUR = 12;

const MS_PER_DAY = 86_400_000;

/** US Thanksgiving is the fourth Thursday of November: the 22nd to the 28th. */
export function isThanksgiving(thursday: string): boolean {
  const [, month, day] = thursday.split("-").map(Number);
  return month === 11 && day >= 22 && day <= 28;
}

/**
 * When week `week`'s picks lock.
 *
 * @param anchor Week 1's opening Tuesday (`seasonAnchor` in `./nfl-week`).
 */
export function pickemLocksAt(anchor: string, week: number): Date {
  const thursday = new Date(
    Date.parse(`${anchor}T00:00:00Z`) + (7 * (week - 1) + TUESDAY_TO_THURSDAY) * MS_PER_DAY,
  )
    .toISOString()
    .slice(0, 10);
  return leagueTzInstant(thursday, isThanksgiving(thursday) ? THANKSGIVING_LOCK_HOUR : LOCK_HOUR);
}

/**
 * Whether picks for `week` may still be made or changed. Pure.
 *
 * Only the current NFL week — a past week is settled, and a future week's
 * matchups can still be re-drawn — and only before its lock.
 */
export function pickemOpen(
  week: number,
  currentWeek: number | null,
  locksAt: Date | null,
  now: Date,
): boolean {
  return week === currentWeek && locksAt !== null && now.getTime() < locksAt.getTime();
}

/**
 * Whether everybody's picks for `week` may be shown. Pure.
 *
 * A past week always; the current week once its lock has passed. With no lock
 * time (no calendar date) the current week stays hidden — it cannot be picked
 * either, and "unknown" must not read as "locked".
 */
export function pickemRevealed(
  week: number,
  currentWeek: number | null,
  locksAt: Date | null,
  now: Date,
): boolean {
  if (week !== currentWeek) return true;
  return locksAt !== null && now.getTime() >= locksAt.getTime();
}

// ---------------------------------------------------------------------------
// Scoring (pure)
// ---------------------------------------------------------------------------

/** One pick, as stored. */
export interface PickemPick {
  userId: string;
  gameId: number;
  teamId: number;
}

/**
 * - `won` / `lost` — the game is final and the picked team won / lost.
 * - `push` — the game is final and ended level.
 * - `pending` — not final yet (a lead in a live game is not a win).
 */
export type PickResult = "won" | "lost" | "push" | "pending";

/** The winning team id of a final game, `"tie"` for a level one, null if not final. */
export function gameWinner(game: Matchup): number | "tie" | null {
  if (game.status !== "final" || game.home_score == null || game.away_score == null) {
    return null;
  }
  if (game.home_score === game.away_score) return "tie";
  return game.home_score > game.away_score ? game.home_team_id : game.away_team_id;
}

export function pickResult(game: Matchup, teamId: number): PickResult {
  const winner = gameWinner(game);
  if (winner === null) return "pending";
  if (winner === "tie") return "push";
  return winner === teamId ? "won" : "lost";
}

/** One player's line on the week's board. */
export interface BoardRow {
  /** Shared when level on points: 1, 2, 2, 4. */
  rank: number;
  displayName: string;
  /** True for the viewer's own row, so the page can highlight it. */
  isViewer: boolean;
  correct: number;
  wrong: number;
  pushes: number;
  pending: number;
  /** Games this player picked. */
  picked: number;
}

/** Who picked each side of one game. Only built once the week is revealed. */
export interface GameSplit {
  gameId: number;
  homePickers: string[];
  awayPickers: string[];
}

export interface Board {
  /** False until the week locks; `rows` and `splits` are then empty. */
  revealed: boolean;
  /** How many players have at least one pick in. Always available. */
  players: number;
  rows: BoardRow[];
  splits: GameSplit[];
}

/**
 * Score a week and assemble its board.
 *
 * Picks for a game not in `games`, or for a team not playing in it, are
 * ignored rather than trusted — the API refuses them, but a re-drawn schedule
 * could leave one behind.
 *
 * @param names Board name per user id. A picker without one is left off.
 * @param revealed Whether the week has locked. When false the board carries a
 *        player count and nothing else — no names, no picks.
 */
export function buildBoard(
  games: readonly Matchup[],
  picks: readonly PickemPick[],
  names: ReadonlyMap<string, string>,
  revealed: boolean,
  viewerId: string | null = null,
): Board {
  const byGame = new Map(games.map((g) => [g.game_id, g]));
  const valid = picks.filter((p) => {
    const game = byGame.get(p.gameId);
    return (
      game !== undefined &&
      names.has(p.userId) &&
      (p.teamId === game.home_team_id || p.teamId === game.away_team_id)
    );
  });
  const userIds = [...new Set(valid.map((p) => p.userId))];

  if (!revealed) return { revealed, players: userIds.length, rows: [], splits: [] };

  const tallies = userIds.map((userId) => {
    const row = { correct: 0, wrong: 0, pushes: 0, pending: 0, picked: 0 };
    for (const pick of valid) {
      if (pick.userId !== userId) continue;
      row.picked += 1;
      const result = pickResult(byGame.get(pick.gameId)!, pick.teamId);
      if (result === "won") row.correct += 1;
      else if (result === "lost") row.wrong += 1;
      else if (result === "push") row.pushes += 1;
      else row.pending += 1;
    }
    return { userId, displayName: names.get(userId)!, ...row };
  });

  tallies.sort(
    (a, b) => b.correct - a.correct || a.displayName.localeCompare(b.displayName),
  );

  const rows: BoardRow[] = [];
  tallies.forEach((t, i) => {
    const rank = i > 0 && t.correct === tallies[i - 1].correct ? rows[i - 1].rank : i + 1;
    const { userId, ...rest } = t;
    rows.push({ rank, isViewer: userId === viewerId, ...rest });
  });

  const nameOf = (id: string) => names.get(id)!;
  const splits = games.map((game) => {
    const forGame = valid.filter((p) => p.gameId === game.game_id);
    const sorted = (teamId: number) =>
      forGame
        .filter((p) => p.teamId === teamId)
        .map((p) => nameOf(p.userId))
        .sort((a, b) => a.localeCompare(b));
    return {
      gameId: game.game_id,
      homePickers: sorted(game.home_team_id),
      awayPickers: sorted(game.away_team_id),
    };
  });

  return { revealed, players: userIds.length, rows, splits };
}

// ---------------------------------------------------------------------------
// Board names (pure)
// ---------------------------------------------------------------------------

/** Trim and collapse runs of whitespace, so "  The  Witchcraft " is one name. */
export function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Why `name` cannot be used, or null when it can. Uniqueness against other
 * players is the database's job (a case-insensitive unique index); this checks
 * shape and that nobody takes a league franchise's name that is not theirs.
 */
export function displayNameProblem(
  name: string,
  leagueTeams: readonly string[],
  ownTeam: string | null,
): string | null {
  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    return `Pick a name between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters.`;
  }
  const lower = name.toLowerCase();
  const takenTeam = leagueTeams.find((t) => t.toLowerCase() === lower);
  if (takenTeam && takenTeam.toLowerCase() !== ownTeam?.toLowerCase()) {
    return `"${takenTeam}" is a team in the league. Only its manager can play under that name.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reads / writes
// ---------------------------------------------------------------------------

export interface PickemWeek {
  season: number;
  /** The week being shown. */
  week: number;
  /** The week that can be picked right now, or null once the season is over. */
  currentWeek: number | null;
  /** Weeks with a schedule, up to the current one. */
  weeks: number[];
  games: Matchup[];
  /** "2–0" by team id, from the league standings. */
  records: Record<number, string>;
  /** Null when the calendar has no kickoff date for the season. */
  locksAt: string | null;
  open: boolean;
  /** Whether everybody's picks may be shown — see `pickemRevealed`. */
  revealed: boolean;
}

/**
 * Everything the page and the API need to know about one pick'em week.
 * Resolves `requestedWeek` against the weeks that exist, defaulting to the
 * current one. Null when the league has no schedule stored.
 */
export async function fetchPickemWeek(
  requestedWeek?: number,
  now: Date = new Date(),
): Promise<PickemWeek | null> {
  const [league, display] = await Promise.all([getLeagueStatus(), getDisplayWeeks()]);
  if (!league) return null;

  const season = league.season;
  // The NFL week only counts when it belongs to the season the schedule is for
  // — through the offseason the stored schedule is last year's.
  const currentWeek = display.season === season ? display.upcoming : null;
  const lastWeek = currentWeek ?? Math.max(...league.weeks);
  const weeks = league.weeks.filter((w) => w <= lastWeek);
  if (weeks.length === 0) return null;

  const week =
    requestedWeek !== undefined && weeks.includes(requestedWeek)
      ? requestedWeek
      : weeks.includes(lastWeek)
        ? lastWeek
        : weeks[weeks.length - 1];

  const anchor = await getSeasonAnchor(season);
  const locksAt = anchor ? pickemLocksAt(anchor, week) : null;

  const records: Record<number, string> = {};
  for (const row of league.standings) records[row.team_id] = formatRecord(row);

  return {
    season,
    week,
    currentWeek,
    weeks,
    games: league.matchups.filter((m) => m.week === week),
    records,
    locksAt: locksAt?.toISOString() ?? null,
    open: pickemOpen(week, currentWeek, locksAt, now),
    revealed: pickemRevealed(week, currentWeek, locksAt, now),
  };
}

/** Every pick for one week. Server-only; callers decide what to reveal. */
async function fetchWeekPicks(season: number, week: number): Promise<PickemPick[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("pickem_picks")
    .select("user_id, game_id, picked_team_id")
    .eq("league_id", LEAGUE_ID)
    .eq("season", season)
    .eq("week", week)
    .order("user_id")
    .order("game_id")
    .limit(999); // pagination-safe: ~6 games a week, so ~160 players before the cap
  if (error) {
    console.error(`fetchWeekPicks(${season}, ${week}) error`, error);
    return [];
  }
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    gameId: r.game_id,
    teamId: r.picked_team_id,
  }));
}

/** One user's picks for one week, keyed by game id. */
export async function fetchOwnPicks(
  season: number,
  week: number,
  userId: string,
): Promise<Record<number, number>> {
  const { data } = await getSupabaseAdmin()
    .from("pickem_picks")
    .select("game_id, picked_team_id")
    .eq("league_id", LEAGUE_ID)
    .eq("season", season)
    .eq("week", week)
    .eq("user_id", userId); // pagination-safe: one row per game in a week
  const out: Record<number, number> = {};
  for (const row of data ?? []) out[row.game_id] = row.picked_team_id;
  return out;
}

/** A user's board name, or null before they have chosen one. */
export async function fetchDisplayName(userId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("pickem_players")
    .select("display_name")
    .eq("league_id", LEAGUE_ID)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.display_name ?? null;
}

/**
 * The week's board: every pick, scored, under each player's board name. Pass
 * `revealed: false` before the lock and the result is a player count only (see
 * `buildBoard`) — nothing else about anybody's picks leaves this function.
 */
export async function fetchBoard(
  season: number,
  week: number,
  games: readonly Matchup[],
  revealed: boolean,
  viewerId: string | null,
): Promise<Board> {
  const picks = await fetchWeekPicks(season, week);
  const userIds = [...new Set(picks.map((p) => p.userId))];
  const { data } =
    userIds.length === 0
      ? { data: [] }
      : await getSupabaseAdmin()
          .from("pickem_players")
          .select("user_id, display_name")
          .eq("league_id", LEAGUE_ID)
          .in("user_id", userIds); // pagination-safe: one row per picker in the week
  const names = new Map((data ?? []).map((r) => [r.user_id, r.display_name] as const));
  return buildBoard(games, picks, names, revealed, viewerId);
}

/** Save one pick, or clear it with `teamId: null`. The caller checks the lock. */
export async function savePick(input: {
  userId: string;
  season: number;
  week: number;
  gameId: number;
  teamId: number | null;
}): Promise<void> {
  const db = getSupabaseAdmin();
  if (input.teamId === null) {
    const { error } = await db
      .from("pickem_picks")
      .delete()
      .eq("league_id", LEAGUE_ID)
      .eq("game_id", input.gameId)
      .eq("user_id", input.userId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await db.from("pickem_picks").upsert(
    {
      league_id: LEAGUE_ID,
      season: input.season,
      week: input.week,
      game_id: input.gameId,
      user_id: input.userId,
      picked_team_id: input.teamId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "league_id,game_id,user_id" },
  );
  if (error) throw new Error(error.message);
}

/** Thrown by `saveDisplayName` when another player already has the name. */
export class NameTakenError extends Error {}

/** Set (or change) a user's board name. Already normalized and checked. */
export async function saveDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("pickem_players")
    .upsert(
      {
        league_id: LEAGUE_ID,
        user_id: userId,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "league_id,user_id" },
    );
  // 23505: the case-insensitive unique index on the name.
  if (error?.code === "23505") throw new NameTakenError("That name is taken.");
  if (error) throw new Error(error.message);
}
