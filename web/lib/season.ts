/**
 * Season-cycle resolver — TypeScript twin of scripts/season.py.
 *
 * Single source of truth for "what season are we in and what phase of the
 * annual cycle." Every page should derive its season from here instead of the
 * static `SEASON` constant in config.ts.
 *
 * Boundary dates come from the `league_calendar` table (scraped from the Ottoneu
 * finances page by scripts/scrape_league_calendar.py). Ottoneu declares the
 * season label itself, so the season is never inferred when calendar data exists.
 *
 * Phases (within season label Y):
 *   pre_arb      season_start         -> arb_end              (arbitration window)
 *   pre_keeper   arb_end              -> keeper_deadline      (keep/cut decisions)
 *   pre_draft    keeper_deadline      -> regular_season_start (auction draft)
 *   in_season    regular_season_start -> next season_start    (NFL games played)
 *
 * Override: SEASON_OVERRIDE / PHASE_OVERRIDE env vars short-circuit the result.
 */

import { cache } from "react";
import { supabase } from "./supabase";
import { LEAGUE_ID } from "./config";

export const PHASES = ["pre_arb", "pre_keeper", "pre_draft", "in_season"] as const;
export type Phase = (typeof PHASES)[number];

export interface LeagueCalendarRow {
  league_id?: number;
  season: number;
  season_start: string | null;
  arb_start: string | null;
  arb_end: string | null;
  keeper_deadline: string | null;
  auction_date: string | null;
  regular_season_start: string | null;
  trade_deadline: string | null;
  last_auction_date: string | null;
}

export interface SeasonContext {
  phase: Phase;
  leagueSeason: number;
  projectionSeason: number;
  statsSeason: number;
  arbitrationSeason: number;
  arbWindowOpen: boolean;
  deadlines: Record<string, string>;
  nextBoundary: string | null;
  source: "calendar" | "fallback" | "override";
}

/** Parse a date-ish value to a YYYY-MM-DD string, or null. */
function asDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function todayISO(now: Date | string = new Date()): string {
  return (typeof now === "string" ? now : now.toISOString()).slice(0, 10);
}

function phaseFromRow(today: string, row: LeagueCalendarRow): Phase {
  const arbEnd = asDate(row.arb_end);
  const keeper = asDate(row.keeper_deadline);
  const rss = asDate(row.regular_season_start);
  if (arbEnd && today < arbEnd) return "pre_arb";
  if (keeper && today < keeper) return "pre_keeper";
  if (rss && today < rss) return "pre_draft";
  return "in_season";
}

/** Month-based fallback when no calendar row is available. */
function fallbackContext(today: string): SeasonContext {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  let phase: Phase;
  if (month >= 9) phase = "in_season";
  else if (month < 4) phase = "pre_arb";
  else if (month < 8) phase = "pre_keeper";
  else phase = "pre_draft";
  const statsSeason = phase === "in_season" ? year : year - 1;
  return {
    phase,
    leagueSeason: year,
    projectionSeason: year,
    statsSeason,
    arbitrationSeason: year,
    arbWindowOpen: phase === "pre_arb",
    deadlines: {},
    nextBoundary: null,
    source: "fallback",
  };
}

function applyOverrides(ctx: SeasonContext): SeasonContext {
  const seasonOverride = process.env.SEASON_OVERRIDE;
  const phaseOverride = process.env.PHASE_OVERRIDE;
  if (seasonOverride) {
    const season = Number(seasonOverride);
    ctx.leagueSeason = season;
    ctx.projectionSeason = season;
    ctx.arbitrationSeason = season;
    ctx.statsSeason = ctx.phase === "in_season" ? season : season - 1;
    ctx.source = "override";
  }
  if (phaseOverride) {
    if (!(PHASES as readonly string[]).includes(phaseOverride)) {
      throw new Error(`PHASE_OVERRIDE must be one of ${PHASES.join(", ")}, got "${phaseOverride}"`);
    }
    ctx.phase = phaseOverride as Phase;
    ctx.arbWindowOpen = phaseOverride === "pre_arb";
    ctx.source = "override";
  }
  return ctx;
}

/**
 * Pure resolver: compute the season context from calendar rows and a date.
 * Exported for testing; production code uses {@link resolveSeasonContext}.
 */
export function getSeasonContext(
  calendarRows: LeagueCalendarRow[],
  now: Date | string = new Date(),
  leagueId: number = LEAGUE_ID,
): SeasonContext {
  const today = todayISO(now);
  const rows = calendarRows.filter((r) => (r.league_id ?? leagueId) === leagueId);

  // Active row: latest season_start on or before today.
  const active = rows
    .filter((r) => asDate(r.season_start) && asDate(r.season_start)! <= today)
    .sort((a, b) => (asDate(a.season_start)! < asDate(b.season_start)! ? 1 : -1))[0];

  if (!active) return applyOverrides(fallbackContext(today));

  const phase = phaseFromRow(today, active);
  const leagueSeason = Number(active.season);
  const rss = asDate(active.regular_season_start);
  const statsSeason = rss && today >= rss ? leagueSeason : leagueSeason - 1;
  const arbStart = asDate(active.arb_start);
  const arbEnd = asDate(active.arb_end);

  const deadlineKeys: (keyof LeagueCalendarRow)[] = [
    "season_start", "arb_start", "arb_end", "keeper_deadline",
    "auction_date", "regular_season_start", "trade_deadline", "last_auction_date",
  ];
  const deadlines: Record<string, string> = {};
  for (const k of deadlineKeys) {
    const v = asDate(active[k] as string | null);
    if (v) deadlines[k] = v;
  }
  const future = Object.values(deadlines).filter((d) => d > today).sort();

  return applyOverrides({
    phase,
    leagueSeason,
    projectionSeason: leagueSeason,
    statsSeason,
    arbitrationSeason: leagueSeason,
    arbWindowOpen: !!(arbStart && arbEnd && arbStart <= today && today < arbEnd),
    deadlines,
    nextBoundary: future[0] ?? null,
    source: "calendar",
  });
}

/** Fetch the league calendar and resolve the current season context. */
export async function resolveSeasonContext(
  now: Date | string = new Date(),
  leagueId: number = LEAGUE_ID,
): Promise<SeasonContext> {
  const { data } = await supabase
    .from("league_calendar")
    .select("*")
    .eq("league_id", leagueId);
  return getSeasonContext((data as LeagueCalendarRow[]) ?? [], now, leagueId);
}

/**
 * Resolve the current season context once per server request (React-cached).
 * This is the entry point server components and the data layer should use.
 */
export const getSeasonContextNow = cache(
  (): Promise<SeasonContext> => resolveSeasonContext(),
);

/** Season whose actual NFL stats drive VORP / surplus / observed PPG. */
export async function getStatsSeason(): Promise<number> {
  return (await getSeasonContextNow()).statsSeason;
}

/** Season that projections / Draft Sharks values target. */
export async function getProjectionSeason(): Promise<number> {
  return (await getSeasonContextNow()).projectionSeason;
}

/** Season arbitration is being conducted for. */
export async function getArbitrationSeason(): Promise<number> {
  return (await getSeasonContextNow()).arbitrationSeason;
}
