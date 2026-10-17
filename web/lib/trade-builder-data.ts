/**
 * Reads behind `/trades/builder`. The judgement is in `./trade-builder`; this
 * file gathers every team's current roster and prices each player from this
 * season's production.
 *
 * Rosters and salaries come from `league_prices` (today's roster state, via
 * `fetchPlayerList`), not a transaction replay, so a player traded this morning
 * is already on his new team. Earned value is priced over the whole league's
 * pool — replacement level is a property of the pool — and then looked up per
 * player.
 */

import { CAP_PER_TEAM, ROSTER_SPOTS, SEASON_END_RAISE_OTHER, SEASON_END_RAISE_PLAYED } from "./config";
import { fetchPlayerList, fetchPlayerSet } from "./data";
import { calculateEarnedValue } from "./earned-value";
import { fetchMatchups } from "./matchups";
import { isRealTeam } from "./roster-reconstruction";
import type { StatWindow } from "./stat-window";
import { nextSalary, seasonPace, type BuilderContext, type BuilderPlayer, type BuilderTeam } from "./trade-builder";
import { remainingSeasonFraction } from "./trades";

export interface TradeBuilderData extends BuilderContext {
  window: StatWindow;
}

export async function fetchTradeBuilderData(): Promise<TradeBuilderData> {
  const [{ players, window }, list] = await Promise.all([fetchPlayerSet(), fetchPlayerList()]);
  const matchups = await fetchMatchups(window.season);

  const earned = new Map(calculateEarnedValue(players, window).map((p) => [p.player_id, p.earned_value]));

  const byTeam = new Map<string, BuilderPlayer[]>();
  for (const p of list) {
    if (!isRealTeam(p.team_name)) continue;
    const games = p.games_played ?? 0;
    const salary = p.price ?? 0;
    const toDate = earned.get(p.id) ?? 0;
    const row: BuilderPlayer = {
      playerId: p.id,
      ottoneuId: p.ottoneu_id,
      name: p.name,
      position: p.position,
      nflTeam: p.nfl_team,
      salary,
      ppg: p.ppg ?? 0,
      gamesPlayed: games,
      earnedToDate: toDate,
      seasonPace: Math.round(seasonPace(toDate, window.fraction) * 100) / 100,
      nextSalary: nextSalary(salary, games, SEASON_END_RAISE_PLAYED, SEASON_END_RAISE_OTHER),
    };
    const roster = byTeam.get(p.team_name) ?? [];
    roster.push(row);
    byTeam.set(p.team_name, roster);
  }

  const teams: BuilderTeam[] = [...byTeam.entries()]
    .map(([teamName, roster]) => ({
      teamName,
      players: roster.sort((x, y) => y.ppg - x.ppg || x.name.localeCompare(y.name)),
    }))
    .sort((x, y) => x.teamName.localeCompare(y.teamName));

  const today = new Date().toISOString().slice(0, 10);
  return {
    teams,
    capPerTeam: CAP_PER_TEAM,
    rosterSpots: ROSTER_SPOTS,
    remainingFraction: remainingSeasonFraction(today, matchups),
    window,
  };
}
