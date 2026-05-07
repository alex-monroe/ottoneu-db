/**
 * Server-only fetchers for the `team_vegas_lines` table that powers the
 * preseason Vegas lines review page. Implied totals + Pythagorean win
 * totals are sourced from nflverse `games.csv` by the
 * `scripts/backfill_vegas_lines.py` job.
 */

import { supabase } from "./supabase";

export interface TeamVegasLine {
  team: string;
  season: number;
  implied_total: number;
  win_total: number | null;
}

export async function fetchAvailableSeasons(): Promise<number[]> {
  const { data, error } = await supabase
    .from("team_vegas_lines")
    .select("season")
    .order("season", { ascending: false });

  if (error) {
    console.error("fetchAvailableSeasons error", error);
    return [];
  }
  const seasons = new Set<number>();
  for (const row of data ?? []) seasons.add(row.season);
  return Array.from(seasons).sort((a, b) => b - a);
}

export async function fetchVegasLinesForSeason(
  season: number,
): Promise<TeamVegasLine[]> {
  const { data, error } = await supabase
    .from("team_vegas_lines")
    .select("team, season, implied_total, win_total")
    .eq("season", season)
    .order("team", { ascending: true });

  if (error) {
    console.error(`fetchVegasLinesForSeason(${season}) error`, error);
    return [];
  }
  return data ?? [];
}
