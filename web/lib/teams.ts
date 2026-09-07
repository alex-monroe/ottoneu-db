/**
 * The team as a first-class object.
 *
 * Rosters, standings, the scoreboard, arbitration progress and the lineup
 * planner all deal in teams, but until now a team was only ever a string in a
 * cell — `grep team_name … href` across the app returned zero hits, so there
 * was no way to go from a player to the roster he is on, or from a standings
 * row to what that team actually holds. This assembles everything the app knows
 * about one team so `/teams/[name]` can answer "how is this team doing".
 *
 * Value data (surplus, arbitration exposure) is only assembled for viewers with
 * projections access; the roster, record and schedule are league-wide facts and
 * stay public, like /scoreboard and /rosters.
 */

import { cache } from "react";
import { CAP_PER_TEAM, ARB_MAX_PER_PLAYER_PER_TEAM } from "./config";
import {
  fetchRosterData,
  reconstructRostersAtDate,
  getRosterForTeam,
  type TeamRoster,
} from "./roster-reconstruction";
import { fetchLeagueStatus } from "./matchups";
import type { Matchup, StandingsRow } from "./standings";
import { calculateSurplus } from "./surplus";
import { analyzeArbTargets } from "./mcp/arb";
import { fetchPlayersEndOfSeason } from "./data";
import type { ArbitrationTarget, SurplusPlayer } from "./types";

/** One game from a single team's point of view. */
export interface TeamGame {
  game_id: number;
  week: number;
  opponent: string;
  /** This team's score, then the opponent's. Null until the game is played. */
  score: number | null;
  opponentScore: number | null;
  status: Matchup["status"];
  gameType: Matchup["game_type"];
  statusLabel: string | null;
  /** null until final — a lead in a live game is not a result. */
  won: boolean | null;
}

export interface TeamValue {
  totalValue: number;
  totalSurplus: number;
  players: SurplusPlayer[];
  /** This team's players most exposed to opponents' arbitration dollars. */
  arbExposure: ArbitrationTarget[];
}

export interface TeamPage {
  teamName: string;
  roster: TeamRoster | null;
  totalSalary: number;
  capSpace: number;
  /** Ottoneu's own id for the team, for deep links. Null before any game. */
  ottoneuTeamId: number | null;
  season: number | null;
  standing: StandingsRow | null;
  rankOf: number | null;
  schedule: TeamGame[];
  /** Null when the viewer lacks projections access. */
  value: TeamValue | null;
}

/** Team names are display strings with spaces; compare them forgivingly. */
export function sameTeamName(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/** URL-safe segment for a team name. */
export function teamHref(name: string): string {
  return `/teams/${encodeURIComponent(name.trim())}`;
}

/** Flip a league-wide game into one team's point of view. */
export function toTeamGame(m: Matchup, teamName: string): TeamGame | null {
  const isHome = sameTeamName(m.home_team_name, teamName);
  const isAway = sameTeamName(m.away_team_name, teamName);
  if (!isHome && !isAway) return null;

  const score = isHome ? m.home_score : m.away_score;
  const opponentScore = isHome ? m.away_score : m.home_score;
  const decided = m.status === "final" && score != null && opponentScore != null;

  return {
    game_id: m.game_id,
    week: m.week,
    opponent: isHome ? m.away_team_name : m.home_team_name,
    score,
    opponentScore,
    status: m.status,
    gameType: m.game_type,
    statusLabel: m.status_label,
    won: decided ? score! > opponentScore! : null,
  };
}

/** Ottoneu's team id, read off any game this team appears in. */
function ottoneuIdFor(matchups: Matchup[], teamName: string): number | null {
  for (const m of matchups) {
    if (sameTeamName(m.home_team_name, teamName)) return m.home_team_id;
    if (sameTeamName(m.away_team_name, teamName)) return m.away_team_id;
  }
  return null;
}

/**
 * Every league team that currently holds a roster — the set `/teams/[name]`
 * accepts, and what the index page lists.
 */
export const fetchTeamNames = cache(async (): Promise<string[]> => {
  const data = await fetchRosterData();
  const today = new Date().toISOString().slice(0, 10);
  const rosters = reconstructRostersAtDate(
    data.transactions,
    data.players,
    data.stats,
    today,
    data.leaguePrices,
  );
  return rosters.map((r) => r.team_name).sort((a, b) => a.localeCompare(b));
});

/**
 * Resolve a team name from a URL segment, case-insensitively, returning the
 * canonical spelling. Null when no such team exists — the page 404s on that
 * rather than rendering an empty shell for a typo.
 */
export async function resolveTeamName(segment: string): Promise<string | null> {
  const wanted = decodeURIComponent(segment);
  const names = await fetchTeamNames();
  return names.find((n) => sameTeamName(n, wanted)) ?? null;
}

/**
 * Assemble the team page.
 *
 * @param withValue Include surplus and arbitration exposure. Gated on
 *   projections access by the caller, since those are the same numbers the
 *   /value and /arbitration pages are protected behind.
 */
export async function fetchTeamPage(
  teamName: string,
  withValue: boolean,
): Promise<TeamPage> {
  const [rosterData, status] = await Promise.all([
    fetchRosterData(),
    fetchLeagueStatus(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const rosters = reconstructRostersAtDate(
    rosterData.transactions,
    rosterData.players,
    rosterData.stats,
    today,
    rosterData.leaguePrices,
  );
  const roster = getRosterForTeam(rosters, teamName) ?? null;

  const matchups = status?.matchups ?? [];
  const schedule = matchups
    .map((m) => toTeamGame(m, teamName))
    .filter((g): g is TeamGame => g !== null)
    .sort((a, b) => a.week - b.week);

  const standing =
    status?.standings.find((s) => sameTeamName(s.team_name, teamName)) ?? null;

  let value: TeamValue | null = null;
  if (withValue) {
    const allPlayers = await fetchPlayersEndOfSeason();
    const surplus = calculateSurplus(allPlayers);
    const mine = surplus
      .filter((p) => sameTeamName(p.team_name, teamName))
      .sort((a, b) => b.surplus - a.surplus);
    value = {
      totalValue: Math.round(mine.reduce((s, p) => s + p.dollar_value, 0)),
      totalSurplus: Math.round(mine.reduce((s, p) => s + p.surplus, 0)),
      players: mine,
      // The same danger-zone math the arbitration page runs, pointed at this
      // team: these are the players opponents can most profitably raise.
      arbExposure: analyzeArbTargets(surplus)
        .filter((t) => sameTeamName(t.team_name, teamName))
        .slice(0, 8),
    };
  }

  return {
    teamName,
    roster,
    totalSalary: roster?.total_salary ?? 0,
    capSpace: roster?.cap_space ?? CAP_PER_TEAM,
    ottoneuTeamId: ottoneuIdFor(matchups, teamName),
    season: status?.season ?? null,
    standing,
    rankOf: status?.standings.length ?? null,
    schedule,
    value,
  };
}

export { ARB_MAX_PER_PLAYER_PER_TEAM };
