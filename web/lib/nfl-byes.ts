/**
 * NFL bye weeks (lib/data/nfl-bye-weeks.ts), looked up by the team spelling
 * the roster carries.
 *
 * `players.nfl_team` uses Ottoneu's codes, which differ from nflverse's for a
 * couple of teams (JAC for Jacksonville, for one). A team that is not an NFL
 * team at all — a free agent, a college player's school — has no bye.
 */

import { NFL_BYE_WEEKS } from "./data/nfl-bye-weeks";

/** Roster/other-source spellings → the nflverse code the bye table is keyed by. */
const ALIASES: Record<string, string> = {
  JAC: "JAX",
  LAR: "LA",
  LVR: "LV",
  OAK: "LV",
  SD: "LAC",
  STL: "LA",
  WSH: "WAS",
  GNB: "GB",
  KAN: "KC",
  NOR: "NO",
  NWE: "NE",
  SFO: "SF",
  TAM: "TB",
};

/** Whether the season's bye weeks are known at all. */
export function hasByeWeeks(season: number): boolean {
  return NFL_BYE_WEEKS[season] != null;
}

/** The team's bye week that season, or null when unknown. */
export function byeWeek(season: number, nflTeam: string | null | undefined): number | null {
  if (!nflTeam) return null;
  const code = nflTeam.trim().toUpperCase();
  return NFL_BYE_WEEKS[season]?.[ALIASES[code] ?? code] ?? null;
}

/** True when the team is on bye that week. */
export function isOnBye(season: number, nflTeam: string | null | undefined, week: number): boolean {
  return byeWeek(season, nflTeam) === week;
}
