const enc = new TextEncoder();

async function getSessionKey() {
  const secret = process.env.ACCESS_PASSWORD || "fallback_development_secret_only";

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

/**
 * Signs a session value using HMAC-SHA256
 */
export async function signSession(value: string): Promise<string> {
  const key = await getSessionKey();
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  const signature = bufferToBase64Url(signatureBuffer);

  return `${value}.${signature}`;
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

  const [value, signatureBase64Url] = parts;

  // We expect the value to be exactly "authenticated" based on current usage
  if (value !== "authenticated") {
    return false;
  }

  try {
    const key = await getSessionKey();
    const signatureBuffer = base64UrlToBuffer(signatureBase64Url);

    // verify the signature
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBuffer,
      enc.encode(value)
    );

    return isValid;
  } catch (err) {
    console.error("Session verification error:", err);
    return false;
  }
}
