/**
 * Bearer-key verification for the remote MCP endpoint.
 *
 * A single shared key (env: MCP_API_KEY) grants read-only access to the
 * league data tools. Revocation = rotate the env var and redeploy.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

/**
 * Constant-time key comparison. Hashing both sides first makes the buffers
 * equal-length, so timingSafeEqual never throws and the comparison leaks
 * nothing about the expected key's length or content.
 *
 * Fails closed: a missing/empty candidate OR expected key is always invalid,
 * so an unset MCP_API_KEY can never produce an open server.
 */
export function isValidKey(candidate: string | undefined, expected: string | undefined): boolean {
  if (!candidate || !expected) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** `verifyToken` callback for mcp-handler's `withMcpAuth`. */
export function verifyBearer(_req: Request, bearerToken?: string): AuthInfo | undefined {
  if (!isValidKey(bearerToken, process.env.MCP_API_KEY)) return undefined;
  return {
    token: bearerToken as string,
    clientId: "league-shared-key",
    scopes: ["read"],
  };
}
