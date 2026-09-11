/**
 * Server-side fetchers for `league_matchups` — the league's head-to-head game log.
 *
 * Rows are written by `scripts/scrape_matchups.py` from Ottoneu's public
 * schedule pages. Everything derived from them (standings, seeding, which week
 * to show) lives in lib/standings.ts as pure functions, so this module only
 * reads and shapes.
 *
 * The whole season is fetched at once rather than a week at a time: it is ~90
 * rows, and the standings are a function of *every* game, so the scoreboard and
 * the table beneath it should be computed from one consistent read.
 */

import { cache } from "react";
import { supabase } from "./supabase";
import { LEAGUE_ID, PLAYOFF_TEAMS } from "./config";
import { todayInLeagueTz } from "./nfl-week";
import {
  computePlayoffPicture,
  computeStandings,
  currentScoreboardWeek,
  weeksIn,
  type Matchup,
  type MatchupGameType,
  type MatchupStatus,
  type PlayoffPicture,
  type StandingsRow,
} from "./standings";

// One literal, deliberately not a `+` concatenation: Supabase's generated types
// infer the row shape from the select string, and concatenation widens it to
// plain `string`, which collapses the result type to GenericStringError.
const COLUMNS =
  "game_id, season, week, home_team_id, home_team_name, home_score, away_team_id, away_team_name, away_score, status, game_type, starts_on, ends_on, status_label, scraped_at";

const STATUSES: MatchupStatus[] = ["scheduled", "in_progress", "final"];
const GAME_TYPES: MatchupGameType[] = [
  "regular",
  "playoff",
  "championship",
  "third_place",
  "consolation",
];

/**
 * Coerce the free-text `status` / `game_type` columns to their unions.
 *
 * They are plain `text` in Postgres so a new Ottoneu label does not require a
 * migration to survive the scrape. Unknown values fall back to the safe end of
 * each union — an unrecognised status is treated as not-yet-played, and an
 * unrecognised bracket as a regular-season game — rather than being widened
 * into the type and quietly breaking the standings math downstream.
 */
function asStatus(value: unknown): MatchupStatus {
  return STATUSES.includes(value as MatchupStatus) ? (value as MatchupStatus) : "scheduled";
}

function asGameType(value: unknown): MatchupGameType {
  return GAME_TYPES.includes(value as MatchupGameType)
    ? (value as MatchupGameType)
    : "regular";
}

function shape(row: Record<string, unknown>): Matchup {
  return {
    game_id: Number(row.game_id),
    season: Number(row.season),
    week: Number(row.week),
    home_team_id: Number(row.home_team_id),
    home_team_name: String(row.home_team_name ?? ""),
    home_score: row.home_score == null ? null : Number(row.home_score),
    away_team_id: Number(row.away_team_id),
    away_team_name: String(row.away_team_name ?? ""),
    away_score: row.away_score == null ? null : Number(row.away_score),
    status: asStatus(row.status),
    game_type: asGameType(row.game_type),
    starts_on: row.starts_on ? String(row.starts_on).slice(0, 10) : null,
    ends_on: row.ends_on ? String(row.ends_on).slice(0, 10) : null,
    status_label: (row.status_label as string) ?? null,
  };
}

/** Every game of one season, in schedule order. */
export async function fetchMatchups(season: number): Promise<Matchup[]> {
  const { data, error } = await supabase
    .from("league_matchups")
    .select(COLUMNS)
    .eq("league_id", LEAGUE_ID)
    .eq("season", season)
    .order("week")
    .order("game_id")
    .limit(400); // pagination-safe: one league-season is ~90 games

  if (error) {
    console.error(`fetchMatchups(${season}) error`, error);
    return [];
  }
  return (data ?? []).map(shape);
}

/** One game by Ottoneu's game id, or null when it is not stored. */
export async function fetchMatchup(gameId: number): Promise<Matchup | null> {
  const { data, error } = await supabase
    .from("league_matchups")
    .select(COLUMNS)
    .eq("league_id", LEAGUE_ID)
    .eq("game_id", gameId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error(`fetchMatchup(${gameId}) error`, error);
    return null;
  }
  return shape(data);
}

/** Seasons with a stored schedule, newest first. */
export async function fetchMatchupSeasons(): Promise<number[]> {
  const { data, error } = await supabase
    .from("league_matchups")
    .select("season")
    .eq("league_id", LEAGUE_ID)
    .order("season", { ascending: false })
    .limit(999); // pagination-safe: distinct-ed below; a handful of seasons of games

  if (error) {
    console.error("fetchMatchupSeasons error", error);
    return [];
  }
  return [...new Set((data ?? []).map((r) => Number(r.season)))].sort((a, b) => b - a);
}

/** The freshest scrape stamp for a season — the "as of" the UI shows. */
export async function fetchMatchupsAsOf(season: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("league_matchups")
    .select("scraped_at")
    .eq("league_id", LEAGUE_ID)
    .eq("season", season)
    .order("scraped_at", { ascending: false })
    .limit(1) // pagination-safe: single newest row
    .maybeSingle();

  if (error || !data) return null;
  return String(data.scraped_at);
}

/** Everything a scoreboard view needs, computed from one read of the season. */
export interface LeagueStatus {
  season: number;
  matchups: Matchup[];
  standings: StandingsRow[];
  playoffs: PlayoffPicture;
  /** Week to open on, or null when the season has no games stored. */
  week: number | null;
  weeks: number[];
  asOf: string | null;
  /** True once at least one regular-season game is final. */
  started: boolean;
}

/**
 * Assemble the league's in-season status for a season.
 *
 * `season` defaults to the newest one with a stored schedule, which is what
 * both the homepage and /scoreboard want: through the offseason that is last
 * year's completed season, and it flips the moment the new schedule is posted.
 */
export async function fetchLeagueStatus(season?: number): Promise<LeagueStatus | null> {
  const resolved = season ?? (await fetchMatchupSeasons())[0];
  if (resolved == null) return null;

  const [matchups, asOf] = await Promise.all([
    fetchMatchups(resolved),
    fetchMatchupsAsOf(resolved),
  ]);
  if (matchups.length === 0) return null;

  const standings = computeStandings(matchups);
  return {
    season: resolved,
    matchups,
    standings,
    playoffs: computePlayoffPicture(standings, PLAYOFF_TEAMS),
    week: currentScoreboardWeek(matchups, todayInLeagueTz()),
    weeks: weeksIn(matchups),
    asOf,
    started: matchups.some((m) => m.status !== "scheduled"),
  };
}

/** Request-scoped cache — the homepage reads this alongside several other queries. */
export const getLeagueStatus = cache(
  async (): Promise<LeagueStatus | null> => fetchLeagueStatus(),
);
