/**
 * Assembling lineup-ready rosters for a given NFL week.
 *
 * `/lineup` and `/matchup` both need the same thing: every team's current
 * roster, scored three ways (this week's third-party forecast, our season-long
 * model, last season's actuals). Shared here so the two pages cannot drift
 * about what "this week" means or which projection they are showing.
 */

import { fetchRosterData, reconstructRostersAtDate } from "./roster-reconstruction";
import { fetchHoverExtras } from "./analysis";
import { fetchWeeklyByPlayer } from "./weekly-projections";
import { getDisplayWeeks } from "./nfl-week";
import { fetchAvailableWeeks } from "./weekly-projections";
import type { LineupPlayer } from "./lineup";

export interface LineupTeam {
  team_name: string;
  players: LineupPlayer[];
}

export interface LineupWeekContext {
  season: number | null;
  /** The week being scored, or null when no weekly data exists at all. */
  week: number | null;
  /** Weeks with stored projections, newest first — the picker's options. */
  weeks: number[];
  teams: LineupTeam[];
  /** True when the selected week actually has third-party projections. */
  hasWeekly: boolean;
}

/**
 * Build every team's roster for one week.
 *
 * @param requestedWeek `?week=` from the URL; ignored when it has no data.
 * @param hasProjections Whether the viewer may see our seasonal model.
 */
export async function fetchLineupWeek(
  requestedWeek: number | undefined,
  hasProjections: boolean,
): Promise<LineupWeekContext> {
  const [data, display] = await Promise.all([
    fetchRosterData(),
    getDisplayWeeks(),
  ]);

  const season = display.season;
  const weeks = season != null ? await fetchAvailableWeeks(season) : [];
  // Prefer an explicit ?week=, then the upcoming week, then the newest stored.
  const week =
    requestedWeek != null && weeks.includes(requestedWeek)
      ? requestedWeek
      : display.upcoming != null && weeks.includes(display.upcoming)
        ? display.upcoming
        : (weeks[0] ?? null);

  const [{ projMap }, weekly] = await Promise.all([
    fetchHoverExtras(hasProjections),
    season != null && week != null
      ? fetchWeeklyByPlayer(season, week)
      : Promise.resolve(new Map()),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const rosters = reconstructRostersAtDate(
    data.transactions,
    data.players,
    data.stats,
    today,
    data.leaguePrices,
  );

  const teams: LineupTeam[] = rosters.map((r) => ({
    team_name: r.team_name,
    players: r.players.map((p) => {
      const w = weekly.get(p.player_id);
      return {
        player_id: p.player_id,
        ottoneu_id: p.ottoneu_id,
        name: p.name,
        position: p.position,
        nfl_team: p.nfl_team,
        ppg: p.ppg ?? 0,
        projected_ppg: projMap?.[p.player_id]?.ppg ?? 0,
        // Absent row = bye or inactive. Kept null rather than coerced to 0 so
        // the UI can tell the two apart.
        weekly_points: w?.projected_points ?? null,
        weekly_opponent: w?.opponent ?? null,
      };
    }),
  }));

  return { season, week, weeks, teams, hasWeekly: weekly.size > 0 };
}
