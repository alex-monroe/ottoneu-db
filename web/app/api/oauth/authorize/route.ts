/**
 * Consent submission for the OAuth authorization endpoint:
 * POST /api/oauth/authorize
 *
 * Receives the consent form from /oauth/authorize. All request parameters come
 * from the HMAC-signed `consent_token` rather than the form body, so they
 * cannot be tampered with; the token is additionally bound to the session that
 * rendered the screen, which is what stops a cross-site forgery from granting
 * a code on someone else's behalf.
 */

import { getAuthenticatedUser } from "@/lib/auth";
import { verifyConsentRequestToken } from "@/lib/oauth/tokens";
import { createAuthorizationCode } from "@/lib/oauth/codes";
import { canAuthorizeMcpClients } from "@/lib/oauth/access";

/** 303 so the browser turns the POST into a GET on the client's callback. */
function seeOther(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

function badRequest(message: string): Response {
  return new Response(message, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Malformed consent submission.");
  }

  const consentToken = form.get("consent_token");
  const claims = await verifyConsentRequestToken(
    typeof consentToken === "string" ? consentToken : null,
  );
  if (!claims) {
    return badRequest(
      "This authorization request has expired or is invalid. Start the connection again from your MCP client.",
    );
  }

  // The consent screen was rendered for a specific session — require that the
  // same user is submitting it.
  const user = await getAuthenticatedUser();
  if (!user || user.userId !== claims.userId) {
    return badRequest("Your session changed while this page was open. Start the connection again.");
  }

  const redirectUrl = new URL(claims.redirectUri);
  if (claims.state) redirectUrl.searchParams.set("state", claims.state);

  if (form.get("action") !== "approve") {
    redirectUrl.searchParams.set("error", "access_denied");
    redirectUrl.searchParams.set("error_description", "The user denied the request.");
    return seeOther(redirectUrl.toString());
  }

  // Re-check live access at the moment of granting, not just at render time.
  if (!(await canAuthorizeMcpClients(user.userId))) {
    redirectUrl.searchParams.set("error", "access_denied");
    redirectUrl.searchParams.set("error_description", "Account is not authorized for league data.");
    return seeOther(redirectUrl.toString());
  }

  try {
    const code = await createAuthorizationCode({
      clientId: claims.clientId,
      userId: user.userId,
      redirectUri: claims.redirectUri,
      codeChallenge: claims.codeChallenge,
      scope: claims.scope,
    });
    redirectUrl.searchParams.set("code", code);
    return seeOther(redirectUrl.toString());
  } catch (error) {
    console.error("Failed to issue authorization code:", error);
    redirectUrl.searchParams.set("error", "server_error");
    redirectUrl.searchParams.set("error_description", "Could not issue an authorization code.");
    return seeOther(redirectUrl.toString());
  }
}
