/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) — root document.
 *
 * Tells MCP clients which authorization server issues tokens for this
 * resource. Clients that follow the `resource_metadata` pointer in our 401
 * land on the path-scoped variant under ./api/mcp/mcp; some check this root
 * document instead, so both are served.
 */

import { getPublicOrigin } from "mcp-handler";
import { METADATA_HEADERS } from "@/lib/oauth/metadata";
import { OAUTH_SCOPE, MCP_RESOURCE_PATH } from "@/lib/oauth/constants";

export function GET(request: Request) {
  const origin = getPublicOrigin(request);
  const metadata = {
    resource: `${origin}${MCP_RESOURCE_PATH}`,
    authorization_servers: [origin],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
  };
  return new Response(JSON.stringify(metadata, null, 2), { headers: METADATA_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: METADATA_HEADERS });
}
