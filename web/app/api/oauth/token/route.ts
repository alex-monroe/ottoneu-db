/**
 * OAuth 2.1 token endpoint: POST /api/oauth/token
 *
 * Supports the authorization_code grant (with mandatory PKCE) and
 * refresh_token grant (with rotation). Client credentials may arrive via HTTP
 * Basic auth or in the request body; public clients present none and rely on
 * PKCE.
 *
 * Every failure path returns a generic OAuth error — the endpoint deliberately
 * does not distinguish "unknown code" from "already used" from "expired", so
 * it leaks nothing to a probing client.
 */

import { getClient, verifyClientSecret } from "@/lib/oauth/clients";
import { consumeAuthorizationCode, consumeRefreshToken, createRefreshToken } from "@/lib/oauth/codes";
import { verifyCodeChallenge } from "@/lib/oauth/pkce";
import { issueAccessToken } from "@/lib/oauth/tokens";
import { canAuthorizeMcpClients } from "@/lib/oauth/access";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  ...CORS_HEADERS,
};

function oauthError(error: string, description: string, status = 400): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: JSON_HEADERS,
  });
}

/** Read params from a form-encoded body (per spec) or JSON (lenient fallback). */
async function readParams(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body: unknown = await request.json();
      if (!body || typeof body !== "object") return {};
      return Object.fromEntries(
        Object.entries(body as Record<string, unknown>)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => [k, v as string]),
      );
    } catch {
      return {};
    }
  }
  try {
    return Object.fromEntries((await request.formData()) as unknown as Iterable<[string, string]>);
  } catch {
    return {};
  }
}

/** Client credentials from the Basic auth header, falling back to body params. */
function readClientCredentials(
  request: Request,
  params: Record<string, string>,
): { clientId: string | null; clientSecret: string | null } {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = atob(header.slice(6).trim());
      const separator = decoded.indexOf(":");
      if (separator !== -1) {
        return {
          clientId: decodeURIComponent(decoded.slice(0, separator)),
          clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
        };
      }
    } catch {
      // Fall through to body credentials.
    }
  }
  return {
    clientId: params.client_id ?? null,
    clientSecret: params.client_secret ?? null,
  };
}

export async function POST(request: Request) {
  const params = await readParams(request);
  const grantType = params.grant_type;

  if (grantType !== "authorization_code" && grantType !== "refresh_token") {
    return oauthError(
      "unsupported_grant_type",
      "Supported grant types: authorization_code, refresh_token.",
    );
  }

  try {
    // ── Authenticate the client ──────────────────────────────────────────────
    // Inside the try: a database outage here must still produce a JSON OAuth
    // error, not an unhandled 500 that clients can't parse.
    const { clientId, clientSecret } = readClientCredentials(request, params);
    const client = await getClient(clientId);
    if (!client || !(await verifyClientSecret(client, clientSecret))) {
      return oauthError("invalid_client", "Client authentication failed.", 401);
    }
    if (!client.grantTypes.includes(grantType)) {
      return oauthError("unauthorized_client", `Client may not use ${grantType}.`);
    }

    if (grantType === "authorization_code") {
      // Consuming first makes the code single-use even if a later check fails,
      // so a leaked code cannot be retried against different parameters.
      const grant = await consumeAuthorizationCode(params.code);
      if (!grant || grant.clientId !== client.clientId) {
        return oauthError("invalid_grant", "Authorization code is invalid, expired, or already used.");
      }
      if (params.redirect_uri !== grant.redirectUri) {
        return oauthError("invalid_grant", "redirect_uri does not match the authorization request.");
      }
      if (!(await verifyCodeChallenge(params.code_verifier, grant.codeChallenge))) {
        return oauthError("invalid_grant", "PKCE verification failed.");
      }

      const { accessToken, expiresIn } = await issueAccessToken({
        userId: grant.userId,
        clientId: client.clientId,
        scope: grant.scope,
      });
      const refreshToken = await createRefreshToken({
        clientId: client.clientId,
        userId: grant.userId,
        scope: grant.scope,
      });

      return new Response(
        JSON.stringify({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: expiresIn,
          refresh_token: refreshToken,
          scope: grant.scope,
        }),
        { headers: JSON_HEADERS },
      );
    }

    // ── refresh_token grant (rotating) ───────────────────────────────────────
    const grant = await consumeRefreshToken(params.refresh_token);
    if (!grant || grant.clientId !== client.clientId) {
      return oauthError("invalid_grant", "Refresh token is invalid, expired, or already used.");
    }

    // Re-check live access: the flag may have been revoked in the admin UI
    // since the grant was made. This is why refresh exists at all here.
    if (!(await canAuthorizeMcpClients(grant.userId))) {
      return oauthError("invalid_grant", "Access has been revoked for this account.");
    }

    const { accessToken, expiresIn } = await issueAccessToken({
      userId: grant.userId,
      clientId: client.clientId,
      scope: grant.scope,
    });
    const refreshToken = await createRefreshToken({
      clientId: client.clientId,
      userId: grant.userId,
      scope: grant.scope,
    });

    return new Response(
      JSON.stringify({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: expiresIn,
        refresh_token: refreshToken,
        scope: grant.scope,
      }),
      { headers: JSON_HEADERS },
    );
  } catch (error) {
    console.error("OAuth token exchange failed:", error);
    return oauthError("server_error", "Token exchange failed.", 500);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
