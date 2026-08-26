/**
 * Server-side data for the snake-draft tool.
 *
 * Unlike the Ottoneu mock auction (lib/mock-draft.ts) this reads nothing about
 * the league — no rosters, no salaries, no cap. It only needs a consensus
 * player board, which comes from Draft Sharks' half-PPR superflex auction
 * values; the engine re-prices that board for whatever league format the user
 * configures. See docs/references/snake-draft.md.
 */
import type { MarketPlayer, Pos } from "@/lib/snake-draft-engine";
import { POS_LIST } from "@/lib/snake-draft-engine";
import { getProjectionSeason } from "@/lib/season";
import { fetchAllRows, supabase } from "@/lib/supabase";

export interface SnakeDraftData {
  pool: MarketPlayer[];
  season: number;
}

const isPos = (p: string | null): p is Pos => !!p && (POS_LIST as string[]).includes(p);

/**
 * The season whose Draft Sharks board we should draft off: the projection
 * season if it has been scraped, otherwise the most recent season that has.
 * (The calendar rolls to the new season before the new board is published.)
 */
async function boardSeason(): Promise<number> {
  const target = await getProjectionSeason();
  const { count, error } = await supabase
    .from("draft_sharks_values")
    .select("id", { count: "exact", head: true }) // pagination-safe: head-only count
    .eq("season", target);
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return target;

  const { data, error: e2 } = await supabase
    .from("draft_sharks_values")
    .select("season")
    .order("season", { ascending: false })
    .limit(1); // pagination-safe: single most-recent season
  if (e2) throw new Error(e2.message);
  return data?.[0]?.season ?? target;
}

export async function fetchSnakeDraftData(): Promise<SnakeDraftData> {
  const season = await boardSeason();

  const [values, players] = await Promise.all([
    fetchAllRows<{ player_id: string; market_auction_value: number | null }>((from, to) =>
      supabase
        .from("draft_sharks_values")
        .select("player_id, market_auction_value")
        .eq("season", season)
        .order("player_id")
        .range(from, to),
    ),
    // NB: no `ottoneu_id > 0` filter here. Other pages use it to trim the
    // backfill-origin rows, but the board is keyed by the ids Draft Sharks
    // priced — and ~48 of those (a $30 rookie among them) are backfill rows
    // that the filter would silently drop off the board. fetchAllRows pages,
    // so reading the full table is safe.
    fetchAllRows<{ id: string; name: string; position: string | null; nfl_team: string | null }>(
      (from, to) =>
        supabase.from("players").select("id, name, position, nfl_team").order("id").range(from, to),
    ),
  ]);

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const pool: MarketPlayer[] = [];
  for (const v of values) {
    const mv = v.market_auction_value ?? 0;
    const p = playerMap.get(v.player_id);
    if (!p || mv <= 0 || !isPos(p.position)) continue;
    pool.push({ id: p.id, name: p.name, pos: p.position, mv, nflTeam: p.nfl_team });
  }
  pool.sort((a, b) => b.mv - a.mv);

  return { pool, season };
}
