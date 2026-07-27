/**
 * Authorization codes and refresh tokens.
 *
 * Both are opaque random strings stored only as SHA-256 hashes. Both are
 * consumed with a conditional UPDATE (`... WHERE hash = ? AND consumed IS NULL`)
 * so that a replayed code or a reused refresh token loses the race and is
 * rejected — Postgres row locking makes the check-and-mark atomic, which a
 * read-then-write pair would not be.
 */

import { getSupabaseAdmin } from "../supabase";
import { sha256Hex } from "./crypto";
import { generateOpaqueToken } from "./tokens";
import { AUTHORIZATION_CODE_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "./constants";

export interface AuthorizationCodeGrant {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}

export interface RefreshTokenGrant {
  clientId: string;
  userId: string;
  scope: string;
}

// ─── Authorization codes ─────────────────────────────────────────────────────

/** Issue a single-use authorization code, returning the plaintext value. */
export async function createAuthorizationCode(grant: AuthorizationCodeGrant): Promise<string> {
  const code = generateOpaqueToken();
  const { error } = await getSupabaseAdmin()
    .from("oauth_authorization_codes")
    .insert({
      code_hash: await sha256Hex(code),
      client_id: grant.clientId,
      user_id: grant.userId,
      redirect_uri: grant.redirectUri,
      code_challenge: grant.codeChallenge,
      scope: grant.scope,
      expires_at: new Date(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000).toISOString(),
    });

  if (error) throw new Error(`Failed to create authorization code: ${error.message}`);
  return code;
}

/**
 * Atomically consume an authorization code. Returns the grant, or null if the
 * code is unknown, already used, or expired.
 */
export async function consumeAuthorizationCode(
  code: string | null | undefined,
): Promise<AuthorizationCodeGrant | null> {
  if (!code) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("oauth_authorization_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("code_hash", await sha256Hex(code))
    .is("consumed_at", null)
    .select("client_id, user_id, redirect_uri, code_challenge, scope, expires_at")
    .maybeSingle();

  // No row means the code was unknown or already consumed (replay).
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  return {
    clientId: data.client_id,
    userId: data.user_id,
    redirectUri: data.redirect_uri,
    codeChallenge: data.code_challenge,
    scope: data.scope,
  };
}

// ─── Refresh tokens ──────────────────────────────────────────────────────────

/** Issue a refresh token, returning the plaintext value. */
export async function createRefreshToken(grant: RefreshTokenGrant): Promise<string> {
  const token = generateOpaqueToken();
  const { error } = await getSupabaseAdmin()
    .from("oauth_refresh_tokens")
    .insert({
      token_hash: await sha256Hex(token),
      client_id: grant.clientId,
      user_id: grant.userId,
      scope: grant.scope,
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
    });

  if (error) throw new Error(`Failed to create refresh token: ${error.message}`);
  return token;
}

/**
 * Atomically consume a refresh token (OAuth 2.1 mandates rotation, so every
 * use burns the token and the caller issues a fresh one). Returns null if the
 * token is unknown, already used, revoked, or expired.
 */
export async function consumeRefreshToken(
  token: string | null | undefined,
): Promise<RefreshTokenGrant | null> {
  if (!token) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("oauth_refresh_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", await sha256Hex(token))
    .is("revoked_at", null)
    .select("client_id, user_id, scope, expires_at")
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  return { clientId: data.client_id, userId: data.user_id, scope: data.scope };
}

/** Revoke every outstanding refresh token for a user (used to cut off access). */
export async function revokeRefreshTokensForUser(userId: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("oauth_refresh_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("token_hash");

  if (error) throw new Error(`Failed to revoke refresh tokens: ${error.message}`);
  return data?.length ?? 0;
}
