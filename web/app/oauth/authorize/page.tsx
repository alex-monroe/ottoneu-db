/**
 * OAuth 2.1 authorization endpoint (user-facing): /oauth/authorize
 *
 * Validates the incoming authorization request, makes sure a permitted user is
 * signed in (bouncing through the existing /login page if not), and renders
 * the consent screen. Approval is handled by POST /api/oauth/authorize.
 *
 * Error handling follows OAuth's rule: problems with `client_id` or
 * `redirect_uri` are shown on this page, because an unvalidated redirect
 * target must never be used. Everything else redirects back to the client with
 * an `error` parameter, which is what the client is waiting for.
 */

import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getClient, redirectUriAllowed } from "@/lib/oauth/clients";
import { isSupportedChallengeMethod } from "@/lib/oauth/pkce";
import { issueConsentRequestToken } from "@/lib/oauth/tokens";
import { getUserAccess } from "@/lib/oauth/access";
import { OAUTH_SCOPE } from "@/lib/oauth/constants";
import ConsentForm from "./ConsentForm";

export const metadata = {
  title: "Authorize Access | Ottoneu Analytics",
};

interface AuthorizeParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  state?: string;
  resource?: string;
}

function ErrorPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="min-h-screen bg-white dark:bg-black flex items-center justify-center p-8">
      <div className="max-w-md w-full border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 rounded-lg p-6">
        <h1 className="text-lg font-semibold text-red-900 dark:text-red-200">{title}</h1>
        <p className="mt-2 text-sm text-red-800 dark:text-red-300">{detail}</p>
      </div>
    </main>
  );
}

/** Bounce back to the client with an OAuth error, preserving `state`. */
function redirectWithError(
  redirectUri: string,
  error: string,
  description: string,
  state: string | undefined,
): never {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  redirect(url.toString());
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<AuthorizeParams>;
}) {
  const params = await searchParams;

  // ── Validate the client and redirect URI before trusting either ───────────
  // A lookup failure (e.g. database unavailable) must render an explanation
  // rather than an unhandled error page, since a human is watching this route.
  let client: Awaited<ReturnType<typeof getClient>>;
  try {
    client = await getClient(params.client_id);
  } catch (error) {
    console.error("OAuth client lookup failed:", error);
    return (
      <ErrorPanel
        title="Service temporarily unavailable"
        detail="Could not verify the application making this request. Please try again in a moment."
      />
    );
  }
  if (!client) {
    return (
      <ErrorPanel
        title="Unknown application"
        detail="The client_id in this request is not registered with this server. Try removing and re-adding the connection in your MCP client."
      />
    );
  }
  if (!params.redirect_uri || !redirectUriAllowed(client, params.redirect_uri)) {
    return (
      <ErrorPanel
        title="Invalid redirect URI"
        detail={`"${params.redirect_uri ?? "(missing)"}" is not a redirect URI registered by ${client.clientName}. This can happen if the application changed its callback address after registering.`}
      />
    );
  }
  const redirectUri = params.redirect_uri;

  // ── From here, errors go back to the client ───────────────────────────────
  if (params.response_type !== "code") {
    redirectWithError(
      redirectUri,
      "unsupported_response_type",
      "Only response_type=code is supported.",
      params.state,
    );
  }
  if (!params.code_challenge || !isSupportedChallengeMethod(params.code_challenge_method)) {
    redirectWithError(
      redirectUri,
      "invalid_request",
      "PKCE is required: supply code_challenge with code_challenge_method=S256.",
      params.state,
    );
  }
  if (params.scope && params.scope !== OAUTH_SCOPE) {
    redirectWithError(
      redirectUri,
      "invalid_scope",
      `The only supported scope is "${OAUTH_SCOPE}".`,
      params.state,
    );
  }

  // ── Require a signed-in user, reusing the existing login page ─────────────
  const user = await getAuthenticatedUser();
  if (!user) {
    const self = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") self.set(key, value);
    }
    redirect(`/login?redirect=${encodeURIComponent(`/oauth/authorize?${self.toString()}`)}`);
  }

  // Read the access flag live rather than from the session cookie, which is
  // up to 7 days stale (see lib/oauth/access.ts).
  const access = await getUserAccess(user.userId);
  if (!access?.hasProjectionsAccess) {
    return (
      <ErrorPanel
        title="Account not authorized"
        detail="Your account does not have projections access, which is required to connect an MCP client to this league's data. Ask the league admin to grant it, then try again."
      />
    );
  }

  const consentToken = await issueConsentRequestToken({
    clientId: client.clientId,
    redirectUri,
    codeChallenge: params.code_challenge!,
    scope: OAUTH_SCOPE,
    state: params.state ?? null,
    userId: user.userId,
    resource: params.resource ?? null,
  });

  return (
    <ConsentForm
      clientName={client.clientName}
      redirectHost={new URL(redirectUri).host}
      userEmail={access.email}
      consentToken={consentToken}
    />
  );
}
