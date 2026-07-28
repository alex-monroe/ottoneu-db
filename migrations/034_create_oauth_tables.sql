-- OAuth 2.1 authorization server tables for the remote MCP endpoint.
--
-- The MCP server (/api/mcp/mcp) accepts either the shared MCP_API_KEY or an
-- OAuth access token. OAuth is required by clients that refuse static bearer
-- keys (e.g. Gemini Spark). These tables back the authorization-server half:
-- registered clients (via RFC 7591 dynamic client registration), single-use
-- authorization codes, and revocable refresh tokens.
--
-- Access tokens are NOT stored — they are stateless HMAC-signed values
-- (see web/lib/oauth/tokens.ts) with a short TTL, so the MCP hot path needs
-- no database round-trip. Revocation happens at the refresh-token layer.
--
-- All three tables hold credentials/grants, so they follow the `users` table
-- pattern from migration 015: RLS enabled with NO anon policies. Server-side
-- code reaches them exclusively via the Supabase service key
-- (getSupabaseAdmin() in web/lib/supabase.ts).

-- ============================================================
-- 1. Registered OAuth clients
-- ============================================================

CREATE TABLE oauth_clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id text UNIQUE NOT NULL,
  -- NULL for public clients (token_endpoint_auth_method = "none"), which
  -- authenticate with PKCE alone. Confidential clients store a SHA-256 hash.
  client_secret_hash text,
  client_name text NOT NULL,
  redirect_uris text[] NOT NULL,
  grant_types text[] NOT NULL DEFAULT ARRAY['authorization_code', 'refresh_token'],
  scope text NOT NULL DEFAULT 'league:read',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_oauth_clients_client_id ON oauth_clients(client_id);

-- ============================================================
-- 2. Authorization codes (single-use, short-lived)
-- ============================================================

CREATE TABLE oauth_authorization_codes (
  -- SHA-256 of the code; the plaintext code only ever exists in the redirect.
  code_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  -- PKCE S256 challenge; `plain` is not supported.
  code_challenge text NOT NULL,
  scope text NOT NULL,
  expires_at timestamptz NOT NULL,
  -- Set on first exchange. A code with consumed_at IS NOT NULL is replayed
  -- and must be rejected (enforced by a conditional UPDATE in codes.ts).
  consumed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_oauth_codes_expires_at ON oauth_authorization_codes(expires_at);

-- ============================================================
-- 3. Refresh tokens (long-lived, revocable)
-- ============================================================

CREATE TABLE oauth_refresh_tokens (
  token_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_oauth_refresh_tokens_user_id ON oauth_refresh_tokens(user_id);

-- ============================================================
-- 4. RLS: enabled, no anon policies (server-key access only)
-- ============================================================

ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;
