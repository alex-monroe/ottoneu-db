/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * MCP clients fetch this after the protected-resource document points them at
 * this issuer, and use it to find the authorize/token/registration endpoints.
 */

import { getPublicOrigin } from "mcp-handler";
import { buildAuthorizationServerMetadata, METADATA_HEADERS } from "@/lib/oauth/metadata";

export function GET(request: Request) {
  const metadata = buildAuthorizationServerMetadata(getPublicOrigin(request));
  return new Response(JSON.stringify(metadata, null, 2), { headers: METADATA_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: METADATA_HEADERS });
}
