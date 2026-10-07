/**
 * Team icons — reads and writes against `team_icons` (migration 048).
 *
 * Server-only: the table has no anon policy, so everything goes through the
 * service-key client. The pure helpers (URL shape, validation) are in
 * `team-icons.ts`.
 */

import { cache } from "react";
import { getSupabaseAdmin } from "./supabase";
import { LEAGUE_ID } from "./config";
import { teamIconKey, type TeamIconType } from "./team-icons";
import type { TeamIconVersions } from "./types";

/**
 * Which teams have an icon, and its version — the map the root layout hands
 * to every page. Twelve tiny rows; the image bytes are not selected.
 */
export const fetchTeamIconVersions = cache(async (): Promise<TeamIconVersions> => {
  const { data, error } = await getSupabaseAdmin()
    .from("team_icons")
    .select("team_name, updated_at")
    .eq("league_id", LEAGUE_ID);
  if (error) throw new Error(`team_icons read failed: ${error.message}`);

  const out: TeamIconVersions = {};
  for (const row of data ?? []) {
    out[teamIconKey(row.team_name)] = new Date(row.updated_at).getTime();
  }
  return out;
});

/** One team's icon bytes, matched case-insensitively. Null when it has none. */
export async function fetchTeamIcon(
  teamName: string,
): Promise<{ contentType: string; bytes: Uint8Array } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("team_icons")
    .select("team_name, content_type, image_data")
    .eq("league_id", LEAGUE_ID)
    .ilike("team_name", escapeLike(teamName.trim()))
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`team_icons read failed: ${error.message}`);
  if (!data) return null;
  return {
    contentType: data.content_type,
    bytes: Uint8Array.from(Buffer.from(data.image_data, "base64")),
  };
}

/** Set (or replace) a team's icon. */
export async function saveTeamIcon(
  teamName: string,
  icon: { contentType: TeamIconType; base64: string },
  userId: string,
): Promise<void> {
  // Remove any differently-cased row first, so a team never holds two.
  await deleteTeamIcon(teamName);
  const { error } = await getSupabaseAdmin().from("team_icons").insert({
    league_id: LEAGUE_ID,
    team_name: teamName.trim(),
    content_type: icon.contentType,
    image_data: icon.base64,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`team_icons write failed: ${error.message}`);
}

/** Remove a team's icon. A team without one is a no-op. */
export async function deleteTeamIcon(teamName: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("team_icons")
    .delete()
    .eq("league_id", LEAGUE_ID)
    .ilike("team_name", escapeLike(teamName.trim()));
  if (error) throw new Error(`team_icons delete failed: ${error.message}`);
}

/** `ilike` treats `%` and `_` as wildcards; a team name should match literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
