/**
 * The `users.team_name` binding, without the session machinery.
 *
 * Deliberately separate from `viewer-team.ts`: resolving *the current viewer*
 * needs the cookie session (`lib/auth` → `lib/session`), but resolving *a given
 * account's* team needs only the database. The MCP layer authenticates with a
 * bearer token and has a user id in hand, so importing the cookie path there
 * would drag Web Crypto into a module that has no use for it.
 */

import { getSupabaseAdmin, supabase } from "./supabase";
import { MY_TEAM } from "./config";

/**
 * The Ottoneu team bound to an account, or null when unbound.
 *
 * Admin accounts predate per-user teams, so an unbound admin falls back to the
 * operator's team. An ordinary unbound account resolves to null — showing
 * someone else's roster as "yours" is the bug this whole module replaces.
 */
export async function getTeamForUser(userId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("users")
    .select("team_name, is_admin")
    .eq("id", userId)
    .single();
  if (data?.team_name) return data.team_name;
  return data?.is_admin ? MY_TEAM : null;
}

/**
 * Every team name currently holding a roster, for the admin's team picker.
 * Teams are scraped rows keyed by name rather than a table of their own, so
 * the live roster list is the only authoritative source.
 */
export async function fetchLeagueTeams(): Promise<string[]> {
  const { data } = await supabase.from("league_prices").select("team_name");
  const names = new Set<string>();
  for (const row of data ?? []) {
    const name = row.team_name?.trim();
    if (name && name !== "FA") names.add(name);
  }
  return [...names].sort();
}
