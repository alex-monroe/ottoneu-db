/**
 * The live matchup projection — pure derivation over stored lineups.
 *
 * `matchup_lineups` holds who each team actually started (scraped from the
 * box score); `weekly_projections` holds each player's pre-kickoff forecast,
 * frozen once his game starts. This module joins nothing and fetches nothing —
 * it turns those two into the numbers a game page shows:
 *
 *   pregame   the starters' original projections, summed — what the matchup
 *             looked like before anyone played
 *   actual    the starters' points so far, as Ottoneu scores them
 *   live      finished starters' points + the projection for everyone still to
 *             play (+ a pro-rated share for anyone mid-game)
 *
 * Derived at read time, like the standings, so the projection moves the moment
 * a scrape lands and there is no stored total to go stale.
 */

export type LineupGameState = "scheduled" | "in_progress" | "final" | "bye";

export type LineupSide = "home" | "away";

/** One player on one side of one game, joined to his weekly projection. */
export interface LineupEntry {
  game_id: number;
  side: LineupSide;
  team_id: number;
  team_name: string;
  ottoneu_id: number;
  player_id: string | null;
  player_name: string;
  nfl_team: string | null;
  position: string | null;
  /** 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'FLEX' | 'SFLX' | 'BN'. */
  slot: string;
  slot_number: number;
  is_starter: boolean;
  /** Live points; null until the player's game starts. */
  points: number | null;
  game_state: LineupGameState;
  /** Ottoneu's own words — "Sun 1:00pm @IND", "L 10-13 @SEA". */
  game_info: string | null;
  injury_status: string | null;
  stat_line: string | null;
  /**
   * The pre-kickoff weekly projection (weekly_projections.projected_points).
   * Null when the source had no forecast — a bye, an inactive, or a player it
   * does not cover — which the UI keeps distinct from a forecast of zero.
   */
  projected: number | null;
}

export interface SideTotals {
  /** Starters' points so far. */
  actual: number;
  /** Starters' original projections, summed (missing projections count 0). */
  pregame: number;
  /** Points banked + what is still expected. */
  live: number;
  starters: number;
  /** Starters whose game is over (or on a bye). */
  finished: number;
  /** Starters whose game is under way. */
  playing: number;
  /** Starters yet to play. */
  toPlay: number;
  /** Starters with no projection at all — their expected points are unknown, counted 0. */
  unprojected: number;
}

/** Starting-slot template, in the site's display order (matches LINEUP_SLOTS). */
export const STARTING_SLOTS: readonly { slot: string; slot_number: number; label: string }[] = [
  { slot: "QB", slot_number: 0, label: "QB" },
  { slot: "RB", slot_number: 0, label: "RB" },
  { slot: "RB", slot_number: 1, label: "RB" },
  { slot: "WR", slot_number: 0, label: "WR" },
  { slot: "WR", slot_number: 1, label: "WR" },
  { slot: "TE", slot_number: 0, label: "TE" },
  { slot: "FLEX", slot_number: 0, label: "FLEX" },
  { slot: "SFLX", slot_number: 0, label: "SFLX" },
  { slot: "K", slot_number: 0, label: "K" },
];

/** Assumed share of a game still to play when the clock cannot be read. */
export const UNKNOWN_CLOCK_REMAINING = 0.5;

const REGULATION_MINUTES = 60;

/**
 * Fraction of an in-progress NFL game still to play, read from the game line.
 *
 * Understands a quarter + clock ("Q3 5:12", "3rd 5:12") and halftime. Anything
 * else — overtime, an unfamiliar shape — falls back to {@link UNKNOWN_CLOCK_REMAINING}:
 * half a projection is a better guess than none or all of it.
 */
export function remainingFraction(gameInfo: string | null): number {
  const text = (gameInfo ?? "").toLowerCase();
  if (/\bhalf(time)?\b/.test(text)) return 0.5;
  if (/\b(ot|overtime)\b/.test(text)) return 0;
  const match = text.match(/\b(?:q([1-4])|([1-4])(?:st|nd|rd|th))\b\s*(\d{1,2}):(\d{2})/);
  if (!match) return UNKNOWN_CLOCK_REMAINING;
  const quarter = Number(match[1] ?? match[2]);
  const clock = Number(match[3]) + Number(match[4]) / 60;
  const left = (4 - quarter) * 15 + Math.min(clock, 15);
  return Math.max(0, Math.min(1, left / REGULATION_MINUTES));
}

/**
 * What one starter is expected to finish the week with, given what is known now.
 *
 * - **final / bye** — the points are the points.
 * - **scheduled** — the original projection (0 when there is none).
 * - **in progress** — points so far plus the share of the projection the clock
 *   has not yet run through. Adding to what is banked, rather than taking the
 *   larger of the two, is what lets a hot first half lift the projection and a
 *   quiet one drag it.
 */
export function expectedPoints(entry: Pick<LineupEntry, "game_state" | "points" | "projected" | "game_info">): number {
  const points = entry.points ?? 0;
  const projected = entry.projected ?? 0;
  switch (entry.game_state) {
    case "final":
    case "bye":
      return points;
    case "in_progress":
      return points + projected * remainingFraction(entry.game_info);
    default:
      return projected;
  }
}

export function sideTotals(entries: LineupEntry[]): SideTotals {
  const totals: SideTotals = {
    actual: 0,
    pregame: 0,
    live: 0,
    starters: 0,
    finished: 0,
    playing: 0,
    toPlay: 0,
    unprojected: 0,
  };
  for (const entry of entries) {
    if (!entry.is_starter) continue;
    totals.starters += 1;
    totals.actual += entry.points ?? 0;
    totals.pregame += entry.projected ?? 0;
    totals.live += expectedPoints(entry);
    if (entry.game_state === "final" || entry.game_state === "bye") totals.finished += 1;
    else if (entry.game_state === "in_progress") totals.playing += 1;
    else totals.toPlay += 1;
    if (entry.projected == null && entry.game_state === "scheduled") totals.unprojected += 1;
  }
  return totals;
}

/** A starting slot with whoever each side has in it (null = left empty). */
export interface SlotPairing {
  label: string;
  home: LineupEntry | null;
  away: LineupEntry | null;
}

function bySlot(entries: LineupEntry[]): Map<string, LineupEntry> {
  return new Map(entries.map((e) => [`${e.slot}:${e.slot_number}`, e]));
}

/**
 * Both starting lineups, slot against slot, in display order.
 *
 * Built from the fixed slot template rather than from the rows, so a slot a
 * manager left empty still gets a row — an unset lineup is exactly the thing a
 * reader should be able to see.
 */
export function pairStarters(home: LineupEntry[], away: LineupEntry[]): SlotPairing[] {
  const h = bySlot(home.filter((e) => e.is_starter));
  const a = bySlot(away.filter((e) => e.is_starter));
  const known = new Set(STARTING_SLOTS.map((s) => `${s.slot}:${s.slot_number}`));
  const pairings: SlotPairing[] = STARTING_SLOTS.map((s) => {
    const key = `${s.slot}:${s.slot_number}`;
    return { label: s.label, home: h.get(key) ?? null, away: a.get(key) ?? null };
  });
  // A slot the template does not know (a league settings change) is still shown.
  const extra = new Set([...h.keys(), ...a.keys()].filter((k) => !known.has(k)));
  for (const key of [...extra].sort()) {
    pairings.push({ label: key.split(":")[0], home: h.get(key) ?? null, away: a.get(key) ?? null });
  }
  return pairings;
}

/** Each side's bench, in Ottoneu's order (grouped by position). */
export function benchOf(entries: LineupEntry[]): LineupEntry[] {
  return entries
    .filter((e) => !e.is_starter)
    .sort((x, y) => x.slot_number - y.slot_number);
}

/** Everything a game page (or a scoreboard card) needs for one game. */
export interface LiveGame {
  game_id: number;
  home: { team_name: string; entries: LineupEntry[]; totals: SideTotals };
  away: { team_name: string; entries: LineupEntry[]; totals: SideTotals };
  /** When the lineups were last scraped. */
  scrapedAt: string | null;
}

/** Each side's live projection, as a scoreboard card shows it. */
export interface ScoreboardProjection {
  home: number;
  away: number;
}

/**
 * The card-sized summary of a game: null when no lineups are stored, or when
 * neither side has a starter (nothing to project from).
 */
export function scoreboardProjection(game: LiveGame | undefined): ScoreboardProjection | null {
  if (!game || game.home.totals.starters + game.away.totals.starters === 0) return null;
  return { home: game.home.totals.live, away: game.away.totals.live };
}

/** Group a week's lineup rows into games. Games with no rows are absent. */
export function groupGames(
  entries: LineupEntry[],
  scrapedAt: Map<number, string> = new Map(),
): Map<number, LiveGame> {
  const byGame = new Map<number, LineupEntry[]>();
  for (const entry of entries) {
    const list = byGame.get(entry.game_id) ?? [];
    list.push(entry);
    byGame.set(entry.game_id, list);
  }
  const games = new Map<number, LiveGame>();
  for (const [gameId, rows] of byGame) {
    const home = rows.filter((r) => r.side === "home");
    const away = rows.filter((r) => r.side === "away");
    games.set(gameId, {
      game_id: gameId,
      home: { team_name: home[0]?.team_name ?? "", entries: home, totals: sideTotals(home) },
      away: { team_name: away[0]?.team_name ?? "", entries: away, totals: sideTotals(away) },
      scrapedAt: scrapedAt.get(gameId) ?? null,
    });
  }
  return games;
}
