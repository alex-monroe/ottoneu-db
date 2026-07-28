/**
 * OAuth client registry — RFC 7591 dynamic client registration plus lookup
 * and client authentication.
 *
 * Gemini Spark self-registers through DCR; clients that can't (or when DCR
 * misbehaves) are created manually with `just oauth-client`, which writes the
 * same row. Client secrets are stored as SHA-256 hashes — the plaintext is
 * returned exactly once, at registration.
 */

import { getSupabaseAdmin } from "../supabase";
import { randomToken, sha256Hex, timingSafeEqualStrings } from "./crypto";
import { OAUTH_SCOPE } from "./constants";

export interface OAuthClient {
  clientId: string;
  clientName: string;
  clientSecretHash: string | null;
  redirectUris: string[];
  grantTypes: string[];
  scope: string;
}

export interface ClientRegistration {
  clientName: string;
  redirectUris: string[];
  /** "none" registers a public (PKCE-only) client with no secret. */
  tokenEndpointAuthMethod: string;
  grantTypes: string[];
}

export type RegistrationError = { error: string; description: string };

/**
 * A redirect URI must be absolute, fragment-free, and https — except on
 * loopback, where http is allowed so local clients and the MCP inspector work.
 */
export function isValidRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.hash) return false;
  if (parsed.protocol === "https:") return true;
  return (
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1")
  );
}

/** Redirect URIs are matched exactly against what the client registered. */
export function redirectUriAllowed(client: OAuthClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}

/**
 * Validate an RFC 7591 registration request body. Returns the normalized
 * registration or a structured OAuth error.
 */
export function parseRegistrationRequest(body: unknown): ClientRegistration | RegistrationError {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid_client_metadata", description: "Request body must be a JSON object." };
  }
  const raw = body as Record<string, unknown>;

  const redirectUris = raw.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return {
      error: "invalid_redirect_uri",
      description: "redirect_uris is required and must be a non-empty array.",
    };
  }
  if (!redirectUris.every((u): u is string => typeof u === "string" && isValidRedirectUri(u))) {
    return {
      error: "invalid_redirect_uri",
      description: "Every redirect_uri must be an absolute https URI without a fragment (http allowed only on loopback).",
    };
  }

  const grantTypesRaw = raw.grant_types;
  const grantTypes =
    Array.isArray(grantTypesRaw) && grantTypesRaw.length > 0
      ? grantTypesRaw.filter((g): g is string => typeof g === "string")
      : ["authorization_code", "refresh_token"];
  const unsupported = grantTypes.filter(
    (g) => g !== "authorization_code" && g !== "refresh_token",
  );
  if (unsupported.length > 0) {
    return {
      error: "invalid_client_metadata",
      description: `Unsupported grant_types: ${unsupported.join(", ")}. Only authorization_code and refresh_token are supported.`,
    };
  }

  const authMethod =
    typeof raw.token_endpoint_auth_method === "string" ? raw.token_endpoint_auth_method : "client_secret_post";
  if (!["client_secret_post", "client_secret_basic", "none"].includes(authMethod)) {
    return {
      error: "invalid_client_metadata",
      description: `Unsupported token_endpoint_auth_method: ${authMethod}.`,
    };
  }

  const clientName =
    typeof raw.client_name === "string" && raw.client_name.trim().length > 0
      ? raw.client_name.trim().slice(0, 200)
      : "Unnamed MCP client";

  return { clientName, redirectUris, tokenEndpointAuthMethod: authMethod, grantTypes };
}

/**
 * Persist a new client. Returns the client id and, for confidential clients,
 * the plaintext secret — which is never recoverable afterwards.
 */
export async function registerClient(registration: ClientRegistration): Promise<{
  clientId: string;
  clientSecret: string | null;
}> {
  const clientId = `mcp_${randomToken(16)}`;
  const isPublic = registration.tokenEndpointAuthMethod === "none";
  const clientSecret = isPublic ? null : randomToken(32);

  const { error } = await getSupabaseAdmin()
    .from("oauth_clients")
    .insert({
      client_id: clientId,
      client_secret_hash: clientSecret ? await sha256Hex(clientSecret) : null,
      client_name: registration.clientName,
      redirect_uris: registration.redirectUris,
      grant_types: registration.grantTypes,
      scope: OAUTH_SCOPE,
    });

  if (error) throw new Error(`Failed to register OAuth client: ${error.message}`);
  return { clientId, clientSecret };
}

export async function getClient(clientId: string | null | undefined): Promise<OAuthClient | null> {
  if (!clientId) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("oauth_clients")
    .select("client_id, client_name, client_secret_hash, redirect_uris, grant_types, scope")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    clientId: data.client_id,
    clientName: data.client_name,
    clientSecretHash: data.client_secret_hash,
    redirectUris: data.redirect_uris,
    grantTypes: data.grant_types,
    scope: data.scope,
  };
}

/**
 * Authenticate a client at the token endpoint. Public clients (no stored
 * secret) authenticate with PKCE alone and must not present one.
 */
export async function verifyClientSecret(
  client: OAuthClient,
  presentedSecret: string | null | undefined,
): Promise<boolean> {
  if (client.clientSecretHash === null) return !presentedSecret;
  if (!presentedSecret) return false;
  return timingSafeEqualStrings(await sha256Hex(presentedSecret), client.clientSecretHash);
}
