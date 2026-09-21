/**
 * Data access for historical earned value.
 *
 * `earned-value.ts` is a pure calculator over a *whole season's* player pool —
 * it has to be, because replacement level is a property of the pool, not of a
 * player. So a single player's earned value for 2023 cannot be read off his own
 * row; the league's 2023 finishers have to be priced together and his entry
 * picked out. That is what this module does.
 *
 * Nothing is stored. Earned value is a pure function of rows already in
 * `player_stats`, so it is derived on read like the standings and the weekly
 * recap (see docs/references/matchups-and-standings.md). A stored column would
 * be a second source of truth that goes stale the moment the method changes.
 */
import { supabase, fetchAllRows } from "./supabase";
import { computeEarnedValue } from "./earned-value";

/**
 * One player's earned value in one season. Deliberately carries no
 * `realized_surplus`: that needs the salary he was *carried at during that
 * season*, and `league_prices` only holds today's salary. Reconstructing a
 * historical salary is a different job (`roster-reconstruction.ts`), so rather
 * than quietly subtract the wrong number this type omits it.
 */
export interface SeasonEarnedValue {
    earned_value: number;
    points_above_replacement: number;
    replacement_points: number;
}

/**
 * Earned value for every player in each of `seasons`, keyed season → player_id.
 *
 * One paginated read of `players` plus one of `player_stats` across all the
 * requested seasons, then the pool for each season is priced independently —
 * replacement level in 2021 has nothing to do with replacement level in 2025.
 */
export async function fetchEarnedValueBySeason(
    seasons: number[],
): Promise<Map<number, Map<string, SeasonEarnedValue>>> {
    const out = new Map<number, Map<string, SeasonEarnedValue>>();
    if (seasons.length === 0) return out;

    const [players, stats] = await Promise.all([
        // Paginate players (~1,252) past the 1000-row cap.
        fetchAllRows((from, to) =>
            supabase
                .from("players")
                .select("id, position, is_college")
                .gt("ottoneu_id", 0)
                .order("id")
                .range(from, to),
        ),
        // Paginate player_stats — a single season already exceeds the cap, and
        // this asks for several.
        fetchAllRows((from, to) =>
            supabase
                .from("player_stats")
                .select("player_id, season, total_points")
                .in("season", seasons)
                .order("player_id")
                .range(from, to),
        ),
    ]);

    const byId = new Map(players.map((p) => [String(p.id), p]));
    const bySeason = new Map<number, { player_id: string; position: string; total_points: number; price: number; is_college: boolean }[]>();

    for (const row of stats) {
        const player = byId.get(String(row.player_id));
        if (!player) continue;
        const season = Number(row.season);
        const pool = bySeason.get(season) ?? [];
        pool.push({
            player_id: String(row.player_id),
            position: player.position ?? "",
            total_points: Number(row.total_points) || 0,
            // No salary is carried here — see SeasonEarnedValue. Zero keeps the
            // calculator's contract satisfied; realized_surplus is discarded.
            price: 0,
            is_college: player.is_college ?? false,
        });
        bySeason.set(season, pool);
    }

    for (const [season, pool] of bySeason) {
        const priced = computeEarnedValue(pool);
        out.set(
            season,
            new Map(
                priced.map((p) => [
                    p.player_id,
                    {
                        earned_value: p.earned_value,
                        points_above_replacement: p.points_above_replacement,
                        replacement_points: p.replacement_points,
                    },
                ]),
            ),
        );
    }

    return out;
}

/**
 * Earned value per season for one player, keyed by season.
 *
 * Convenience over `fetchEarnedValueBySeason` for the player card, which knows
 * which seasons it is about to render.
 */
export async function fetchPlayerEarnedValue(
    playerId: string,
    seasons: number[],
): Promise<Map<number, SeasonEarnedValue>> {
    const bySeason = await fetchEarnedValueBySeason(seasons);
    const out = new Map<number, SeasonEarnedValue>();
    for (const [season, pool] of bySeason) {
        const row = pool.get(playerId);
        if (row) out.set(season, row);
    }
    return out;
}
