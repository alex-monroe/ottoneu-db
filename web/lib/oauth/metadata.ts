/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * Clients discover this at /.well-known/oauth-authorization-server after the
 * protected-resource document points them here. The MCP resource metadata
 * (RFC 9728) is served by mcp-handler's `protectedResourceHandler`.
 */

import { OAUTH_SCOPE } from "./constants";
import { SUPPORTED_CODE_CHALLENGE_METHODS } from "./pkce";

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  service_documentation?: string;
}

/**
 * Build the metadata document for a given public origin (e.g.
 * "https://example.vercel.app"). The origin must be the externally visible
 * one — derive it with mcp-handler's `getPublicOrigin` so it stays correct
 * behind Vercel's proxy.
 */
export function buildAuthorizationServerMetadata(origin: string): AuthorizationServerMetadata {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: [OAUTH_SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: [...SUPPORTED_CODE_CHALLENGE_METHODS],
    // Public clients authenticate with PKCE alone ("none"); confidential
    // clients may present the secret in the body or via Basic auth.
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
  };
}

/** JSON response headers for discovery documents — public and CORS-readable. */
export const METADATA_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
};
