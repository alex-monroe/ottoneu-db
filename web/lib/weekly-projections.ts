/**
 * Server-only fetchers for the `weekly_projections` table.
 *
 * These are a THIRD PARTY's per-game forecasts, ingested by
 * scripts/weekly_projections/ingest.py — not this site's own model. Keep them
 * distinct from lib/data.ts's fetchPlayerProjection, which returns the seasonal
 * `projected_ppg` from our market-free feature model:
 *
 *   projected_ppg     our model, points PER GAME averaged over a season
 *   projected_points  a third party, points in ONE specific game
 *
 * The differently-named value columns are deliberate — they are what stops the
 * two from being confused in code, in the MCP payload, or by a reader.
 */

import { supabase, fetchAllRows } from "./supabase";

/** A stat line, keyed by the names in SCORING_SETTINGS. */
export type WeeklyStatLine = Record<string, number>;

export interface WeeklyProjection {
  player_id: string;
  season: number;
  week: number;
  source: string;
  opponent: string | null;
  projected_points: number | null;
  projected_stats: WeeklyStatLine | null;
  /** Null until the games are played and the actuals pass has run. */
  actual_points: number | null;
  actual_stats: WeeklyStatLine | null;
  projected_at: string;
}

/** A weekly row joined to the player it belongs to, for board/MCP rendering. */
export interface WeeklyProjectionWithPlayer extends WeeklyProjection {
  name: string;
  position: string | null;
  nfl_team: string | null;
}

const COLUMNS =
  "player_id, season, week, source, opponent, projected_points, projected_stats, actual_points, actual_stats, projected_at";

function asStatLine(value: unknown): WeeklyStatLine | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as WeeklyStatLine;
}

function shape(row: Record<string, unknown>): WeeklyProjection {
  return {
    player_id: String(row.player_id),
    season: Number(row.season),
    week: Number(row.week),
    source: String(row.source),
    opponent: (row.opponent as string) ?? null,
    projected_points: row.projected_points == null ? null : Number(row.projected_points),
    projected_stats: asStatLine(row.projected_stats),
    actual_points: row.actual_points == null ? null : Number(row.actual_points),
    actual_stats: asStatLine(row.actual_stats),
    projected_at: String(row.projected_at),
  };
}

/**
 * One player's rows for the given weeks — normally the upcoming and previous
 * week, so the card can show what is coming next beside how the last one went.
 * Returns a week-keyed map; a missing week means no projection (bye or inactive).
 */
export async function fetchPlayerWeeklyProjections(
  playerId: string,
  season: number,
  weeks: number[],
): Promise<Map<number, WeeklyProjection>> {
  const wanted = weeks.filter((w): w is number => Number.isInteger(w));
  if (wanted.length === 0) return new Map();

  const { data, error } = await supabase
    .from("weekly_projections")
    .select(COLUMNS)
    .eq("player_id", playerId)
    .eq("season", season)
    .in("week", wanted)
    .limit(10); // pagination-safe: at most a handful of weeks for one player

  if (error) {
    console.error(`fetchPlayerWeeklyProjections(${playerId}) error`, error);
    return new Map();
  }

  const out = new Map<number, WeeklyProjection>();
  for (const row of data ?? []) out.set(Number(row.week), shape(row));
  return out;
}

/**
 * Every projection for one week, joined to player identity.
 *
 * Paginated: a full slate across all positions is only a few hundred rows today,
 * but the anon client caps an unpaginated read at 1000 and this table grows with
 * roster churn.
 */
export async function fetchWeeklyBoard(
  season: number,
  week: number,
): Promise<WeeklyProjectionWithPlayer[]> {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
    supabase
      .from("weekly_projections")
      .select(`${COLUMNS}, players!inner(name, position, nfl_team)`)
      .eq("season", season)
      .eq("week", week)
      .order("projected_points", { ascending: false, nullsFirst: false })
      .range(from, to),
  );

  return rows.map((row) => {
    const player = (row.players ?? {}) as Record<string, unknown>;
    return {
      ...shape(row),
      name: String(player.name ?? ""),
      position: (player.position as string) ?? null,
      nfl_team: (player.nfl_team as string) ?? null,
    };
  });
}

/**
 * The freshest `projected_at` for a week — the "as of" stamp the UI and the MCP
 * payload show, so a reader can tell how stale a mid-week projection is.
 */
export async function fetchWeeklyAsOf(
  season: number,
  week: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("weekly_projections")
    .select("projected_at")
    .eq("season", season)
    .eq("week", week)
    .order("projected_at", { ascending: false })
    .limit(1) // pagination-safe: single newest row
    .maybeSingle();

  if (error || !data) return null;
  return String(data.projected_at);
}

/** Which weeks actually have data for a season, newest first. */
export async function fetchAvailableWeeks(season: number): Promise<number[]> {
  const rows = await fetchAllRows<{ week: number }>((from, to) =>
    supabase
      .from("weekly_projections")
      .select("week")
      .eq("season", season)
      .order("week", { ascending: false })
      .range(from, to),
  );
  return Array.from(new Set(rows.map((r) => Number(r.week)))).sort((a, b) => b - a);
}
