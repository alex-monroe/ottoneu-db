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
] as const;

/** UI routes that require `is_admin`. */
export const ADMIN_ROUTES = ["/admin"] as const;

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
  session: { signedIn: boolean; hasProjectionsAccess: boolean; isAdmin: boolean },
): string | null {
  const needsProjections = requiresProjectionsAccess(pathname);
  const needsAdmin = requiresAdmin(pathname);
  if (!needsProjections && !needsAdmin) return null;

  if (!session.signedIn) {
    return `${LOGIN_PATH}?redirect=${encodeURIComponent(pathname)}`;
  }
  if (needsAdmin && !session.isAdmin) return "/";
  if (needsProjections && !session.hasProjectionsAccess) {
    return `${ACCESS_PATH}?from=${encodeURIComponent(pathname)}`;
  }
  return null;
}
