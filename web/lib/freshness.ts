/**
 * When each dataset was last refreshed.
 *
 * Nothing on the site said how old its numbers were: a roster scraped an hour
 * ago and one stuck three weeks behind a Cloudflare block looked identical.
 * Every table this app owns carries a timestamp, so the answer was always
 * available — it just was not on screen.
 */

import { cache } from "react";
import { supabase } from "./supabase";
import type { Database } from "../types/supabase";

export type DataSource =
  | "rosters"
  | "transactions"
  | "projections"
  | "matchups"
  | "weekly";

/**
 * Table + column holding each dataset's freshness stamp. `table` is typed
 * against the generated schema so a renamed table fails the build here rather
 * than silently returning null at runtime.
 */
type TableName = keyof Database["public"]["Tables"];

const SOURCES: Record<DataSource, { table: TableName; column: string; label: string }> = {
  rosters: { table: "league_prices", column: "updated_at", label: "Rosters" },
  transactions: { table: "transactions", column: "scraped_at", label: "Transactions" },
  projections: { table: "player_projections", column: "updated_at", label: "Projections" },
  matchups: { table: "league_matchups", column: "scraped_at", label: "Matchups" },
  weekly: { table: "weekly_projections", column: "projected_at", label: "Weekly projections" },
};

export function sourceLabel(source: DataSource): string {
  return SOURCES[source].label;
}

/**
 * Newest timestamp for a dataset, or null when the table is empty.
 * React-cached so several stamps on one page share a query per source.
 */
export const fetchFreshness = cache(
  async (source: DataSource): Promise<string | null> => {
    const { table, column } = SOURCES[source];
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .order(column, { ascending: false, nullsFirst: false })
      .limit(1) // pagination-safe: single newest row
      .maybeSingle();

    if (error || !data) return null;
    // The column is chosen at runtime from SOURCES, so the generated row type
    // cannot narrow it; go through unknown rather than assert a shape.
    const value = (data as unknown as Record<string, unknown>)[column];
    return value ? String(value) : null;
  },
);

/** "3 hours ago", "yesterday", "12 Aug" — short enough for a caption. */
export function describeAge(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Past this, the data is old enough that a reader should be told loudly. */
export function isStale(iso: string, maxAgeHours: number, now: Date = new Date()): boolean {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return true;
  return now.getTime() - then > maxAgeHours * 3_600_000;
}
