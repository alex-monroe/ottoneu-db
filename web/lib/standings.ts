/**
 * Standings, scoreboard and playoff picture — all derived from `league_matchups`.
 *
 * Nothing here touches the database: these are pure functions over the game log
 * that `scripts/scrape_matchups.py` writes. That is the point. Ottoneu publishes
 * a standings page we could have scraped into a table, but a stored standings
 * row can only ever be as fresh as its last scrape, and it can disagree with the
 * game log it was supposed to summarise. Deriving means a Sunday afternoon with
 * three games final and three in progress shows the standings as they actually
 * are, from the same rows the scoreboard is drawing.
 *
 * Two league facts are baked in, both verified against the league's own 2025
 * standings page:
 *   - the tiebreak is wins, then points for;
 *   - only regular-season games count — the playoff and consolation brackets do
 *     not move the standings, which is why `game_type` is stored per game.
 */

import { PLAYOFF_TEAMS } from "./config";

export type MatchupStatus = "scheduled" | "in_progress" | "final";
export type MatchupGameType =
  | "regular"
  | "playoff"
  | "championship"
  | "third_place"
  | "consolation";

export interface Matchup {
  game_id: number;
  season: number;
  week: number;
  home_team_id: number;
  home_team_name: string;
  home_score: number | null;
  away_team_id: number;
  away_team_name: string;
  away_score: number | null;
  status: MatchupStatus;
  game_type: MatchupGameType;
  /** The fantasy week's window, e.g. 2026-09-09 to 2026-09-15. */
  starts_on: string | null;
  ends_on: string | null;
  /** Ottoneu's own words for the state ("Sep 9", "Final"), kept verbatim. */
  status_label: string | null;
}

export interface StandingsRow {
  rank: number;
  team_id: number;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  /** Regular-season games this team has left to play. */
  games_remaining: number;
  /** Signed run of results, newest first: +3 = won the last three. */
  streak: number;
}

/** A regular-season game with both scores in — the only kind that decides a record. */
function isDecided(m: Matchup): boolean {
  return (
    m.game_type === "regular" &&
    m.status === "final" &&
    m.home_score != null &&
    m.away_score != null
  );
}

interface Tally {
  team_id: number;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  games_remaining: number;
  /** Results newest-last: 1 win, -1 loss, 0 tie. */
  results: number[];
}

function blank(team_id: number, team_name: string): Tally {
  return {
    team_id,
    team_name,
    wins: 0,
    losses: 0,
    ties: 0,
    points_for: 0,
    points_against: 0,
    games_remaining: 0,
    results: [],
  };
}

/** Trailing run of identical results, signed: +2 = won the last two, -1 = lost one. */
function streakOf(results: number[]): number {
  const last = results[results.length - 1];
  if (last == null || last === 0) return 0;
  let run = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === last; i--) run++;
  return last > 0 ? run : -run;
}

/**
 * Full standings, one row per team, best first.
 *
 * Every team that appears anywhere in `matchups` gets a row — including before
 * kickoff, when the whole league is 0-0 and the table is just the entry list.
 */
export function computeStandings(matchups: Matchup[]): StandingsRow[] {
  const teams = new Map<number, Tally>();
  const see = (id: number, name: string) => {
    const existing = teams.get(id);
    if (existing) return existing;
    const fresh = blank(id, name);
    teams.set(id, fresh);
    return fresh;
  };

  // Chronological, so `streak` reads in the order the games were played.
  const ordered = [...matchups].sort(
    (a, b) => a.week - b.week || a.game_id - b.game_id,
  );

  for (const m of ordered) {
    const home = see(m.home_team_id, m.home_team_name);
    const away = see(m.away_team_id, m.away_team_name);
    if (m.game_type !== "regular") continue;

    if (!isDecided(m)) {
      home.games_remaining++;
      away.games_remaining++;
      continue;
    }

    const hs = m.home_score as number;
    const as = m.away_score as number;
    home.points_for += hs;
    home.points_against += as;
    away.points_for += as;
    away.points_against += hs;

    if (hs > as) {
      home.wins++;
      away.losses++;
      home.results.push(1);
      away.results.push(-1);
    } else if (as > hs) {
      away.wins++;
      home.losses++;
      away.results.push(1);
      home.results.push(-1);
    } else {
      home.ties++;
      away.ties++;
      home.results.push(0);
      away.results.push(0);
    }
  }

  return [...teams.values()]
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.points_for - a.points_for ||
        a.team_name.localeCompare(b.team_name),
    )
    .map((t, i) => ({
      rank: i + 1,
      team_id: t.team_id,
      team_name: t.team_name,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
      points_for: t.points_for,
      points_against: t.points_against,
      games_remaining: t.games_remaining,
      streak: streakOf(t.results),
    }));
}

export interface PlayoffSeed extends StandingsRow {
  /**
   * 1-based seed for a team currently in the field, else null. Null for
   * everyone until the first regular-season game is final — see the note on
   * {@link computePlayoffPicture}.
   */
  seed: number | null;
  in_field: boolean;
  /**
   * Games behind the last team currently holding a playoff spot. 0 for anyone in
   * the field; the usual (win gap + loss gap) / 2.
   */
  games_back: number;
  /** True only when it is arithmetically settled — see the note on this file. */
  clinched: boolean;
  eliminated: boolean;
}

export interface PlayoffPicture {
  slots: number;
  seeds: PlayoffSeed[];
  /** False before any regular-season game is final — nothing to project yet. */
  started: boolean;
}

/**
 * The playoff field as things stand, plus what is already arithmetically settled.
 *
 * `clinched` and `eliminated` are deliberately CONSERVATIVE: a team is called
 * eliminated only when enough other teams already have more wins than it can
 * still reach, and clinched only when enough other teams can no longer reach the
 * wins it already has. Points-for tiebreaks and head-to-head can settle a spot
 * earlier than that; we would rather be silent than tell a manager their season
 * is over on a technicality we got wrong.
 */
export function computePlayoffPicture(
  standings: StandingsRow[],
  slots: number = PLAYOFF_TEAMS,
): PlayoffPicture {
  const started = standings.some((r) => r.wins + r.losses + r.ties > 0);
  const cut = standings[Math.min(slots, standings.length) - 1];
  const nonQualifiers = Math.max(standings.length - slots, 0);

  const seeds = standings.map((row, i) => {
    // Before a single game is final every team is 0-0 and the sort falls through
    // to the alphabetical last resort, so "seed 1" would just mean "first name in
    // the alphabet". Nobody is in the field until somebody has won something.
    const in_field = started && i < slots;
    const maxWins = row.wins + row.games_remaining;
    const aboveReach = standings.filter(
      (o) => o.team_id !== row.team_id && o.wins > maxWins,
    ).length;
    const belowReach = standings.filter(
      (o) => o.team_id !== row.team_id && o.wins + o.games_remaining < row.wins,
    ).length;

    return {
      ...row,
      seed: in_field ? i + 1 : null,
      in_field,
      games_back:
        in_field || !cut || !started
          ? 0
          : Math.max(0, (cut.wins - row.wins + (row.losses - cut.losses)) / 2),
      clinched: started && belowReach >= nonQualifiers,
      eliminated: started && aboveReach >= slots,
    };
  });

  return { slots, seeds, started };
}

/**
 * The week a scoreboard should open on.
 *
 * Preference order: the week whose date window contains today (the slate being
 * played right now), then the earliest week with a game still to finish, then
 * the last week on the schedule once the season is over.
 */
export function currentScoreboardWeek(
  matchups: Matchup[],
  today: string,
): number | null {
  if (matchups.length === 0) return null;

  const live = matchups.find(
    (m) => m.starts_on && m.ends_on && m.starts_on <= today && today <= m.ends_on,
  );
  if (live) return live.week;

  const unfinished = matchups
    .filter((m) => m.status !== "final")
    .map((m) => m.week)
    .sort((a, b) => a - b);
  if (unfinished.length > 0) return unfinished[0];

  return Math.max(...matchups.map((m) => m.week));
}

/** Week numbers present in a set of matchups, ascending. */
export function weeksIn(matchups: Matchup[]): number[] {
  return [...new Set(matchups.map((m) => m.week))].sort((a, b) => a - b);
}

/** "8-6" / "8-5-1" — a team's record, in the usual shorthand. */
export function formatRecord(row: Pick<StandingsRow, "wins" | "losses" | "ties">): string {
  return row.ties > 0
    ? `${row.wins}-${row.losses}-${row.ties}`
    : `${row.wins}-${row.losses}`;
}

/** "W3" / "L2" / "—" for a streak, in the usual shorthand. */
export function formatStreak(streak: number): string {
  if (streak === 0) return "—";
  return streak > 0 ? `W${streak}` : `L${-streak}`;
}
