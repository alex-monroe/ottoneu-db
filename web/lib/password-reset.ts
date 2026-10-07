/**
 * Admin-issued password reset links.
 *
 * There is no mail infrastructure in this app, so a reset link is handed over
 * by an admin rather than emailed: the admin issues it from /admin and sends
 * the URL themselves. See migrations/047_create_password_reset.sql for the
 * whole flow.
 *
 * Tokens are opaque random strings stored only as SHA-256 hashes, and are
 * consumed with a conditional UPDATE (`... WHERE hash = ? AND consumed_at IS
 * NULL`) so a replayed link loses the race in the database — the same shape as
 * lib/oauth/codes.ts.
 */

import { getSupabaseAdmin } from "./supabase";
import { randomToken, sha256Hex } from "./oauth/crypto";

/**
 * How long a reset link stays usable. Long enough to survive being sent by
 * text and opened the next morning; short enough that a link sitting in an old
 * message thread is dead.
 */
export const RESET_TOKEN_TTL_SECONDS = 24 * 60 * 60;

/** Path of the page a reset link opens. */
export const RESET_PASSWORD_PATH = "/reset-password";

/** The path + query an admin hands over; the panel prefixes the site origin. */
export function resetPath(token: string): string {
  return `${RESET_PASSWORD_PATH}?token=${encodeURIComponent(token)}`;
}

/**
 * Issue a reset token for `userId`, returning the plaintext value.
 *
 * Any earlier unused token for the account is burned first, so only the most
 * recently issued link works — an admin who re-issues because the first
 * message went to the wrong person has actually revoked it.
 */
export async function createResetToken(userId: string, createdBy: string): Promise<string> {
  const db = getSupabaseAdmin();

  const { error: burnError } = await db
    .from("password_reset_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("consumed_at", null);
  if (burnError) throw new Error(`Failed to revoke earlier reset links: ${burnError.message}`);

  const token = randomToken();
  const { error } = await db.from("password_reset_tokens").insert({
    token_hash: await sha256Hex(token),
    user_id: userId,
    created_by: createdBy,
    expires_at: new Date(Date.now() + RESET_TOKEN_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error(`Failed to create reset link: ${error.message}`);

  return token;
}

/**
 * Look up a token without consuming it, for rendering the reset page.
 * Returns the account's email, or null if the link is unknown, used or expired.
 */
export async function peekResetToken(
  token: string | null | undefined,
): Promise<{ email: string } | null> {
  if (!token) return null;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("password_reset_tokens")
    .select("user_id, expires_at, consumed_at")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();

  if (error || !data || data.consumed_at) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  const { data: user } = await db
    .from("users")
    .select("email")
    .eq("id", data.user_id)
    .maybeSingle();
  return user?.email ? { email: user.email } : null;
}

/**
 * Atomically consume a token. Returns the account's id, or null if the link is
 * unknown, already used, or expired.
 */
export async function consumeResetToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("password_reset_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token_hash", await sha256Hex(token))
    .is("consumed_at", null)
    .select("user_id, expires_at")
    .maybeSingle();

  // No row means the link was unknown, already used, or superseded.
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  return data.user_id;
}
