/**
 * Server-only fetchers for the `depth_charts` table that powers the
 * /depth-charts review page. Opening-day NFL depth tiers (1 = starter,
 * 2 = backup, 3 = deep reserve) are sourced from nflverse by the
 * `scripts/backfill_depth_charts.py` job and feed the
 * `depth_chart_position_raw` / `role_change_raw` projection features.
 */

import { supabase, fetchAllRows } from "./supabase";

export interface DepthChartEntry {
  player_id: string;
  name: string;
  team: string;
  position: string;
  depth_team: number;
  /** Most recent prior-season depth tier, if any (for role-change display). */
  prev_depth_team: number | null;
  /** Active-model projected PPG for this season, if available. */
  projected_ppg: number | null;
}

export async function fetchAvailableDepthChartSeasons(): Promise<number[]> {
  // depth_charts has thousands of rows (every skill player × season), so a
  // plain select hits Supabase's 1000-row cap and silently drops older
  // seasons. Page through to collect the full distinct set.
  const seasons = new Set<number>();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("depth_charts")
      .select("season")
      .order("season", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error("fetchAvailableDepthChartSeasons error", error);
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) seasons.add(row.season);
    if (data.length < pageSize) break;
  }
  return Array.from(seasons).sort((a, b) => b - a);
}

type DepthRow = {
  player_id: string;
  team: string | null;
  position: string | null;
  depth_team: number;
  players: { name: string } | { name: string }[] | null;
};

function playerName(players: DepthRow["players"]): string {
  if (!players) return "Unknown";
  if (Array.isArray(players)) return players[0]?.name ?? "Unknown";
  return players.name ?? "Unknown";
}

export async function fetchDepthChartsForSeason(
  season: number,
): Promise<DepthChartEntry[]> {
  let rows: DepthRow[];
  let prevByPlayer: Map<string, number>;
  let ppgByPlayer: Map<string, number>;
  try {
    // Paginate depth_charts — a single season can approach/exceed the
    // 1000-row cap (every skill player on every team).
    [rows, prevByPlayer, ppgByPlayer] = await Promise.all([
      fetchAllRows<DepthRow>((from, to) =>
        supabase
          .from("depth_charts")
          .select("player_id, team, position, depth_team, players(name)")
          .eq("season", season)
          .order("player_id").range(from, to),
      ),
      fetchPriorDepthByPlayer(season - 1),
      fetchProjectedPpgByPlayer(season),
    ]);
  } catch (error) {
    console.error(`fetchDepthChartsForSeason(${season}) error`, error);
    return [];
  }

  return rows.map((r) => {
    const row = r as DepthRow;
    return {
      player_id: row.player_id,
      name: playerName(row.players),
      team: row.team ?? "FA",
      position: row.position ?? "",
      depth_team: row.depth_team,
      prev_depth_team: prevByPlayer.get(row.player_id) ?? null,
      projected_ppg: ppgByPlayer.get(row.player_id) ?? null,
    };
  });
}

async function fetchPriorDepthByPlayer(
  season: number,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let data: { player_id: string; depth_team: number }[];
  try {
    // Paginate depth_charts — a single season can approach/exceed the 1000-row cap.
    data = await fetchAllRows((from, to) =>
      supabase
        .from("depth_charts")
        .select("player_id, depth_team")
        .eq("season", season)
        .order("player_id").range(from, to),
    );
  } catch (error) {
    console.error(`fetchPriorDepthByPlayer(${season}) error`, error);
    return map;
  }
  for (const row of data) map.set(row.player_id, row.depth_team);
  return map;
}

async function fetchProjectedPpgByPlayer(
  season: number,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const { data, error } = await supabase
    .from("player_projections")
    .select("player_id, projected_ppg")
    .eq("season", season);
  if (error) {
    console.error(`fetchProjectedPpgByPlayer(${season}) error`, error);
    return map;
  }
  for (const row of data ?? []) {
    if (row.projected_ppg !== null) map.set(row.player_id, row.projected_ppg);
  }
  return map;
}
