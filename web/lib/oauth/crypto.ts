/**
 * Crypto primitives for the OAuth 2.1 authorization server.
 *
 * Web Crypto only (no `node:crypto`), mirroring web/lib/session.ts, so these
 * stay usable from the Edge runtime as well as Node route handlers. The
 * signing key is derived from SESSION_SECRET the same way session tokens are;
 * payloads carry a `typ` discriminator so a session cookie can never be
 * replayed as an OAuth token and vice versa (see tokens.ts).
 */

const enc = new TextEncoder();

/** HMAC-SHA256 key derived from SESSION_SECRET (same derivation as session.ts). */
async function getSigningKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable required");
  }
  const secretHash = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", secretHash, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Returns an explicitly ArrayBuffer-backed view: `new Uint8Array(n)` widens to
// ArrayBufferLike, which is not assignable to Web Crypto's BufferSource.
function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function stringToBase64Url(str: string): string {
  return bytesToBase64Url(enc.encode(str));
}

export function base64UrlToString(base64Url: string): string {
  return new TextDecoder().decode(base64UrlToBytes(base64Url));
}

/** SHA-256 of a string, hex-encoded. Used to store codes/secrets without the plaintext. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 of a string, base64url-encoded — the PKCE S256 transformation. */
export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

/** Cryptographically random base64url string (default 32 bytes of entropy). */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/**
 * Length-independent, content-constant-time string comparison. Both inputs are
 * hashes/tokens of fixed length in practice; the length check short-circuits
 * only on a mismatched length, which is not secret.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Sign a JSON payload: `base64url(JSON).base64url(HMAC)`.
 *
 * Same two-part shape as session.ts, but the payload is JSON rather than the
 * session's colon-delimited string — so a session token fails to parse here
 * (and an OAuth token fails session.ts's `status !== "user"` check) even
 * though both are signed with the same key.
 */
export async function signPayload(payload: Record<string, unknown>): Promise<string> {
  const key = await getSigningKey();
  const payloadBase64Url = stringToBase64Url(JSON.stringify(payload));
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payloadBase64Url));
  return `${payloadBase64Url}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verify a signed payload and return it, or null if the token is malformed,
 * has a bad signature, or is not valid JSON. Never throws.
 */
export async function verifyPayload(
  token: string | undefined | null,
): Promise<Record<string, unknown> | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadBase64Url, signatureBase64Url] = parts;

  try {
    const key = await getSigningKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signatureBase64Url),
      enc.encode(payloadBase64Url),
    );
    if (!valid) return null;

    const parsed: unknown = JSON.parse(base64UrlToString(payloadBase64Url));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    // Malformed base64, bad JSON, or a missing secret — all mean "not valid".
    return null;
  }
}
