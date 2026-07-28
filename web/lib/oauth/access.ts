/**
 * Authorization policy: who may grant an MCP client access to league data.
 *
 * The bar is the same `has_projections_access` flag that gates the projections
 * and value pages on the site. This is read live from the database rather than
 * from the session cookie, because the cookie bakes the flag in at login and
 * never refreshes it (up to 7 days stale) — so revoking a user's access in the
 * admin UI would otherwise not stop them minting new OAuth tokens.
 *
 * Checked both when the consent screen is rendered/approved and on every
 * refresh-token exchange, which bounds a revoked user's remaining access to
 * one access-token lifetime.
 */

import { getSupabaseAdmin } from "../supabase";

export interface UserAccess {
  userId: string;
  email: string;
  hasProjectionsAccess: boolean;
}

/** Look up a user's current access flags. Returns null if the user is gone. */
export async function getUserAccess(userId: string): Promise<UserAccess | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("id, email, has_projections_access")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    userId: data.id,
    email: data.email,
    hasProjectionsAccess: data.has_projections_access,
  };
}

/** True if this user is currently allowed to authorize MCP clients. */
export async function canAuthorizeMcpClients(userId: string): Promise<boolean> {
  const access = await getUserAccess(userId);
  return access?.hasProjectionsAccess === true;
}
