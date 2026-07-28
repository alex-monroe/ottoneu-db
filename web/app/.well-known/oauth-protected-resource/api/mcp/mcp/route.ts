/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) — path-scoped variant.
 *
 * RFC 9728 locates the metadata for a resource at https://host/path under
 * /.well-known/oauth-protected-resource/<path>, which for the MCP endpoint
 * (/api/mcp/mcp) is this route. It is the URL advertised in the
 * `WWW-Authenticate: Bearer resource_metadata="..."` header of our 401s.
 */

export { GET, OPTIONS } from "../../../route";
