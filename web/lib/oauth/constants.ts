/**
 * OAuth 2.1 authorization-server constants for the MCP endpoint.
 */

/** The only scope this server issues — read-only access to league data. */
export const OAUTH_SCOPE = "league:read";

/** Human-readable description shown on the consent screen. */
export const OAUTH_SCOPE_DESCRIPTION =
  "Read your league's rosters, salaries, transactions, stats, projections, player values, and arbitration data";

/** Access tokens are stateless and short-lived; revocation happens at refresh time. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

/** Refresh tokens are stored (hashed) and revocable. */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/** Authorization codes are single-use and expire quickly (OAuth 2.1 recommends <= 10 min). */
export const AUTHORIZATION_CODE_TTL_SECONDS = 60;

/** How long a rendered consent screen stays submittable. */
export const CONSENT_REQUEST_TTL_SECONDS = 10 * 60;

/** Path of the MCP resource these tokens grant access to. */
export const MCP_RESOURCE_PATH = "/api/mcp/mcp";

/** Payload type discriminators (domain separation against session cookies). */
export const TOKEN_TYPE_ACCESS = "oauth_at";
export const TOKEN_TYPE_CONSENT = "oauth_consent";
