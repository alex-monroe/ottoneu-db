/**
 * PKCE (RFC 7636) verification. OAuth 2.1 requires PKCE on the authorization
 * code flow; this server supports S256 only and rejects `plain`.
 */

import { sha256Base64Url, timingSafeEqualStrings } from "./crypto";

export const SUPPORTED_CODE_CHALLENGE_METHODS = ["S256"] as const;

/** True if the method is one we accept (S256 only — `plain` is rejected). */
export function isSupportedChallengeMethod(method: string | null | undefined): boolean {
  return method === "S256";
}

/**
 * Verify a PKCE code verifier against the stored challenge.
 *
 * The verifier must be 43-128 characters of unreserved charset per RFC 7636;
 * anything outside that is rejected before hashing.
 */
export async function verifyCodeChallenge(
  codeVerifier: string | null | undefined,
  codeChallenge: string | null | undefined,
): Promise<boolean> {
  if (!codeVerifier || !codeChallenge) return false;
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  if (!/^[A-Za-z0-9\-._~]+$/.test(codeVerifier)) return false;

  const derived = await sha256Base64Url(codeVerifier);
  return timingSafeEqualStrings(derived, codeChallenge);
}
