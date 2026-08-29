/**
 * NFL-week resolver — TypeScript twin of scripts/nfl_week.py.
 *
 * season.ts answers "what season and what phase"; this module answers the finer
 * question "which NFL week's numbers should we be showing right now" — the
 * primitive the weekly-projection feature needs.
 *
 * Week boundary: **Tuesday 00:00 America/New_York**, not the Thursday kickoff.
 * An NFL week's games run Thursday night through Monday night, so a Tuesday flip
 * means the moment the Monday-nighter ends we roll forward to the next slate.
 * That is what makes "the upcoming week's projection shows up on Tuesday" true,
 * while Monday-night games still count against the week they belong to.
 *
 * Anchor: `league_calendar.regular_season_start` — the Thursday of Week 1 —
 * shifted back two days to the Tuesday that opens the week:
 *
 *     week = floor((today - (week1Thursday - 2d)) / 7) + 1
 *
 * Before Week 1's Tuesday the upcoming week is 1; after Week 18's Monday there
 * is no current week and `currentNflWeek` returns week: null.
 *
 * Override: NFL_WEEK_OVERRIDE short-circuits the resolved week.
 *
 * scripts/tests/fixtures/nfl_week_boundaries.json is the boundary table shared
 * with the Python twin's test suite, so the two cannot drift.
 */

import { cache } from "react";
import { supabase } from "./supabase";
import { LEAGUE_ID, NFL_REGULAR_SEASON_WEEKS } from "./config";

/** The league — and the NFL schedule it follows — runs on US Eastern time. */
export const LEAGUE_TZ = "America/New_York";

/** Days from the Thursday of Week 1 back to the Tuesday that opens that week. */
const THURSDAY_TO_TUESDAY = 2;

const MS_PER_DAY = 86_400_000;

/**
 * Today's date (YYYY-MM-DD) in the league's timezone.
 *
 * A plain `toISOString()` is UTC, which rolls over at 7-8pm ET and would flip
 * the displayed week a day early — in the middle of the Monday night game.
 * en-CA formats as YYYY-MM-DD, which is exactly the shape we compare on.
 */
export function todayInLeagueTz(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LEAGUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Whole days between two YYYY-MM-DD strings (b - a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_PER_DAY);
}

/** Shift a YYYY-MM-DD string by a whole number of days. */
function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export interface CalendarRow {
  season: number;
  regular_season_start?: string | null;
}

/**
 * (week-1 opening Tuesday, NFL season) for every season we have a kickoff for,
 * sorted by date. The season label comes from the row declaring the kickoff, so
 * it is the NFL season those weeks belong to.
 */
function anchors(calendarRows: CalendarRow[]): { anchor: string; season: number }[] {
  return (calendarRows ?? [])
    .filter((r) => r.regular_season_start && r.season != null)
    .map((r) => ({
      anchor: addDays(String(r.regular_season_start).slice(0, 10), -THURSDAY_TO_TUESDAY),
      season: Number(r.season),
    }))
    .sort((a, b) => (a.anchor < b.anchor ? -1 : 1));
}

/**
 * Which NFL season's slate `today` falls in, and that season's anchor.
 *
 * Deliberately resolved from the kickoff dates rather than from the active
 * league-calendar row, because the two disagree twice a year:
 *
 *   - Ottoneu rolls its league season in early January, but NFL Week 18 is
 *     played a day or two later. Using the active row would label those games
 *     with the *next* season — and the retention purge would then delete the
 *     very week the cards are showing.
 *   - All summer the active row's statsSeason is last year, but the upcoming
 *     slate is this year's Week 1.
 */
export function resolveWindow(
  today: string,
  calendarRows: CalendarRow[],
): { season: number | null; anchor: string | null } {
  const all = anchors(calendarRows);
  if (all.length === 0) return { season: null, anchor: null };

  const started = all.filter((a) => a.anchor <= today);
  // The most recent kickoff wins while its season still has weeks left — this
  // is what keeps Week 18 attributed to the season that played it.
  if (started.length > 0) {
    const last = started[started.length - 1];
    if (weekForDate(today, last.anchor) !== null) {
      return { season: last.season, anchor: last.anchor };
    }
  }

  // Otherwise the next kickoff is what "upcoming" means.
  const upcoming = all.filter((a) => a.anchor > today);
  if (upcoming.length > 0) {
    return { season: upcoming[0].season, anchor: upcoming[0].anchor };
  }

  // Past the final week with no next season scheduled yet.
  const last = started[started.length - 1];
  return { season: last.season, anchor: last.anchor };
}

/**
 * The NFL week containing `today`, given Week 1's opening Tuesday.
 * Returns null past the end of the regular season. Dates before the anchor
 * clamp to week 1 — in the run-up to kickoff the "upcoming week" is Week 1.
 */
export function weekForDate(today: string, anchor: string): number | null {
  if (today < anchor) return 1;
  const week = Math.floor(daysBetween(anchor, today) / 7) + 1;
  return week > NFL_REGULAR_SEASON_WEEKS ? null : week;
}

/**
 * Are NFL regular-season games actually being played right now?
 *
 * Use this, not the league phase from lib/season, to gate in-season behaviour:
 * Ottoneu rolls its league season in early January and the phase becomes
 * `pre_arb`, but NFL Week 18 is played a day or two later.
 */
export function isNflWeekLive(today: string, calendarRows: CalendarRow[]): boolean {
  const { anchor } = resolveWindow(today, calendarRows);
  if (!anchor || today < anchor) return false;
  return weekForDate(today, anchor) !== null;
}

function weekOverride(): number | null {
  const raw = process.env.NFL_WEEK_OVERRIDE;
  if (!raw) return null;
  const week = Number(raw);
  if (!Number.isInteger(week) || week < 1 || week > NFL_REGULAR_SEASON_WEEKS) {
    throw new Error(
      `NFL_WEEK_OVERRIDE must be between 1 and ${NFL_REGULAR_SEASON_WEEKS}, got "${raw}"`,
    );
  }
  return week;
}

export interface NflWeek {
  /** The NFL season those weeks belong to. */
  season: number | null;
  /** Null when the regular season is over or no kickoff date is known. */
  week: number | null;
}

/**
 * Pure resolver: the (season, week) slate we should be showing.
 * Exported for testing; production code uses {@link getCurrentNflWeek}.
 */
export function currentNflWeek(
  calendarRows: CalendarRow[],
  now: Date | string = new Date(),
): NflWeek {
  const today = typeof now === "string" ? now.slice(0, 10) : todayInLeagueTz(now);
  const { season, anchor } = resolveWindow(today, calendarRows);

  const override = weekOverride();
  if (override !== null) return { season, week: override };

  if (!anchor) return { season, week: null };
  return { season, week: weekForDate(today, anchor) };
}

export interface DisplayWeeks {
  season: number | null;
  /** The slate being played next (or now). Null once the season is over. */
  upcoming: number | null;
  /**
   * The slate just completed. Stays on the player card after those games are
   * over so people can see how the projection actually did. Null during Week 1.
   */
  previous: number | null;
}

/** The pair of weeks a player card renders. Pure; see {@link getDisplayWeeks}. */
export function displayWeeks(
  calendarRows: CalendarRow[],
  now: Date | string = new Date(),
): DisplayWeeks {
  const today = typeof now === "string" ? now.slice(0, 10) : todayInLeagueTz(now);
  const { season, week } = currentNflWeek(calendarRows, today);

  if (week === null) {
    const { anchor } = resolveWindow(today, calendarRows);
    return {
      season,
      upcoming: null,
      previous: anchor ? NFL_REGULAR_SEASON_WEEKS : null,
    };
  }

  return { season, upcoming: week, previous: week > 1 ? week - 1 : null };
}

/** Fetch the league calendar rows that carry a kickoff date. */
async function fetchCalendarRows(): Promise<CalendarRow[]> {
  const { data } = await supabase
    .from("league_calendar")
    .select("season, regular_season_start")
    .eq("league_id", LEAGUE_ID); // pagination-safe: one row per season
  return (data as CalendarRow[]) ?? [];
}

/** Resolve the current NFL week once per server request (React-cached). */
export const getCurrentNflWeek = cache(
  async (): Promise<NflWeek> => currentNflWeek(await fetchCalendarRows()),
);

/** Resolve the upcoming/previous week pair once per server request. */
export const getDisplayWeeks = cache(
  async (): Promise<DisplayWeeks> => displayWeeks(await fetchCalendarRows()),
);
