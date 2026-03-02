const enc = new TextEncoder();

async function getSessionKey() {
  const secret = process.env.ACCESS_PASSWORD;
  if (!secret) {
    throw new Error("ACCESS_PASSWORD environment variable required");
  }

  // Create a SHA-256 hash of the secret to ensure it's the right length for HMAC
  const secretHash = await crypto.subtle.digest('SHA-256', enc.encode(secret));

  return crypto.subtle.importKey(
    "raw",
    secretHash,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Base64 encode and then make it URL safe
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBuffer(base64Url: string): ArrayBuffer {
  // Pad the string with '=' to make its length a multiple of 4
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function stringToBase64Url(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToString(base64Url: string): string {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * Signs a session value using HMAC-SHA256
 */
export async function signSession(): Promise<string> {
  const key = await getSessionKey();

  // Create a unique payload with timestamp and random nonce
  const payloadStr = `authenticated:${Date.now()}:${crypto.randomUUID()}`;
  const payloadBase64Url = stringToBase64Url(payloadStr);

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payloadBase64Url));
  const signature = bufferToBase64Url(signatureBuffer);

  return `${payloadBase64Url}.${signature}`;
}

/**
 * Verifies a session token. Returns true if valid, false otherwise.
 */
export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!token || typeof token !== "string") {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [payloadBase64Url, signatureBase64Url] = parts;

  try {
    const key = await getSessionKey();
    const signatureBuffer = base64UrlToBuffer(signatureBase64Url);

    // verify the signature against the payload
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBuffer,
      enc.encode(payloadBase64Url)
    );

    if (!isValid) {
      return false;
    }

    // Decode and validate payload
    const payloadStr = base64UrlToString(payloadBase64Url);
    const [status, timestampStr, nonce] = payloadStr.split(':');

    if (status !== "authenticated" || !timestampStr || !nonce) {
      return false;
    }

    const timestamp = parseInt(timestampStr, 10);
    // Enforce an absolute maximum age of 7 days (604800000 ms) to match the cookie expiry
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > MAX_AGE_MS) {
      return false; // Token expired
    }

    return true;
  } catch (err) {
    console.error("Session verification error:", err);
    return false;
  }
}
