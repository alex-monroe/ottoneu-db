/**
 * Which season's actual `player_stats` the analysis pages should read.
 *
 * `getStatsSeason()` (lib/season.ts) answers "which season are we *in*" —
 * `league_calendar` flips it to the new league season the moment
 * `regular_season_start` passes. That is the right answer for the season
 * cycle, and the wrong one for reading production: `player_stats` is written
 * by the `pull_player_stats` task, and a season only gets rows once that task
 * has run for it. Between kickoff and the first run there is a window where
 * `statsSeason` names a season the table knows nothing about.
 *
 * Every consumer of `fetchPlayers*` drops players with no stats row
 * (`if (!pStats) continue`), so during that window the window is not a partial
 * view — it is an empty one. Observed live on 2026-09-19: `/players` showed a
 * dash for PPG/Points/GP on all 1,269 players, `/rosters` the same on all 239,
 * and `/value` (VORP + surplus), `/free-agents` and `/projected-salary` each
 * rendered their "no data" empty state.
 *
 * So: ask for the current stats season, but never point at a season the table
 * cannot answer for. The clamp is one-directional — it only ever falls *back*
 * to an older season that has rows, and stops applying the moment the current
 * season is loaded, so in-season stats light up on their own with no deploy.
 */

import { cache } from "react";
import { supabase } from "./supabase";
import { getStatsSeason } from "./season";

/**
 * The newest season with any `player_stats` row, or null when the table is
 * empty.
 *
 * pagination-safe: `.limit(1)` — one row, the newest season, never a scan.
 */
export const getLatestLoadedStatsSeason = cache(
  async (): Promise<number | null> => {
    const { data, error } = await supabase
      .from("player_stats")
      .select("season")
      .order("season", { ascending: false })
      .limit(1);
    if (error || !data?.length) return null;
    const season = Number(data[0].season);
    return Number.isFinite(season) ? season : null;
  },
);

/**
 * The season to read actual production for: the current stats season, clamped
 * back to the newest season that actually has rows.
 *
 * Returns the calendar's answer unchanged whenever the table can serve it —
 * including when the current season is only partially loaded, which is a real
 * in-season view rather than a gap.
 */
export const getEffectiveStatsSeason = cache(async (): Promise<number> => {
  const [target, latest] = await Promise.all([
    getStatsSeason(),
    getLatestLoadedStatsSeason(),
  ]);
  return clampStatsSeason(target, latest);
});

/**
 * Pure half of {@link getEffectiveStatsSeason}, exported for testing.
 *
 * `latest > target` is deliberately left alone: a season newer than the one
 * the calendar names is someone backfilling ahead, not a reason to jump the
 * season cycle forward.
 */
export function clampStatsSeason(target: number, latest: number | null): number {
  if (latest == null) return target;
  return latest < target ? latest : target;
}
