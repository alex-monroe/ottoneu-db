/**
 * Reads of `keeper_outlook` (migration 052). Pure reading lives in
 * `./keeper-outlook`.
 *
 * A deploy that lands before the table is applied, or before the publish job
 * has run, must still render: every reader falls back to the old point read
 * when a player has no outlook, so a failed read returns nothing rather than
 * throwing.
 */

import { fetchAllRows, supabase } from "./supabase";
import type { KeeperOutlook } from "./types";

interface OutlookRow {
  player_id: string;
  season: number;
  as_of_week: number;
  value_season: number;
  value_quantiles: number[];
  mean_value: number;
  p10: number;
  p50: number;
  p90: number;
  own_weight: number;
  years_in_league: number;
  draft_bucket: string;
}

const COLUMNS =
  "id, player_id, season, as_of_week, value_season, value_quantiles, mean_value, p10, p50, p90, own_weight, years_in_league, draft_bucket";

function shape(r: OutlookRow): KeeperOutlook {
  return {
    playerId: r.player_id,
    season: r.season,
    asOfWeek: r.as_of_week,
    valueSeason: r.value_season,
    quantiles: (r.value_quantiles ?? []).map(Number),
    mean: Number(r.mean_value),
    p10: Number(r.p10),
    p50: Number(r.p50),
    p90: Number(r.p90),
    ownWeight: Number(r.own_weight),
    yearsInLeague: r.years_in_league,
    draftBucket: r.draft_bucket,
  };
}

/** Every snapshot for the given seasons (all weeks). */
export async function fetchKeeperOutlooks(seasons: readonly number[]): Promise<KeeperOutlook[]> {
  if (seasons.length === 0) return [];
  try {
    const rows = await fetchAllRows((from, to) =>
      supabase
        .from("keeper_outlook")
        .select(COLUMNS)
        .in("season", [...seasons])
        .order("id")
        .range(from, to),
    );
    return (rows as unknown as OutlookRow[]).map(shape);
  } catch (error) {
    console.error("fetchKeeperOutlooks error — keeper value falls back to the point read", error);
    return [];
  }
}

/** The newest snapshot per player for one season. */
export async function fetchLatestKeeperOutlooks(season: number): Promise<Map<string, KeeperOutlook>> {
  const latest = new Map<string, KeeperOutlook>();
  for (const r of await fetchKeeperOutlooks([season])) {
    const have = latest.get(r.playerId);
    if (!have || r.asOfWeek > have.asOfWeek) latest.set(r.playerId, r);
  }
  return latest;
}
