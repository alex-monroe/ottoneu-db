/**
 * The **stat window** — which slice of a season the production numbers on a page
 * came from, and how much of a season that is.
 *
 * ## Why this exists
 *
 * Every analysis page reads `player_stats`, which is keyed `(player_id, season)`
 * and holds *season-to-date* totals. A row is therefore the same shape in
 * February and in week 2: `total_points`, `games_played`, `ppg`. Nothing in the
 * data says whether a number is a finished season or two Sundays.
 *
 * That was harmless while the table only ever held completed seasons. It stops
 * being harmless the moment `pull_player_stats` runs during the season, which it
 * now does every Tuesday (.github/workflows/pull-player-stats.yml). From then on
 * the same code that produced "the #12 WR averaged 13.4 PPG last year" produces
 * "the #12 WR averages 13.4 PPG" off a two-game sample, and the dollar values on
 * /value price a full auction off a fortnight.
 *
 * So the window is made explicit and carried **next to the numbers it describes**.
 * Pages derive their labels from the same object the math is scaled by, which is
 * what makes it impossible to show a partial-season figure under a full-season
 * heading: there is one source for both.
 *
 * ## The safety property
 *
 * `fraction === 1` is a strict no-op. Every window-aware formula reduces to
 * exactly the arithmetic it did before this module existed, so the retrospective
 * pages cannot change behaviour — guarded by tests in
 * `__tests__/lib/stat-window.ts` and `__tests__/lib/surplus-economy.test.ts`.
 * There is one code path, not two.
 *
 * ## Where each field comes from, and why they have different sources
 *
 *   - **`complete`** comes from the season cycle (`season.ts`), not from the
 *     data. It is the authoritative answer to "is this season over", and
 *     deriving it from the calendar rather than from row contents is what
 *     guarantees a finished season always takes the `fraction === 1` path even
 *     if its rows are odd.
 *   - **`games`** comes from the rows themselves — the depth of production the
 *     data actually holds. Reading it off the data rather than off the schedule
 *     means the scale can never disagree with the numbers it scales: if the
 *     stats pull is a week behind the schedule, the window is a week behind too,
 *     which is correct.
 *   - **`weeksPlayed`** comes from the league schedule (`league_matchups`) and is
 *     used **only in the human sentence**. It never feeds the math, so a
 *     disagreement between the schedule and the stats table is cosmetic.
 */

import { cache } from "react";
import { FULL_SEASON_GAMES, LEAGUE_ID } from "./config";
import { getSeasonContextNow } from "./season";
import { supabase } from "./supabase";
import type { MatchupGameType, MatchupStatus } from "./standings";

/** The only three columns week-counting needs — so the query can select just them. */
export interface ScheduledWeek {
  week: number;
  status: MatchupStatus;
  game_type: MatchupGameType;
}

export interface StatWindow {
  /** The season these numbers belong to. */
  season: number;
  /**
   * Games of the {@link FULL_SEASON_GAMES}-game season this window holds.
   * `FULL_SEASON_GAMES` for a completed season.
   */
  games: number;
  /**
   * `games / FULL_SEASON_GAMES`, in (0, 1]. The single scale factor the dollar
   * math applies — see `surplus.ts#distributableCap`.
   */
  fraction: number;
  /** The season is over, so this is the full-season retrospective frame. */
  complete: boolean;
  /** Completed league weeks, for the label only. Null when unknown. */
  weeksPlayed: number | null;
  /** "2025 season" / "2026 through Week 2" — for headings and banners. */
  label: string;
  /** "2025" / "2026 to date" — for a tab or a picker button. */
  shortLabel: string;
}

/**
 * How many games of production a set of rows holds.
 *
 * The 90th percentile of `games_played` among players who have played at all —
 * the players who have missed nothing define how deep the season is. A
 * percentile rather than the maximum so that one stale or malformed row cannot
 * claim a finished season; clamped into `[1, FULL_SEASON_GAMES]` so it can never
 * scale anything by zero or by more than a season.
 *
 * Returns `null` when no row has a game, which means there is no production to
 * describe and the caller should show its own empty state.
 */
export function observedGames(gamesPlayed: readonly number[]): number | null {
  const played = gamesPlayed
    .filter((g) => Number.isFinite(g) && g > 0)
    .sort((a, b) => a - b);
  if (played.length === 0) return null;
  const idx = Math.ceil(0.9 * played.length) - 1;
  const games = Math.round(played[Math.max(0, idx)]);
  return Math.min(Math.max(games, 1), FULL_SEASON_GAMES);
}

/**
 * Completed weeks of a season's schedule: weeks whose regular-season games have
 * all finished. A week half-played does not count — its production is partly
 * missing from `player_stats`, so counting it would overstate the window.
 */
export function completedWeeks(matchups: readonly ScheduledWeek[]): number {
  const regular = matchups.filter((m) => m.game_type === "regular");
  if (regular.length === 0) return 0;
  const byWeek = new Map<number, ScheduledWeek[]>();
  for (const m of regular) {
    const list = byWeek.get(m.week);
    if (list) list.push(m);
    else byWeek.set(m.week, [m]);
  }
  let done = 0;
  for (const games of byWeek.values()) {
    if (games.every((g) => g.status === "final")) done++;
  }
  return done;
}

function describe(
  season: number,
  complete: boolean,
  weeksPlayed: number | null,
): Pick<StatWindow, "label" | "shortLabel"> {
  if (complete) {
    return { label: `${season} season`, shortLabel: String(season) };
  }
  if (weeksPlayed && weeksPlayed > 0) {
    return {
      label: `${season} through Week ${weeksPlayed}`,
      shortLabel: `${season} to date`,
    };
  }
  return { label: `${season} to date`, shortLabel: `${season} to date` };
}

/**
 * Assemble a window. Pure, so the scaling rules are testable without a database.
 *
 * A completed season is pinned to the full-season frame regardless of what the
 * rows say — that is the no-op guarantee the whole module rests on.
 */
export function buildStatWindow(input: {
  season: number;
  complete: boolean;
  /** Per-player `games_played` for the season. Ignored when `complete`. */
  gamesPlayed?: readonly number[];
  weeksPlayed?: number | null;
}): StatWindow {
  const { season, complete, gamesPlayed = [], weeksPlayed = null } = input;
  const games = complete
    ? FULL_SEASON_GAMES
    : (observedGames(gamesPlayed) ?? 0);
  // A live season with no games yet has nothing to scale. `fraction` stays 0 so
  // a caller that does not check gets zeroed dollars rather than a division by
  // zero or a full-season claim over an empty table.
  const fraction = games === 0 ? 0 : games / FULL_SEASON_GAMES;
  return {
    season,
    games,
    fraction: Math.min(fraction, 1),
    complete: complete || fraction >= 1,
    weeksPlayed,
    ...describe(season, complete || fraction >= 1, weeksPlayed),
  };
}

/** The full-season frame — the default every window-aware formula falls back to. */
export function fullSeasonWindow(season: number): StatWindow {
  return buildStatWindow({ season, complete: true });
}

/**
 * Completed weeks of a season's league schedule, or null when none is stored.
 *
 * Read straight from `league_matchups` rather than through `fetchLeagueStatus`,
 * which also computes standings and the playoff picture that nothing here needs.
 */
export const fetchCompletedWeeks = cache(
  async (season: number): Promise<number | null> => {
    const { data, error } = await supabase
      .from("league_matchups")
      .select("week, status, game_type")
      .eq("league_id", LEAGUE_ID)
      .eq("season", season);
    if (error || !data?.length) return null;
    return completedWeeks(data as unknown as ScheduledWeek[]);
  },
);

/**
 * Resolve the window for a season, given the rows a page has already fetched.
 *
 * Takes the rows rather than re-reading them: the window must describe the very
 * numbers the page is about to render, and the only way to be sure of that is to
 * measure them.
 */
export async function resolveStatWindow(
  season: number,
  gamesPlayed: readonly number[],
): Promise<StatWindow> {
  const ctx = await getSeasonContextNow();
  // Live means "this is the season being played right now". Any earlier season
  // is finished; a later one is somebody backfilling ahead, which the stats
  // clamp already refuses to follow (see stats-season.ts).
  const live = season >= ctx.statsSeason && ctx.phase === "in_season";
  if (!live) return fullSeasonWindow(season);
  return buildStatWindow({
    season,
    complete: false,
    gamesPlayed,
    weeksPlayed: await fetchCompletedWeeks(season),
  });
}
