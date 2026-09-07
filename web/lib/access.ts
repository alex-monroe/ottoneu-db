/**
 * Single source of truth for route access rules.
 *
 * Before this module the same policy was expressed in four places that could
 * (and did) disagree: the middleware route list, ad-hoc `hasProjectionsAccess`
 * checks inside page components, silent prop-level degradation, and — for
 * `/depth-charts` — nothing at all, which leaked active-model projections to
 * anonymous visitors. Everything that gates on projections access now reads
 * these lists.
 *
 * This module is imported by `web/middleware.ts` and therefore runs in the Edge
 * runtime: keep it free of `next/headers`, Supabase, Node built-ins and any
 * other server-only dependency.
 *
 * Route matching is **segment-aware** (`/value` matches `/value` and
 * `/value/x`, never `/valuation`). Old consolidated URLs such as
 * `/arbitration-planner` are rewritten by `redirects()` in `next.config.ts`,
 * which Next evaluates before middleware, so they arrive here already
 * normalised to `/arbitration`.
 */

/** Where an unauthenticated visitor is sent to sign in. */
export const LOGIN_PATH = "/login";

/**
 * Where a *signed-in* user who lacks projections access is sent.
 *
 * This must never itself require projections access — sending an ungranted
 * user to a page that bounces them onwards is exactly the redirect loop this
 * module exists to prevent. `access.test.ts` pins that invariant.
 */
export const ACCESS_PATH = "/access";

/** UI routes that require `has_projections_access`. */
export const PROJECTIONS_ROUTES = [
  "/projected-salary",
  "/value",
  "/arbitration",
  "/projections",
  "/projection-accuracy",
  "/vegas-lines",
  // Renders active-model projected PPG. Was reachable by anyone with the URL
  // while its sibling spot-check page (/vegas-lines) was protected.
  "/depth-charts",
  // Previously self-gated in-page; now gated in one place like everything else.
  "/weekly",
  "/mock-draft",
  // Ranks the wire by dollar value — the same gated number as /value.
  "/free-agents",
] as const;

/** UI routes that require `is_admin`. */
export const ADMIN_ROUTES = ["/admin"] as const;

/**
 * Where a signed-in user who is not a podcaster is sent, and the one page under
 * `/podcast` that is deliberately **not** gated.
 *
 * Same invariant as {@link ACCESS_PATH}: the destination that explains a locked
 * door cannot itself be behind that door. The hub also re-signs a session cookie
 * that predates the grant, which is why the gated pages point back at it rather
 * than at "/" — bouncing a host home would leave them stuck on a stale cookie
 * with nothing to click.
 */
export const PODCAST_HOME = "/podcast";

/**
 * Routes that require `is_podcaster` — the podcast production tools.
 *
 * Listed per-tool rather than as the whole `/podcast` prefix so that
 * {@link PODCAST_HOME} stays reachable. `/api/podcast` is here too: middleware
 * gates API routes off the same lists, so the ballot endpoints are covered
 * without a second policy.
 */
export const PODCASTER_ROUTES = [
  "/podcast/power-rankings",
  "/api/podcast",
] as const;

/**
 * API routes that authenticate themselves rather than via the session cookie.
 *
 * MCP uses a bearer key or OAuth token checked inside the route handler; the
 * OAuth endpoints are machine-to-machine (`/token`, `/register`) or verify the
 * session against a signed consent token (`/authorize`).
 */
export const PUBLIC_API_ROUTES = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/mcp",
  "/api/oauth",
] as const;

/** True when `pathname` is `route` or a descendant segment of it. */
export function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(route + "/");
}

function matchesAny(pathname: string, routes: readonly string[]): boolean {
  return routes.some((route) => matchesRoute(pathname, route));
}

export function requiresProjectionsAccess(pathname: string): boolean {
  return matchesAny(pathname, PROJECTIONS_ROUTES);
}

export function requiresAdmin(pathname: string): boolean {
  return matchesAny(pathname, ADMIN_ROUTES);
}

export function requiresPodcaster(pathname: string): boolean {
  return matchesAny(pathname, PODCASTER_ROUTES);
}

export function isPublicApiRoute(pathname: string): boolean {
  return matchesAny(pathname, PUBLIC_API_ROUTES);
}

/**
 * Where to send a visitor who cannot view `pathname`, given their session.
 * Returns null when they may proceed.
 *
 * The `signedIn && !hasAccess` case is the one that used to loop: it sent the
 * user to `/login`, which — seeing a valid session — sent them straight back.
 */
export function accessRedirect(
  pathname: string,
  session: {
    signedIn: boolean;
    hasProjectionsAccess: boolean;
    isAdmin: boolean;
    isPodcaster?: boolean;
  },
): string | null {
  const needsProjections = requiresProjectionsAccess(pathname);
  const needsAdmin = requiresAdmin(pathname);
  const needsPodcaster = requiresPodcaster(pathname);
  if (!needsProjections && !needsAdmin && !needsPodcaster) return null;

  if (!session.signedIn) {
    return `${LOGIN_PATH}?redirect=${encodeURIComponent(pathname)}`;
  }
  if (needsAdmin && !session.isAdmin) return "/";
  // The hub, not "/": the cookie is a 7-day snapshot of the role, so a host
  // granted it an hour ago lands here with `false` and needs the page that
  // re-signs the session.
  if (needsPodcaster && !session.isPodcaster) {
    return `${PODCAST_HOME}?from=${encodeURIComponent(pathname)}`;
  }
  if (needsProjections && !session.hasProjectionsAccess) {
    return `${ACCESS_PATH}?from=${encodeURIComponent(pathname)}`;
  }
  return null;
}
