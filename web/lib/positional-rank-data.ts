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
import { packRankTable, rankByPosition, type RankablePlayer } from "./positional-rank";
import { observedGames } from "./stat-window";
import type { PositionalRank, RankTable } from "./types";

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

  // How deep each season is comes from its own rows — the same measure the
  // stat window uses — so fire/ice's "a quarter of the season" tracks the data
  // actually loaded, not the schedule.
  for (const [season, pool] of bySeason) {
    const depth = observedGames(pool.map((p) => p.games_played));
    out.set(season, rankByPosition(pool, season, depth ?? undefined));
  }
  return out;
}

/**
 * The current season's ranks, keyed by Ottoneu ID, in the compact shape the
 * root layout hands to `PositionalRanksProvider` so every player name on the
 * site can carry its rank tag without each page fetching it.
 */
export const fetchCurrentRankTable = cache(async (): Promise<RankTable> => {
  const [season, ranks, ids] = await Promise.all([
    getEffectiveStatsSeason(),
    fetchCurrentPositionalRanks(),
    fetchOttoneuIds(),
  ]);
  return packRankTable(ranks, ids, season);
});

/** player_id → ottoneu_id for every player the site knows. */
const fetchOttoneuIds = cache(async (): Promise<Map<string, number>> => {
  // Paginate players (~1,252) past the 1000-row cap.
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("players")
      .select("id, ottoneu_id")
      .gt("ottoneu_id", 0)
      .order("id")
      .range(from, to),
  );
  return new Map(rows.map((r) => [String(r.id), Number(r.ottoneu_id)]));
});

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
