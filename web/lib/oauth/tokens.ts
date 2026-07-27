/**
 * OAuth token issuance and verification.
 *
 * Access tokens are stateless: an HMAC-signed JSON payload verified without a
 * database round-trip, so MCP tool calls stay fast. They are short-lived
 * (ACCESS_TOKEN_TTL_SECONDS), which bounds how long a revoked grant keeps
 * working — revocation itself happens on the DB-backed refresh token.
 *
 * Refresh tokens and authorization codes are opaque random strings; only their
 * SHA-256 hashes are stored (see codes.ts), so a database leak does not yield
 * usable credentials.
 */

import { signPayload, verifyPayload, randomToken } from "./crypto";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  CONSENT_REQUEST_TTL_SECONDS,
  TOKEN_TYPE_ACCESS,
  TOKEN_TYPE_CONSENT,
} from "./constants";

export interface AccessTokenClaims {
  userId: string;
  clientId: string;
  scope: string;
}

/** Parameters of a validated /authorize request, carried through the consent screen. */
export interface ConsentRequestClaims {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  state: string | null;
  /** Session the consent screen was rendered for — the CSRF binding. */
  userId: string;
  resource: string | null;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isExpired(payload: Record<string, unknown>): boolean {
  const exp = payload.exp;
  return typeof exp !== "number" || exp <= nowSeconds();
}

// ─── Access tokens ───────────────────────────────────────────────────────────

export async function issueAccessToken(claims: AccessTokenClaims): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const iat = nowSeconds();
  const accessToken = await signPayload({
    typ: TOKEN_TYPE_ACCESS,
    sub: claims.userId,
    cid: claims.clientId,
    scope: claims.scope,
    iat,
    exp: iat + ACCESS_TOKEN_TTL_SECONDS,
  });
  return { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

/**
 * Verify an access token. Returns its claims, or null if the token is
 * malformed, wrongly signed, of the wrong type, or expired.
 */
export async function verifyAccessToken(
  token: string | undefined | null,
): Promise<AccessTokenClaims | null> {
  const payload = await verifyPayload(token);
  if (!payload) return null;
  if (payload.typ !== TOKEN_TYPE_ACCESS) return null;
  if (isExpired(payload)) return null;

  const userId = readString(payload, "sub");
  const clientId = readString(payload, "cid");
  const scope = readString(payload, "scope");
  if (!userId || !clientId || !scope) return null;

  return { userId, clientId, scope };
}

// ─── Consent request tokens (CSRF + parameter integrity) ─────────────────────

/**
 * Sign the validated /authorize parameters into a hidden form field, so the
 * consent POST cannot forge or tamper with them — and cannot be replayed from
 * a different session, since the logged-in user id is part of the payload.
 */
export async function issueConsentRequestToken(claims: ConsentRequestClaims): Promise<string> {
  const iat = nowSeconds();
  return signPayload({
    typ: TOKEN_TYPE_CONSENT,
    cid: claims.clientId,
    redirect_uri: claims.redirectUri,
    code_challenge: claims.codeChallenge,
    scope: claims.scope,
    state: claims.state,
    sub: claims.userId,
    resource: claims.resource,
    iat,
    exp: iat + CONSENT_REQUEST_TTL_SECONDS,
  });
}

export async function verifyConsentRequestToken(
  token: string | undefined | null,
): Promise<ConsentRequestClaims | null> {
  const payload = await verifyPayload(token);
  if (!payload) return null;
  if (payload.typ !== TOKEN_TYPE_CONSENT) return null;
  if (isExpired(payload)) return null;

  const clientId = readString(payload, "cid");
  const redirectUri = readString(payload, "redirect_uri");
  const codeChallenge = readString(payload, "code_challenge");
  const scope = readString(payload, "scope");
  const userId = readString(payload, "sub");
  if (!clientId || !redirectUri || !codeChallenge || !scope || !userId) return null;

  return {
    clientId,
    redirectUri,
    codeChallenge,
    scope,
    state: readString(payload, "state"),
    userId,
    resource: readString(payload, "resource"),
  };
}

// ─── Opaque credentials ──────────────────────────────────────────────────────

/** Authorization codes and refresh tokens are opaque; only hashes are stored. */
export function generateOpaqueToken(): string {
  return randomToken(32);
}
