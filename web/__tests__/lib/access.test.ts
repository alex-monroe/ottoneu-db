/**
 * Route access policy — `web/lib/access.ts`.
 *
 * The load-bearing test here is the loop invariant: a signed-in user without
 * projections access must never be redirected to a destination that redirects
 * them again. Self-registration grants `has_projections_access: false`, so
 * before this every new account that opened a gated page hit
 * `/projections -> /login -> /projections -> …` until the browser gave up with
 * ERR_TOO_MANY_REDIRECTS.
 */

import {
  ACCESS_PATH,
  ADMIN_ROUTES,
  LOGIN_PATH,
  PODCASTER_ROUTES,
  PODCAST_HOME,
  PROJECTIONS_ROUTES,
  accessRedirect,
  isPublicApiRoute,
  matchesRoute,
  requiresAdmin,
  requiresPodcaster,
  requiresProjectionsAccess,
} from "@/lib/access";

const ANON = { signedIn: false, hasProjectionsAccess: false, isAdmin: false };
const NO_ACCESS = { signedIn: true, hasProjectionsAccess: false, isAdmin: false };
const MEMBER = { signedIn: true, hasProjectionsAccess: true, isAdmin: false };
const ADMIN = { signedIn: true, hasProjectionsAccess: true, isAdmin: true };
/** A podcast host with none of the other two roles — the point of the flag. */
const HOST = {
  signedIn: true,
  hasProjectionsAccess: false,
  isAdmin: false,
  isPodcaster: true,
};

/** Strip the query so a redirect target can be re-evaluated as a route. */
function pathOf(destination: string): string {
  return destination.split("?")[0];
}

describe("no redirect loops", () => {
  test.each([...PROJECTIONS_ROUTES])(
    "%s does not bounce a signed-in user without access back to itself",
    (route) => {
      const destination = accessRedirect(route, NO_ACCESS);
      expect(destination).not.toBeNull();
      expect(pathOf(destination!)).not.toBe(route);
      // The old bug: sending them to /login, which sends authenticated users
      // straight back to `redirect`.
      expect(pathOf(destination!)).not.toBe(LOGIN_PATH);
      expect(pathOf(destination!)).toBe(ACCESS_PATH);
    },
  );

  test("the redirect destination is itself reachable — the loop terminates", () => {
    for (const route of PROJECTIONS_ROUTES) {
      let current: string = route;
      // Follow the chain; a correct policy settles within a couple of hops.
      for (let hop = 0; hop < 5; hop++) {
        const next = accessRedirect(current, NO_ACCESS);
        if (next === null) break;
        current = pathOf(next);
      }
      expect(accessRedirect(current, NO_ACCESS)).toBeNull();
    }
  });

  test("/access never requires the access it exists to explain", () => {
    expect(requiresProjectionsAccess(ACCESS_PATH)).toBe(false);
    expect(requiresAdmin(ACCESS_PATH)).toBe(false);
    expect(accessRedirect(ACCESS_PATH, NO_ACCESS)).toBeNull();
    expect(accessRedirect(ACCESS_PATH, ANON)).toBeNull();
  });

  test("/login is reachable by everyone", () => {
    for (const session of [ANON, NO_ACCESS, MEMBER, ADMIN]) {
      expect(accessRedirect(LOGIN_PATH, session)).toBeNull();
    }
  });
});

describe("projections gate", () => {
  test("anonymous visitors are sent to sign in, preserving their destination", () => {
    const destination = accessRedirect("/projections", ANON);
    expect(destination).toBe(`${LOGIN_PATH}?redirect=%2Fprojections`);
  });

  test("members pass through every gated route", () => {
    for (const route of PROJECTIONS_ROUTES) {
      expect(accessRedirect(route, MEMBER)).toBeNull();
    }
  });

  test("/depth-charts is gated like every other projections surface", () => {
    // It rendered active-model projected PPG to anyone with the URL: it was
    // absent from the route list while its sibling /vegas-lines was protected.
    expect(requiresProjectionsAccess("/depth-charts")).toBe(true);
    expect(accessRedirect("/depth-charts", NO_ACCESS)).toContain(ACCESS_PATH);
  });

  test.each(["/weekly", "/mock-draft"])(
    "%s is gated centrally rather than in the page body",
    (route) => {
      expect(requiresProjectionsAccess(route)).toBe(true);
    },
  );

  test("public routes stay public", () => {
    for (const route of ["/", "/scoreboard", "/players", "/rosters", "/lineup",
                         "/arb-progress", "/arb-planner-public", "/snake-draft"]) {
      expect(requiresProjectionsAccess(route)).toBe(false);
      expect(accessRedirect(route, ANON)).toBeNull();
    }
  });
});

describe("admin gate", () => {
  test("non-admins are sent home, not into the access flow", () => {
    for (const route of ADMIN_ROUTES) {
      expect(accessRedirect(route, MEMBER)).toBe("/");
      expect(accessRedirect(route, ADMIN)).toBeNull();
    }
  });

  test("anonymous visitors sign in first", () => {
    expect(accessRedirect("/admin", ANON)).toBe(`${LOGIN_PATH}?redirect=%2Fadmin`);
  });
});

describe("podcaster gate", () => {
  test("the podcast hub is not behind the door it explains", () => {
    // Same invariant as /access: the destination a blocked visitor is sent to
    // must not itself block them, or the redirect loops.
    expect(requiresPodcaster(PODCAST_HOME)).toBe(false);
    expect(requiresProjectionsAccess(PODCAST_HOME)).toBe(false);
    expect(requiresAdmin(PODCAST_HOME)).toBe(false);
    for (const session of [ANON, NO_ACCESS, MEMBER, ADMIN, HOST]) {
      expect(accessRedirect(PODCAST_HOME, session)).toBeNull();
    }
  });

  test("every gated podcast route sits under the hub or its API", () => {
    for (const route of PODCASTER_ROUTES) {
      expect(
        matchesRoute(route, PODCAST_HOME) || matchesRoute(route, "/api/podcast"),
      ).toBe(true);
    }
  });

  test("a signed-in non-host is sent to the hub, which explains why", () => {
    for (const route of PODCASTER_ROUTES) {
      const destination = accessRedirect(route, MEMBER);
      expect(destination).not.toBeNull();
      expect(pathOf(destination!)).toBe(PODCAST_HOME);
      // …and the hub does not bounce them onwards.
      expect(accessRedirect(pathOf(destination!), MEMBER)).toBeNull();
    }
  });

  test("hosts pass through without needing any other role", () => {
    for (const route of PODCASTER_ROUTES) {
      expect(accessRedirect(route, HOST)).toBeNull();
    }
  });

  test("admins are not hosts by default — the roles are independent", () => {
    // is_podcaster is seeded true for the operator in migration 040, but the
    // policy must not infer the role from is_admin.
    expect(accessRedirect("/podcast/power-rankings", ADMIN)).toContain(PODCAST_HOME);
  });

  test("anonymous visitors sign in first, keeping their destination", () => {
    expect(accessRedirect("/podcast/power-rankings", ANON)).toBe(
      `${LOGIN_PATH}?redirect=%2Fpodcast%2Fpower-rankings`,
    );
  });

  test("the podcast tools are not projections surfaces", () => {
    // A host needs none of the model's numbers to record a show, so the
    // podcast routes must not also demand projections access.
    for (const route of PODCASTER_ROUTES) {
      expect(requiresProjectionsAccess(route)).toBe(false);
    }
  });
});

describe("route matching is segment-aware", () => {
  test("matches the route and its descendants", () => {
    expect(matchesRoute("/value", "/value")).toBe(true);
    expect(matchesRoute("/value/detail", "/value")).toBe(true);
  });

  test("does not match a longer sibling name", () => {
    expect(matchesRoute("/valuation", "/value")).toBe(false);
    expect(requiresProjectionsAccess("/projections-archive")).toBe(false);
    // /arb-progress and /arb-planner-public are deliberately public and must
    // not be swallowed by the /arbitration prefix.
    expect(requiresProjectionsAccess("/arb-progress")).toBe(false);
    expect(requiresProjectionsAccess("/arb-planner-public")).toBe(false);
    // A hypothetical public "/podcasts" listing must not inherit the host gate.
    expect(requiresPodcaster("/podcasts")).toBe(false);
  });
});

describe("public API routes", () => {
  test("auth, MCP and OAuth endpoints carry their own auth", () => {
    expect(isPublicApiRoute("/api/auth/login")).toBe(true);
    expect(isPublicApiRoute("/api/mcp/mcp")).toBe(true);
    expect(isPublicApiRoute("/api/oauth/token")).toBe(true);
  });

  test("everything else needs a session", () => {
    expect(isPublicApiRoute("/api/access-request")).toBe(false);
    expect(isPublicApiRoute("/api/admin/users")).toBe(false);
    expect(isPublicApiRoute("/api/arbitration-plans")).toBe(false);
    expect(isPublicApiRoute("/api/podcast/power-rankings")).toBe(false);
  });
});
