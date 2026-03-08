const enc = new TextEncoder();

async function getSessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable required");
  }

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
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBuffer(base64Url: string): ArrayBuffer {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const originalLength = base64.length;
  while (base64.length % 4 && base64.length < originalLength + 3) {
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
  const originalLength = base64.length;
  while (base64.length % 4 && base64.length < originalLength + 3) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * Signs a session with user info using HMAC-SHA256
 */
export async function signSession(userId: string, isAdmin: boolean, hasProjectionsAccess: boolean): Promise<string> {
  const key = await getSessionKey();

  const payloadStr = `user:${userId}:${isAdmin}:${hasProjectionsAccess}:${Date.now()}:${crypto.randomUUID()}`;
  const payloadBase64Url = stringToBase64Url(payloadStr);

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payloadBase64Url));
  const signature = bufferToBase64Url(signatureBuffer);

  return `${payloadBase64Url}.${signature}`;
}

export interface SessionInfo {
  valid: boolean;
  userId?: string;
  isAdmin?: boolean;
  hasProjectionsAccess?: boolean;
}

/**
 * Verifies a session token. Returns session info if valid.
 */
export async function verifySession(token: string | undefined | null): Promise<SessionInfo> {
  if (!token || typeof token !== "string") {
    return { valid: false };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false };
  }

  const [payloadBase64Url, signatureBase64Url] = parts;

  try {
    const key = await getSessionKey();
    const signatureBuffer = base64UrlToBuffer(signatureBase64Url);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBuffer,
      enc.encode(payloadBase64Url)
    );

    if (!isValid) {
      return { valid: false };
    }

    const payloadStr = base64UrlToString(payloadBase64Url);
    const [status, userId, isAdminStr, hasProjectionsAccessStr, timestampStr, nonce] = payloadStr.split(':');

    if (status !== "user" || !userId || !timestampStr || !nonce) {
      return { valid: false };
    }

    const timestamp = parseInt(timestampStr, 10);
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > MAX_AGE_MS) {
      return { valid: false };
    }

    return {
      valid: true,
      userId,
      isAdmin: isAdminStr === "true",
      hasProjectionsAccess: hasProjectionsAccessStr === "true",
    };
  } catch (err) {
    console.error("Session verification error:", err);
    return { valid: false };
  }
}
