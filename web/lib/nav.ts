/**
 * The site's information architecture, in one place.
 *
 * The nav used to be organised by **data source**: a "Projections" group mixed
 * the season-long model, a third-party weekly feed, a model diagnostic and two
 * raw-feature spot-check pages built for the operator; a "Value" group listed
 * one page four times, once per tab. Three phases of new routes made that worse.
 *
 * Groups are now organised by **task** — what you came to do, not where the
 * number came from — and each destination appears exactly once.
 *
 * Access levels here drive *menu visibility only*. Route enforcement lives in
 * `lib/access.ts` and is unchanged: a page in the operator "Data" group is still
 * reachable by any account with projections access that knows the URL.
 */

export type NavAccess = "public" | "projections" | "admin" | "podcaster";

export interface NavItem {
  href: string;
  label: string;
  /** Minimum access needed to see this item in the menu. Default "public". */
  access?: NavAccess;
  /** Replaced at render time with the viewer's own team page. */
  dynamic?: "viewerTeam";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** Hide the whole group from signed-out visitors. */
  requiresAuth?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "My Team",
    requiresAuth: true,
    items: [
      { href: "/teams", label: "Your Team", dynamic: "viewerTeam" },
      { href: "/lineup", label: "Lineup" },
      { href: "/matchup", label: "Matchup" },
      { href: "/projected-salary", label: "Keep or Cut", access: "projections" },
    ],
  },
  {
    label: "League",
    items: [
      { href: "/scoreboard", label: "Scoreboard" },
      { href: "/teams", label: "Teams" },
      { href: "/rosters", label: "Rosters" },
      { href: "/arb-progress", label: "Arbitration Progress" },
      { href: "/arb-planner-public", label: "Arbitration Plans" },
    ],
  },
  {
    label: "Players",
    items: [
      { href: "/players", label: "Player Directory" },
      { href: "/projections", label: "Season Projections", access: "projections" },
      // Per-game, third-party, in-season — a different thing entirely from the
      // season-long model above, so the label says which is which.
      { href: "/weekly", label: "Weekly Projections", access: "projections" },
      { href: "/free-agents", label: "Free Agents", access: "projections" },
    ],
  },
  {
    label: "Analysis",
    items: [
      // One entry per destination: the tabs inside these pages are the page's
      // business, not the nav's.
      { href: "/value", label: "Player Value", access: "projections" },
      { href: "/arbitration", label: "Arbitration", access: "projections" },
    ],
  },
  {
    label: "Tools",
    items: [{ href: "/mock-draft", label: "Mock Draft", access: "projections" }],
  },
  {
    // Production tooling for the league's podcast. A third role rather than a
    // rung above "projections": a host needs none of the model's numbers to
    // record a show, and most people with projections access are not hosts.
    label: "Podcast",
    requiresAuth: true,
    items: [
      { href: "/podcast/power-rankings", label: "Power Rankings", access: "podcaster" },
    ],
  },
  {
    // Instruments for whoever runs the pipeline — spot-checks on the raw
    // features behind the model, plus scrape health. Not decision tools, so
    // they no longer sit beside them.
    label: "Data",
    requiresAuth: true,
    items: [
      { href: "/projection-accuracy", label: "Projection Accuracy", access: "admin" },
      { href: "/vegas-lines", label: "Vegas Lines", access: "admin" },
      { href: "/depth-charts", label: "Depth Charts", access: "admin" },
      { href: "/admin/workflows", label: "Workflow Status", access: "admin" },
      { href: "/admin", label: "Users", access: "admin" },
    ],
  },
];

/**
 * Groups the homepage hub does not mirror. "Data" holds operator instruments
 * (scrape health, raw-feature spot checks), which are not destinations a
 * manager browses to.
 */
export const HUB_EXCLUDED_GROUPS = ["Data"];

export interface Viewer {
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasProjectionsAccess: boolean;
  /** Independent of the other two — see NAV_GROUPS' "Podcast" group. */
  isPodcaster?: boolean;
  viewerTeam: string | null;
}

/** Whether this viewer's access level reaches an item. Exported so the homepage
 *  hub applies exactly the same rule the menu does. */
export function canSee(item: NavItem, viewer: Viewer): boolean {
  switch (item.access ?? "public") {
    case "admin":
      return viewer.isAdmin;
    case "projections":
      return viewer.hasProjectionsAccess;
    case "podcaster":
      return !!viewer.isPodcaster;
    default:
      return true;
  }
}

/**
 * The groups this viewer should actually see, with unreachable items dropped
 * and dynamic hrefs resolved. A group whose items all disappear is dropped too,
 * so nobody gets an empty menu.
 */
export function visibleNav(viewer: Viewer, teamHref: (n: string) => string): NavGroup[] {
  return NAV_GROUPS.flatMap((group) => {
    if (group.requiresAuth && !viewer.isAuthenticated) return [];
    const items = group.items
      .filter((item) => canSee(item, viewer))
      // "Your Team" only means something once an account is bound to one.
      .filter((item) => item.dynamic !== "viewerTeam" || viewer.viewerTeam != null)
      .map((item) =>
        item.dynamic === "viewerTeam" && viewer.viewerTeam
          ? { ...item, href: teamHref(viewer.viewerTeam), label: viewer.viewerTeam }
          : item,
      );
    return items.length > 0 ? [{ ...group, items }] : [];
  });
}
