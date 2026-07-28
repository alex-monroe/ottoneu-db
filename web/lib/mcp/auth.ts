/**
 * Bearer authentication for the remote MCP endpoint.
 *
 * Two credentials are accepted:
 *
 *  1. An **OAuth 2.1 access token** issued by this site's authorization server
 *     (see web/lib/oauth/). Required by clients that refuse static keys — e.g.
 *     Gemini Spark. Tokens are per-user and carry the granting user's id.
 *  2. The **shared key** in MCP_API_KEY, for clients where a static header is
 *     simpler (Claude Code, Claude Desktop, the Claude API connector).
 *
 * Both fail closed: an unset MCP_API_KEY never yields an open server, and an
 * unset SESSION_SECRET makes token verification fail rather than pass.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { verifyAccessToken } from "../oauth/tokens";

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

/**
 * `verifyToken` callback for mcp-handler's `withMcpAuth`.
 *
 * OAuth is tried first so a per-user token is preferred when both would match;
 * `extra.userId` lets tools attribute a call to the granting account.
 */
export async function verifyBearer(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const claims = await verifyAccessToken(bearerToken);
  if (claims) {
    return {
      token: bearerToken,
      clientId: claims.clientId,
      scopes: claims.scope.split(" ").filter(Boolean),
      extra: { userId: claims.userId, authMode: "oauth" },
    };
  }

  if (isValidKey(bearerToken, process.env.MCP_API_KEY)) {
    return {
      token: bearerToken,
      clientId: "league-shared-key",
      scopes: ["read"],
      extra: { authMode: "shared_key" },
    };
  }

  return undefined;
}
