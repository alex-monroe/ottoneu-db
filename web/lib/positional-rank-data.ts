/**
 * Data access for positional rank.
 *
 * `positional-rank.ts` ranks a whole season's pool; a single player's "WR17"
 * cannot be read off his own row. So this reads each requested season's
 * finishers, ranks them together, and hands back the map. Nothing is stored —
 * a rank is a function of rows already in `player_stats`, derived on read like
 * earned value (earned-value-data.ts) and the standings.
 */
import { cache } from "react";
import { supabase, fetchAllRows } from "./supabase";
import { getEffectiveStatsSeason } from "./stats-season";
import { rankByPosition, type RankablePlayer } from "./positional-rank";
import type { PositionalRank } from "./types";

/**
 * Positional ranks for every player in each of `seasons`, keyed
 * season → player_id.
 *
 * Positions come from `players` (today's position), the same simplification
 * earned value makes for past seasons.
 */
export async function fetchPositionalRanksBySeason(
  seasons: number[],
): Promise<Map<number, Map<string, PositionalRank>>> {
  const out = new Map<number, Map<string, PositionalRank>>();
  if (seasons.length === 0) return out;

  const [players, stats] = await Promise.all([
    // Paginate players (~1,252) past the 1000-row cap.
    fetchAllRows((from, to) =>
      supabase
        .from("players")
        .select("id, position")
        .gt("ottoneu_id", 0)
        .order("id")
        .range(from, to),
    ),
    // Paginate player_stats — a single season already exceeds the cap.
    fetchAllRows((from, to) =>
      supabase
        .from("player_stats")
        .select("player_id, season, total_points, games_played, ppg")
        .in("season", seasons)
        .order("player_id")
        .order("season")
        .range(from, to),
    ),
  ]);

  const positionById = new Map(players.map((p) => [String(p.id), p.position ?? ""]));
  const bySeason = new Map<number, RankablePlayer[]>();
  for (const row of stats) {
    const position = positionById.get(String(row.player_id));
    if (position == null) continue;
    const season = Number(row.season);
    const pool = bySeason.get(season) ?? [];
    pool.push({
      player_id: String(row.player_id),
      position,
      total_points: Number(row.total_points) || 0,
      games_played: Number(row.games_played) || 0,
      ppg: Number(row.ppg) || 0,
    });
    bySeason.set(season, pool);
  }

  for (const [season, pool] of bySeason) {
    out.set(season, rankByPosition(pool, season));
  }
  return out;
}

/**
 * Positional ranks for the current stats season — the season the site is
 * reading production for (clamped to one `player_stats` can answer, see
 * stats-season.ts). What the hover card and the player-card badge show.
 *
 * Cached per request: every hover-card page asks for it.
 */
export const fetchCurrentPositionalRanks = cache(
  async (): Promise<Map<string, PositionalRank>> => {
    const season = await getEffectiveStatsSeason();
    return (await fetchPositionalRanksBySeason([season])).get(season) ?? new Map();
  },
);
