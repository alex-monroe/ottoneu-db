/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591): POST /api/oauth/register
 *
 * Lets MCP clients that support DCR (e.g. Gemini Spark) register themselves,
 * so the user only has to paste the MCP server URL. Clients without DCR are
 * provisioned manually with `just oauth-client` and enter the credentials by
 * hand.
 *
 * Registration is open, matching the MCP ecosystem's expectation. That is safe
 * here because registering a client grants nothing on its own: no data is
 * reachable until a user with `has_projections_access` logs in and approves
 * the consent screen.
 */

import { parseRegistrationRequest, registerClient } from "@/lib/oauth/clients";
import { OAUTH_SCOPE } from "@/lib/oauth/constants";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      { error: "invalid_client_metadata", error_description: "Body must be valid JSON." },
      400,
    );
  }

  const parsed = parseRegistrationRequest(body);
  if ("error" in parsed) {
    return json({ error: parsed.error, error_description: parsed.description }, 400);
  }

  try {
    const { clientId, clientSecret } = await registerClient(parsed);
    return json(
      {
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        client_name: parsed.clientName,
        redirect_uris: parsed.redirectUris,
        grant_types: parsed.grantTypes,
        response_types: ["code"],
        token_endpoint_auth_method: parsed.tokenEndpointAuthMethod,
        scope: OAUTH_SCOPE,
        // Secrets do not expire; rotation means re-registering.
        ...(clientSecret ? { client_secret_expires_at: 0 } : {}),
        client_id_issued_at: Math.floor(Date.now() / 1000),
      },
      201,
    );
  } catch (error) {
    console.error("OAuth client registration failed:", error);
    return json(
      { error: "server_error", error_description: "Could not register client." },
      500,
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
