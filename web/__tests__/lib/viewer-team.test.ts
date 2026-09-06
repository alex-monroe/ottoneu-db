/**
 * @jest-environment node
 *
 * Viewer-team resolution — `web/lib/viewer-team.ts` + `web/lib/team-binding.ts`.
 *
 * "My team" used to be `MY_TEAM` from config.json: one constant naming the
 * operator's team, referenced by a dozen components. Every signed-in leaguemate
 * therefore saw the operator's roster labelled as their own. These tests pin the
 * replacement rule, and especially the case that was the bug: an ordinary
 * account with no team bound must resolve to **null**, never to the operator's
 * team.
 */

// jest.mock is hoisted above these imports, so the factories must build their
// own doubles rather than close over consts that have not initialised yet.
jest.mock("@/lib/auth", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("@/lib/supabase", () => {
  const single = jest.fn();
  const pricesSelect = jest.fn();
  return {
    __single: single,
    __pricesSelect: pricesSelect,
    getSupabaseAdmin: jest.fn(() => ({
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single,
    })),
    supabase: { from: jest.fn(() => ({ select: pricesSelect })) },
  };
});

import { getTeamForUser, fetchLeagueTeams } from "@/lib/team-binding";
import { MY_TEAM } from "@/lib/config";

const { getAuthenticatedUser } = jest.requireMock("@/lib/auth");
const supabaseMock = jest.requireMock("@/lib/supabase");
const mockGetAuthenticatedUser = getAuthenticatedUser as jest.Mock;
const mockSingle = supabaseMock.__single as jest.Mock;
const mockPricesSelect = supabaseMock.__pricesSelect as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

/** getViewerTeam is React-cached, so each case needs a fresh module registry. */
async function resolveViewerTeam() {
  let team: string | null = null;
  await jest.isolateModulesAsync(async () => {
    const mod = await import("@/lib/viewer-team");
    team = await mod.getViewerTeam();
  });
  return team;
}

describe("getViewerTeam", () => {
  test("returns the team bound to the account", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ userId: "u1", isAdmin: false });
    mockSingle.mockResolvedValue({ data: { team_name: "Team Rocket", is_admin: false } });
    expect(await resolveViewerTeam()).toBe("Team Rocket");
  });

  test("an ordinary unbound account resolves to null, NOT the operator's team", async () => {
    // The bug this replaces: a leaguemate seeing The Witchcraft as "my team".
    mockGetAuthenticatedUser.mockResolvedValue({ userId: "u2", isAdmin: false });
    mockSingle.mockResolvedValue({ data: { team_name: null, is_admin: false } });
    const team = await resolveViewerTeam();
    expect(team).toBeNull();
    expect(team).not.toBe(MY_TEAM);
  });

  test("an unbound admin falls back to the operator's team", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ userId: "admin", isAdmin: true });
    mockSingle.mockResolvedValue({ data: { team_name: null, is_admin: true } });
    expect(await resolveViewerTeam()).toBe(MY_TEAM);
  });

  test("an admin with a team bound gets that team, not the fallback", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ userId: "admin", isAdmin: true });
    mockSingle.mockResolvedValue({ data: { team_name: "Some Other Team", is_admin: true } });
    expect(await resolveViewerTeam()).toBe("Some Other Team");
  });

  test("anonymous visitors have no team", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    expect(await resolveViewerTeam()).toBeNull();
  });

  test("a missing user row resolves to null rather than throwing", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ userId: "ghost", isAdmin: false });
    mockSingle.mockResolvedValue({ data: null });
    expect(await resolveViewerTeam()).toBeNull();
  });
});

describe("getTeamForUser", () => {
  test("resolves by user id for the MCP layer", async () => {
    mockSingle.mockResolvedValue({ data: { team_name: "Team Rocket", is_admin: false } });
    expect(await getTeamForUser("u1")).toBe("Team Rocket");
  });

  test("unbound non-admin is null, so an MCP caller excludes nobody", async () => {
    mockSingle.mockResolvedValue({ data: { team_name: null, is_admin: false } });
    expect(await getTeamForUser("u2")).toBeNull();
  });
});

describe("fetchLeagueTeams", () => {
  test("returns distinct, sorted team names without free agents", async () => {
    mockPricesSelect.mockResolvedValue({
      data: [
        { team_name: "Zebra" },
        { team_name: "Alpha" },
        { team_name: "Zebra" },
        { team_name: "FA" },
        { team_name: null },
        { team_name: "  Beta  " },
      ],
    });
    expect(await fetchLeagueTeams()).toEqual(["Alpha", "Beta", "Zebra"]);
  });

  test("empty league yields an empty picker rather than throwing", async () => {
    mockPricesSelect.mockResolvedValue({ data: null });
    expect(await fetchLeagueTeams()).toEqual([]);
  });
});
