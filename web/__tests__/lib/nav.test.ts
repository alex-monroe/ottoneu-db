/**
 * Navigation information architecture — `web/lib/nav.ts`.
 *
 * The nav was organised by data source: a "Projections" group mixed the
 * season-long model, a third-party weekly feed, a model diagnostic and two
 * operator spot-check pages, while a "Value" group listed one page four times,
 * once per tab. These tests pin the properties that fixed it — one entry per
 * destination, task grouping, and menus that never show a viewer something
 * they cannot open.
 */

import { NAV_GROUPS, visibleNav, type Viewer } from "@/lib/nav";

const href = (n: string) => `/teams/${encodeURIComponent(n)}`;

const ANON: Viewer = {
  isAuthenticated: false,
  isAdmin: false,
  hasProjectionsAccess: false,
  viewerTeam: null,
};
const MEMBER: Viewer = {
  isAuthenticated: true,
  isAdmin: false,
  hasProjectionsAccess: true,
  viewerTeam: "The Witchcraft",
};
const NO_ACCESS: Viewer = {
  isAuthenticated: true,
  isAdmin: false,
  hasProjectionsAccess: false,
  viewerTeam: "Team Rocket",
};
const ADMIN: Viewer = {
  isAuthenticated: true,
  isAdmin: true,
  hasProjectionsAccess: true,
  viewerTeam: "The Witchcraft",
};
/** A podcast host who is not an admin and has no projections access. */
const HOST: Viewer = {
  isAuthenticated: true,
  isAdmin: false,
  hasProjectionsAccess: false,
  isPodcaster: true,
  viewerTeam: "Team Rocket",
};

/** Every href a viewer is offered, across all groups. */
function hrefs(viewer: Viewer): string[] {
  return visibleNav(viewer, href).flatMap((g) => g.items.map((i) => i.href));
}

describe("one entry per destination", () => {
  test("no route is listed twice within a group", () => {
    for (const group of NAV_GROUPS) {
      const paths = group.items.map((i) => i.href);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });

  test("no nav item points at a tab of a page listed separately", () => {
    // "/value?tab=vorp" etc. were four sibling entries for one destination.
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.href).not.toContain("?tab=");
      }
    }
  });
});

describe("menus only offer what the viewer can open", () => {
  test("anonymous visitors see no gated route", () => {
    const offered = hrefs(ANON);
    for (const gated of ["/projections", "/value", "/arbitration", "/free-agents", "/weekly", "/mock-draft"]) {
      expect(offered).not.toContain(gated);
    }
    // ...but the public league pages are still there.
    expect(offered).toEqual(expect.arrayContaining(["/scoreboard", "/rosters", "/teams", "/players"]));
  });

  test("anonymous visitors get no auth-only group", () => {
    const labels = visibleNav(ANON, href).map((g) => g.label);
    expect(labels).not.toContain("My Team");
    expect(labels).not.toContain("Data");
  });

  test("a signed-in account without access sees public routes only", () => {
    const offered = hrefs(NO_ACCESS);
    expect(offered).toContain("/lineup");
    expect(offered).not.toContain("/projections");
    expect(offered).not.toContain("/projected-salary");
  });

  test("operator instruments are admin-only in the menu", () => {
    // Menu visibility only — route gating (lib/access.ts) is unchanged.
    for (const route of ["/vegas-lines", "/depth-charts", "/projection-accuracy", "/admin/workflows"]) {
      expect(hrefs(MEMBER)).not.toContain(route);
      expect(hrefs(ADMIN)).toContain(route);
    }
  });

  test("a group with nothing visible is dropped rather than shown empty", () => {
    const groups = visibleNav(NO_ACCESS, href);
    for (const g of groups) expect(g.items.length).toBeGreaterThan(0);
    expect(groups.map((g) => g.label)).not.toContain("Analysis");
  });
});

describe("your team", () => {
  test("resolves to the viewer's own team page", () => {
    const myTeam = visibleNav(MEMBER, href).find((g) => g.label === "My Team")!;
    expect(myTeam.items[0].href).toBe("/teams/The%20Witchcraft");
    expect(myTeam.items[0].label).toBe("The Witchcraft");
  });

  test("is omitted when no team is bound, rather than pointing nowhere", () => {
    const unbound: Viewer = { ...MEMBER, viewerTeam: null };
    const myTeam = visibleNav(unbound, href).find((g) => g.label === "My Team")!;
    expect(myTeam.items.some((i) => i.dynamic === "viewerTeam")).toBe(false);
    // The rest of the group still works.
    expect(myTeam.items.map((i) => i.href)).toContain("/lineup");
  });
});

describe("the podcast group", () => {
  test("only hosts are offered it", () => {
    expect(hrefs(HOST)).toContain("/podcast/power-rankings");
    // Not admins, not members, not signed-out visitors: the role is its own.
    for (const viewer of [ANON, MEMBER, NO_ACCESS, ADMIN]) {
      expect(hrefs(viewer)).not.toContain("/podcast/power-rankings");
    }
  });

  test("a host without projections access still gets no gated league page", () => {
    const offered = hrefs(HOST);
    expect(offered).not.toContain("/projections");
    expect(offered).not.toContain("/value");
  });

  test("the group disappears entirely rather than showing empty", () => {
    expect(visibleNav(MEMBER, href).map((g) => g.label)).not.toContain("Podcast");
    expect(visibleNav(HOST, href).map((g) => g.label)).toContain("Podcast");
  });
});

describe("snake draft is not league tooling", () => {
  test("it appears nowhere in the nav (decision D3)", () => {
    for (const viewer of [ANON, MEMBER, NO_ACCESS, ADMIN, HOST]) {
      expect(hrefs(viewer)).not.toContain("/snake-draft");
    }
  });
});
