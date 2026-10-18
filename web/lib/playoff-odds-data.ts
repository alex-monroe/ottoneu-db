/**
 * Server-side inputs for the playoff-odds simulation (lib/playoff-odds.ts).
 *
 * Gathers the game log, each team's optimal-lineup projection from the
 * third-party weekly projections, and live projections for games in progress,
 * then runs the simulation. Returns null outside the regular season — before
 * kickoff there is nothing to simulate from but projections, and once every
 * regular-season game is final the odds are just the standings.
 *
 * The weekly projections themselves are gated (they are what /weekly is
 * protected for), but only team-level odds leave this module for the public
 * pages; no player's projection does.
 */

import { cache } from "react";
import { PLAYOFF_TEAMS } from "./config";
import { getLeagueStatus, type LeagueStatus } from "./matchups";
import { getSeasonContextNow } from "./season";
import { getDisplayWeeks, todayInLeagueTz } from "./nfl-week";
import { fetchAvailableWeeks, fetchWeeklyByPlayer, type WeeklyProjection } from "./weekly-projections";
import { fetchRosterData, reconstructRostersAtDate } from "./roster-reconstruction";
import { fetchLiveWeek } from "./matchup-lineups";
import { scoreboardProjection } from "./live-matchup";
import { lineupTotal, optimizeLineup, type LineupPlayer } from "./lineup";
import { sameTeamName } from "./teams";
import {
  buildScoreModels,
  computePlayoffOdds,
  type LiveMeans,
  type TeamProjection,
} from "./playoff-odds";
import type { PlayoffOdds } from "./types";

/** Optimal-lineup total for a roster under one set of weekly projections. */
function optimalTotal(
  players: { player_id: string; name: string; position: string; nfl_team: string }[],
  pointsFor: (playerId: string) => number | null,
): number {
  const lineupPlayers: LineupPlayer[] = players.map((p) => ({
    player_id: p.player_id,
    name: p.name,
    position: p.position,
    nfl_team: p.nfl_team,
    ppg: 0,
    projected_ppg: 0,
    weekly_points: pointsFor(p.player_id),
  }));
  const map = new Map(lineupPlayers.map((p) => [p.player_id, p]));
  return lineupTotal(optimizeLineup(lineupPlayers, "weekly"), map, "weekly");
}

/**
 * Each team's projected weekly score, keyed by team_id.
 *
 * Two numbers per team. The projection week's own optimal lineup (byes and
 * all) is used for that week's game. Every later week uses a **bye-neutral
 * rate**: the same lineup, but a player with no row this week (a bye) is
 * scored at his previous week's projection — otherwise a team with three
 * starters on bye this week would be simulated as that weak for the rest of
 * the season.
 */
async function fetchTeamProjections(
  status: LeagueStatus,
): Promise<{ projections: Map<number, TeamProjection>; week: number | null }> {
  const [display, weeks] = await Promise.all([
    getDisplayWeeks(),
    fetchAvailableWeeks(status.season),
  ]);
  const week =
    display.upcoming != null && weeks.includes(display.upcoming)
      ? display.upcoming
      : (weeks[0] ?? null);
  if (week == null) return { projections: new Map(), week: null };
  const prior = weeks.find((w) => w < week) ?? null;

  const [rosterData, current, previous] = await Promise.all([
    fetchRosterData(),
    fetchWeeklyByPlayer(status.season, week),
    prior != null
      ? fetchWeeklyByPlayer(status.season, prior)
      : Promise.resolve(new Map<string, WeeklyProjection>()),
  ]);
  if (current.size === 0) return { projections: new Map(), week: null };

  const rosters = reconstructRostersAtDate(
    rosterData.transactions,
    rosterData.players,
    rosterData.stats,
    todayInLeagueTz(),
    rosterData.leaguePrices,
  );

  const projections = new Map<number, TeamProjection>();
  for (const row of status.standings) {
    const roster = rosters.find((r) => sameTeamName(r.team_name, row.team_name));
    if (!roster) continue;
    const thisWeek = optimalTotal(roster.players, (id) => current.get(id)?.projected_points ?? null);
    const rate = optimalTotal(
      roster.players,
      (id) => current.get(id)?.projected_points ?? previous.get(id)?.projected_points ?? null,
    );
    projections.set(row.team_id, { rate, byWeek: new Map([[week, thisWeek]]) });
  }
  return { projections, week };
}

/** Live projections for this week's games already under way, keyed by game_id. */
async function fetchLiveMeans(status: LeagueStatus): Promise<Map<number, LiveMeans>> {
  const inProgress = status.matchups.filter(
    (m) => m.game_type === "regular" && m.status === "in_progress",
  );
  const weeks = [...new Set(inProgress.map((m) => m.week))];
  const out = new Map<number, LiveMeans>();
  for (const week of weeks) {
    const games = await fetchLiveWeek(status.season, week);
    for (const m of inProgress.filter((g) => g.week === week)) {
      const projection = scoreboardProjection(games.get(m.game_id));
      if (projection) out.set(m.game_id, projection);
    }
  }
  return out;
}

/**
 * The league's playoff odds right now, or null outside the regular season.
 *
 * Request-cached: the scoreboard, homepage and team pages all read it, and a
 * run is ~13 simulations of the season.
 */
export const getPlayoffOdds = cache(async (): Promise<PlayoffOdds | null> => {
  const [ctx, status] = await Promise.all([getSeasonContextNow(), getLeagueStatus()]);
  if (!status || ctx.phase !== "in_season" || status.season !== ctx.leagueSeason) return null;

  const remaining = status.matchups.some(
    (m) => m.game_type === "regular" && m.status !== "final",
  );
  if (!remaining) return null;

  const [{ projections, week }, liveMeans] = await Promise.all([
    fetchTeamProjections(status),
    fetchLiveMeans(status),
  ]);
  const models = buildScoreModels(status.matchups, projections);
  return computePlayoffOdds(status.matchups, models, {
    slots: PLAYOFF_TEAMS,
    liveMeans,
    tradeDeadline: ctx.deadlines.trade_deadline ?? null,
    today: todayInLeagueTz(),
    projectionWeek: week,
  });
});
