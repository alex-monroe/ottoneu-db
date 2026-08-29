/**
 * Unit tests for lib/mcp/tools.ts — MCP tool handlers over mocked fetchers.
 *
 * The data layer (lib/data, lib/analysis, roster fetch, season context) is
 * mocked; the pure calculators (surplus, arb, roster reconstruction) run for
 * real so the tests exercise the actual composition each tool performs.
 */
import { MCP_TOOLS } from "@/lib/mcp/tools";
import type { McpToolResult } from "@/lib/mcp/format";
import type { Player, PlayerListItem } from "@/lib/types";
import type { SeasonContext } from "@/lib/season";
import type { ProjectionBoardRow } from "@/lib/analysis";

jest.mock("@/lib/supabase", () => ({
    supabase: {},
    fetchAllRows: jest.fn(),
    getSupabaseAdmin: jest.fn(),
}));
jest.mock("@/lib/season", () => ({
    getSeasonContextNow: jest.fn(),
}));
jest.mock("@/lib/data", () => ({
    fetchPlayerList: jest.fn(),
    fetchPlayerDetail: jest.fn(),
    fetchPlayerProjection: jest.fn(),
    fetchDraftSharksValue: jest.fn(),
    fetchPlayersEndOfSeason: jest.fn(),
    fetchPlayersPreArb: jest.fn(),
    fetchActiveProjectionModel: jest.fn(),
    fetchDraftSharksMap: jest.fn(),
}));
jest.mock("@/lib/analysis", () => ({
    fetchProjectionBoard: jest.fn(),
}));
jest.mock("@/lib/roster-reconstruction", () => ({
    ...jest.requireActual("@/lib/roster-reconstruction"),
    fetchRosterData: jest.fn(),
}));
jest.mock("@/lib/depth-charts", () => ({
    fetchAvailableDepthChartSeasons: jest.fn(),
    fetchDepthChartsForSeason: jest.fn(),
}));
jest.mock("@/lib/vegas-lines", () => ({
    fetchAvailableSeasons: jest.fn(),
    fetchVegasLinesForSeason: jest.fn(),
}));
jest.mock("@/lib/weekly-projections", () => ({
    fetchWeeklyBoard: jest.fn(),
    fetchWeeklyAsOf: jest.fn(),
    fetchAvailableWeeks: jest.fn(),
    fetchPlayerWeeklyProjections: jest.fn(),
}));
jest.mock("@/lib/nfl-week", () => ({
    // Default to "no NFL week resolved" — the offseason case — so tests written
    // before the weekly feature exercise get_player unchanged. Tests that care
    // about weekly context override this.
    getDisplayWeeks: jest.fn().mockResolvedValue({
        season: null,
        upcoming: null,
        previous: null,
    }),
}));

import { getSeasonContextNow } from "@/lib/season";
import {
    fetchPlayerList,
    fetchPlayerDetail,
    fetchPlayerProjection,
    fetchDraftSharksValue,
    fetchPlayersEndOfSeason,
    fetchPlayersPreArb,
    fetchActiveProjectionModel,
    fetchDraftSharksMap,
} from "@/lib/data";
import { fetchProjectionBoard } from "@/lib/analysis";
import { fetchRosterData } from "@/lib/roster-reconstruction";
import {
    fetchWeeklyBoard,
    fetchWeeklyAsOf,
    fetchAvailableWeeks,
    fetchPlayerWeeklyProjections,
} from "@/lib/weekly-projections";
import { getDisplayWeeks } from "@/lib/nfl-week";

const mockWeeklyBoard = fetchWeeklyBoard as jest.MockedFunction<typeof fetchWeeklyBoard>;
const mockWeeklyAsOf = fetchWeeklyAsOf as jest.MockedFunction<typeof fetchWeeklyAsOf>;
const mockAvailableWeeks = fetchAvailableWeeks as jest.MockedFunction<typeof fetchAvailableWeeks>;
const mockPlayerWeekly = fetchPlayerWeeklyProjections as jest.MockedFunction<
    typeof fetchPlayerWeeklyProjections
>;
const mockDisplayWeeks = getDisplayWeeks as jest.MockedFunction<typeof getDisplayWeeks>;

const mockSeasonContext = getSeasonContextNow as jest.MockedFunction<typeof getSeasonContextNow>;
const mockPlayerList = fetchPlayerList as jest.MockedFunction<typeof fetchPlayerList>;
const mockPlayerDetail = fetchPlayerDetail as jest.MockedFunction<typeof fetchPlayerDetail>;
const mockPlayerProjection = fetchPlayerProjection as jest.MockedFunction<typeof fetchPlayerProjection>;
const mockDraftSharks = fetchDraftSharksValue as jest.MockedFunction<typeof fetchDraftSharksValue>;
const mockEndOfSeason = fetchPlayersEndOfSeason as jest.MockedFunction<typeof fetchPlayersEndOfSeason>;
const mockPreArb = fetchPlayersPreArb as jest.MockedFunction<typeof fetchPlayersPreArb>;
const mockBoard = fetchProjectionBoard as jest.MockedFunction<typeof fetchProjectionBoard>;
const mockRosterData = fetchRosterData as jest.MockedFunction<typeof fetchRosterData>;
const mockActiveModel = fetchActiveProjectionModel as jest.MockedFunction<typeof fetchActiveProjectionModel>;
const mockDraftSharksMap = fetchDraftSharksMap as jest.MockedFunction<typeof fetchDraftSharksMap>;

function tool(name: string) {
    const def = MCP_TOOLS.find((t) => t.name === name);
    if (!def) throw new Error(`tool ${name} not registered`);
    return def;
}

function payload(result: McpToolResult): Record<string, unknown> {
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    return JSON.parse(result.content[0].text);
}

const SEASON_CTX: SeasonContext = {
    phase: "pre_keeper",
    leagueSeason: 2026,
    projectionSeason: 2026,
    statsSeason: 2025,
    arbitrationSeason: 2026,
    arbWindowOpen: false,
    deadlines: {},
    nextBoundary: null,
    source: "calendar",
};

function makeListItem(overrides: Partial<PlayerListItem> = {}): PlayerListItem {
    return {
        id: "p1",
        ottoneu_id: 100,
        name: "Some Player",
        position: "RB",
        nfl_team: "KC",
        price: 10,
        team_name: "Team A",
        total_points: 100,
        ppg: 10,
        games_played: 16,
        ...overrides,
    };
}

function makePlayer(overrides: Partial<Player> = {}): Player {
    return {
        player_id: overrides.player_id ?? "p",
        ottoneu_id: 1,
        name: overrides.name ?? "Player",
        position: overrides.position ?? "RB",
        nfl_team: "ANY",
        birth_date: null,
        is_college: false,
        price: overrides.price ?? 1,
        team_name: overrides.team_name ?? null,
        total_points: overrides.total_points ?? 0,
        games_played: overrides.games_played ?? 16,
        snaps: 0,
        ppg: overrides.ppg ?? 0,
        pps: 0,
        ...overrides,
    };
}

/** Player pool large enough for a real replacement level in VORP/surplus. */
function buildPool(): Player[] {
    const pool: Player[] = [];
    for (let i = 0; i < 40; i++) {
        const ppg = i < 12 ? 16 + i * 0.4 : 5 + (i - 12) * 0.2;
        pool.push(
            makePlayer({
                player_id: `rb${i}`,
                name: `RB ${i}`,
                position: "RB",
                team_name: `Team ${i % 12}`,
                price: i < 12 ? 35 + i : 1 + i,
                ppg,
                total_points: ppg * 16,
            })
        );
    }
    return pool;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockSeasonContext.mockResolvedValue(SEASON_CTX);
    mockDraftSharksMap.mockResolvedValue({});
});

describe("registry", () => {
    test("every tool has a unique name, description, and handler", () => {
        const names = MCP_TOOLS.map((t) => t.name);
        expect(new Set(names).size).toBe(MCP_TOOLS.length);
        for (const t of MCP_TOOLS) {
            expect(t.description.length).toBeGreaterThan(20);
            expect(typeof t.handler).toBe("function");
        }
    });
});

describe("search_players", () => {
    beforeEach(() => {
        mockPlayerList.mockResolvedValue([
            makeListItem({ id: "p1", ottoneu_id: 1, name: "Justin Jefferson", position: "WR", total_points: 250 }),
            makeListItem({ id: "p2", ottoneu_id: 2, name: "Justin Herbert", position: "QB", total_points: 300 }),
            makeListItem({ id: "p3", ottoneu_id: 3, name: "Justin Fields", position: "QB", total_points: 200, team_name: null, price: null }),
            makeListItem({ id: "p4", ottoneu_id: 4, name: "Aaron Jones", position: "RB", total_points: 150 }),
        ]);
    });

    test("filters by name substring, sorted by total points", () => {
        return tool("search_players").handler({ query: "justin" }).then((res) => {
            const body = payload(res);
            const names = (body.players as { name: string }[]).map((p) => p.name);
            expect(names).toEqual(["Justin Herbert", "Justin Jefferson", "Justin Fields"]);
        });
    });

    test("applies position and rostered_only filters", async () => {
        const body = payload(
            await tool("search_players").handler({ query: "justin", position: "QB", rostered_only: true })
        );
        const names = (body.players as { name: string }[]).map((p) => p.name);
        expect(names).toEqual(["Justin Herbert"]);
    });

    test("caps results at the requested limit", async () => {
        const body = payload(await tool("search_players").handler({ query: "j", limit: 2 }));
        expect(body.count).toBe(2);
    });
});

describe("get_player", () => {
    test("rejects calls with neither or both identifiers", async () => {
        expect((await tool("get_player").handler({})).isError).toBe(true);
        expect(
            (await tool("get_player").handler({ ottoneu_id: 1, name: "X" })).isError
        ).toBe(true);
    });

    test("returns candidates for an ambiguous name", async () => {
        mockPlayerList.mockResolvedValue([
            makeListItem({ id: "p1", ottoneu_id: 1, name: "Josh Allen", position: "QB" }),
            makeListItem({ id: "p2", ottoneu_id: 2, name: "Josh Allen", position: "TE" }),
        ]);
        const body = payload(await tool("get_player").handler({ name: "Josh Allen" }));
        expect(body.ambiguous).toBe(true);
        expect(body.candidates).toHaveLength(2);
        expect(mockPlayerDetail).not.toHaveBeenCalled();
    });

    test("prefers an exact name match over substring matches", async () => {
        mockPlayerList.mockResolvedValue([
            makeListItem({ id: "p1", ottoneu_id: 1, name: "Justin Jefferson" }),
            makeListItem({ id: "p2", ottoneu_id: 2, name: "Jefferson" }),
        ]);
        mockPlayerDetail.mockResolvedValue({
            id: "p2",
            ottoneu_id: 2,
            name: "Jefferson",
            position: "WR",
            nfl_team: "MIN",
            birth_date: null,
            price: 40,
            team_name: "Team A",
            seasonStats: [],
            transactions: [],
        });
        mockPlayerProjection.mockResolvedValue({ projected_ppg: 12.345, projection_method: "model" });
        mockDraftSharks.mockResolvedValue(null);

        const body = payload(await tool("get_player").handler({ name: "Jefferson" }));
        expect(mockPlayerDetail).toHaveBeenCalledWith(2);
        expect(body.name).toBe("Jefferson");
        expect((body.projection as { projected_ppg: number }).projected_ppg).toBe(12.35);
    });

    test("errors when the ottoneu_id does not exist", async () => {
        mockPlayerDetail.mockResolvedValue(null);
        const res = await tool("get_player").handler({ ottoneu_id: 999999 });
        expect(res.isError).toBe(true);
    });
});

describe("get_rosters", () => {
    beforeEach(() => {
        mockRosterData.mockResolvedValue({
            transactions: [],
            players: [
                { id: "p1", ottoneu_id: 1, name: "Alpha QB", position: "QB", nfl_team: "KC" },
                { id: "p2", ottoneu_id: 2, name: "Beta RB", position: "RB", nfl_team: "SF" },
            ],
            stats: [{ player_id: "p1", ppg: 20.55, pps: 0.5, games_played: 17, snaps: 1000 }],
            leaguePrices: [
                { player_id: "p1", price: 30, team_name: "Team A" },
                { player_id: "p2", price: 5, team_name: "Team B" },
            ],
        });
    });

    test("groups current rosters by team with salary totals", async () => {
        const body = payload(await tool("get_rosters").handler({}));
        const teams = body.teams as { team_name: string; players: { ppg: number | null }[]; total_salary: number }[];
        expect(teams.map((t) => t.team_name)).toEqual(["Team A", "Team B"]);
        expect(teams[0].total_salary).toBe(30);
        expect(teams[0].players[0].ppg).toBe(20.6);
    });

    test("filters to a single team case-insensitively", async () => {
        const body = payload(await tool("get_rosters").handler({ team_name: "team b" }));
        const teams = body.teams as { team_name: string }[];
        expect(teams).toHaveLength(1);
        expect(teams[0].team_name).toBe("Team B");
    });

    test("errors with the list of valid teams for an unknown team", async () => {
        const res = await tool("get_rosters").handler({ team_name: "Nope" });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("Team A");
    });
});

describe("get_projections", () => {
    beforeEach(() => {
        const rows: ProjectionBoardRow[] = [
            {
                player_id: "p1", ottoneu_id: 1, name: "QB One", position: "QB", nfl_team: "KC",
                team_name: "Team A", price: 40, observed_ppg: 20, projected_ppg: 21.111,
                ppg_delta: 1.111, projection_method: "model", is_rookie: false, age: 28,
                games_played: 17, overall_rank: 1, position_rank: 1,
            },
            {
                player_id: "p2", ottoneu_id: 2, name: "WR One", position: "WR", nfl_team: "MIN",
                team_name: null, price: 0, observed_ppg: null, projected_ppg: 15,
                ppg_delta: null, projection_method: "rookie_draft_capital", is_rookie: true, age: 22,
                games_played: 0, overall_rank: 2, position_rank: 1,
            },
        ];
        mockBoard.mockResolvedValue(rows);
    });

    test("returns the board for the resolved projection season", async () => {
        const body = payload(await tool("get_projections").handler({}));
        expect(mockBoard).toHaveBeenCalledWith(2026, 2025);
        expect(body.projection_season).toBe(2026);
        expect(body.count).toBe(2);
    });

    test("filters by position", async () => {
        const body = payload(await tool("get_projections").handler({ position: "WR" }));
        const players = body.players as { name: string }[];
        expect(players.map((p) => p.name)).toEqual(["WR One"]);
    });

    test("treats team_name FA as unrostered players", async () => {
        const body = payload(await tool("get_projections").handler({ team_name: "FA" }));
        const players = body.players as { name: string }[];
        expect(players.map((p) => p.name)).toEqual(["WR One"]);
    });
});

describe("get_projections free-agent pricing", () => {
    test("nulls the FA salary and offers auction values as the bid anchor", async () => {
        // A free agent's league_prices row is a $1 placeholder, not a price —
        // emitting it as `salary` reads as a number to bid against.
        mockDraftSharksMap.mockResolvedValue({
            p2: { ds_auction_value: 34, market_auction_value: 29 },
        });
        const body = payload(await tool("get_projections").handler({ team_name: "FA" }));
        const fa = (body.players as Record<string, unknown>[])[0];
        expect(fa.name).toBe("WR One");
        expect(fa.is_free_agent).toBe(true);
        expect(fa.salary).toBeNull();
        expect(fa.fantasy_team).toBe("FA");
        expect(fa.auction_value).toBe(34);
        expect(fa.market_auction_value).toBe(29);
        expect(body.salary_note).toContain("salary is null for free agents");
    });

    test("leaves a rostered player's real salary intact", async () => {
        const body = payload(await tool("get_projections").handler({ position: "QB" }));
        const rostered = (body.players as Record<string, unknown>[])[0];
        expect(rostered.is_free_agent).toBe(false);
        expect(rostered.salary).toBe(40);
    });

    test("reports null auction values rather than omitting the fields", async () => {
        const body = payload(await tool("get_projections").handler({ team_name: "FA" }));
        const fa = (body.players as Record<string, unknown>[])[0];
        expect(fa.auction_value).toBeNull();
        expect(fa.market_auction_value).toBeNull();
    });
});

describe("search_players free-agent pricing", () => {
    test("nulls the salary for an unrostered player", async () => {
        mockPlayerList.mockResolvedValue([
            makeListItem({ id: "p1", name: "Rostered Guy", team_name: "Team A", price: 12 }),
            makeListItem({ id: "p2", name: "Unrostered Guy", team_name: null, price: 1 }),
        ]);
        const body = payload(await tool("search_players").handler({ query: "guy" }));
        const byName = Object.fromEntries(
            (body.players as { name: string }[]).map((p) => [p.name, p as Record<string, unknown>])
        );
        expect(byName["Rostered Guy"].salary).toBe(12);
        expect(byName["Unrostered Guy"].salary).toBeNull();
        expect(byName["Unrostered Guy"].is_free_agent).toBe(true);
    });
});

describe("get_league_overview season framing", () => {
    beforeEach(() => {
        mockActiveModel.mockResolvedValue(null);
    });

    test("says in as many words that games have not started", async () => {
        mockSeasonContext.mockResolvedValue({
            ...SEASON_CTX,
            phase: "pre_draft",
            deadlines: { regular_season_start: "2026-09-04" },
        });
        const body = payload(await tool("get_league_overview").handler({}));
        const ctx = body.season_context as Record<string, unknown>;
        expect(ctx.in_season).toBe(false);
        expect(ctx.regular_season_start).toBe("2026-09-04");
        expect(ctx.framing).toContain("PRE-SEASON");
        expect(ctx.framing).toContain("2026-09-04");
        // An aggregator claiming a current week must be overridable.
        expect(ctx.framing).toContain("stale or misconfigured");
        expect(body.as_of_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("switches to weekly framing once the season is underway", async () => {
        mockSeasonContext.mockResolvedValue({ ...SEASON_CTX, phase: "in_season" });
        const body = payload(await tool("get_league_overview").handler({}));
        const ctx = body.season_context as Record<string, unknown>;
        expect(ctx.in_season).toBe(true);
        expect(ctx.framing).toContain("underway");
    });

    test("tells the agent the auction is done once the phase is post_draft", async () => {
        mockSeasonContext.mockResolvedValue({
            ...SEASON_CTX,
            phase: "post_draft",
            deadlines: { auction_date: "2026-08-22", regular_season_start: "2026-09-04" },
        });
        const body = payload(await tool("get_league_overview").handler({}));
        const ctx = body.season_context as Record<string, unknown>;
        expect(ctx.in_season).toBe(false);
        expect(ctx.framing).toContain("PRE-SEASON");
        expect(ctx.framing).toContain("COMPLETE");
        // Pointing an agent at auction prep after the auction is stale advice.
        expect(ctx.framing).not.toContain("auction/keeper prep");
    });

    test("still frames pre-season when the calendar has no kickoff date", async () => {
        mockSeasonContext.mockResolvedValue({ ...SEASON_CTX, phase: "pre_keeper", deadlines: {} });
        const body = payload(await tool("get_league_overview").handler({}));
        const ctx = body.season_context as Record<string, unknown>;
        expect(ctx.regular_season_start).toBeNull();
        expect(ctx.framing).toContain("has not opened yet");
    });
});

describe("get_player_values", () => {
    test("returns surplus players sorted by dollar value with limit applied", async () => {
        mockEndOfSeason.mockResolvedValue(buildPool());
        const body = payload(await tool("get_player_values").handler({ limit: 5 }));
        const players = body.players as { dollar_value: number; surplus: number; salary: number }[];
        expect(players).toHaveLength(5);
        const values = players.map((p) => p.dollar_value);
        expect(values).toEqual([...values].sort((a, b) => b - a));
        for (const p of players) {
            expect(p.surplus).toBe(p.dollar_value - p.salary);
        }
    });
});

describe("get_arbitration_analysis", () => {
    test("excludes the requested team from the target pool", async () => {
        mockPreArb.mockResolvedValue(buildPool());
        const body = payload(
            await tool("get_arbitration_analysis").handler({ exclude_team: "Team 0" })
        );
        const targets = body.targets as { fantasy_team: string }[];
        expect(targets.length).toBeGreaterThan(0);
        expect(targets.every((t) => t.fantasy_team !== "Team 0")).toBe(true);
    });

    test("uses pre-arbitration salaries (fetchPlayersPreArb)", async () => {
        mockPreArb.mockResolvedValue(buildPool());
        await tool("get_arbitration_analysis").handler({});
        expect(mockPreArb).toHaveBeenCalled();
        expect(mockEndOfSeason).not.toHaveBeenCalled();
    });
});

describe("get_weekly_projections", () => {
    function weeklyRow(overrides: Record<string, unknown> = {}) {
        return {
            player_id: "p1",
            season: 2025,
            week: 3,
            source: "sleeper",
            opponent: "LAC",
            projected_points: 14.2,
            projected_stats: { rushing_yards: 82, receptions: 3 },
            actual_points: null,
            actual_stats: null,
            projected_at: "2025-09-17T11:00:00Z",
            name: "Some Player",
            position: "RB",
            nfl_team: "KC",
            ...overrides,
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        mockDisplayWeeks.mockResolvedValue({ season: 2025, upcoming: 3, previous: 2 });
        mockWeeklyAsOf.mockResolvedValue("2025-09-17T11:00:00Z");
        mockAvailableWeeks.mockResolvedValue([3, 2, 1]);
        mockPlayerList.mockResolvedValue([makeListItem({ id: "p1", price: 23, team_name: "Team A" })]);
        mockWeeklyBoard.mockResolvedValue([weeklyRow()]);
    });

    it("defaults to the upcoming week", async () => {
        const body = payload(await tool("get_weekly_projections").handler({}));
        expect(body.week).toBe(3);
        expect(body.season).toBe(2025);
        expect(mockWeeklyBoard).toHaveBeenCalledWith(2025, 3);
    });

    it("honours an explicit week", async () => {
        await tool("get_weekly_projections").handler({ week: 1 });
        expect(mockWeeklyBoard).toHaveBeenCalledWith(2025, 1);
    });

    it("carries source, as_of and scoring provenance", async () => {
        const body = payload(await tool("get_weekly_projections").handler({}));
        expect(body.source).toBe("sleeper");
        expect(body.as_of).toBe("2025-09-17T11:00:00Z");
        expect(body.scoring).toBe("ottoneu_half_ppr");
    });

    it("tells a consuming agent not to confuse it with the seasonal model", async () => {
        const body = payload(await tool("get_weekly_projections").handler({}));
        expect(String(body.note)).toContain("get_projections");
    });

    it("reports per-game points, never a per-game-average PPG field", async () => {
        const body = payload(await tool("get_weekly_projections").handler({}));
        const player = (body.players as Record<string, unknown>[])[0];
        expect(player.projected_points).toBe(14.2);
        // The seasonal tool's field name must not leak into this payload — the
        // distinct names are what keep the two numbers from being compared.
        expect(player).not.toHaveProperty("projected_ppg");
    });

    it("joins salary and fantasy team from the roster", async () => {
        const body = payload(await tool("get_weekly_projections").handler({}));
        const player = (body.players as Record<string, unknown>[])[0];
        expect(player.salary).toBe(23);
        expect(player.fantasy_team).toBe("Team A");
        expect(player.is_free_agent).toBe(false);
    });

    it("nulls the salary for a free agent", async () => {
        mockPlayerList.mockResolvedValue([makeListItem({ id: "p1", price: 5, team_name: null })]);
        const body = payload(await tool("get_weekly_projections").handler({}));
        const player = (body.players as Record<string, unknown>[])[0];
        expect(player.salary).toBeNull();
        expect(player.is_free_agent).toBe(true);
    });

    it("filters by position", async () => {
        mockWeeklyBoard.mockResolvedValue([
            weeklyRow({ position: "RB" }),
            weeklyRow({ player_id: "p2", position: "WR", name: "Wide Out" }),
        ]);
        const body = payload(await tool("get_weekly_projections").handler({ position: "WR" }));
        expect(body.count).toBe(1);
        expect((body.players as Record<string, unknown>[])[0].name).toBe("Wide Out");
    });

    it("filters by min_points", async () => {
        mockWeeklyBoard.mockResolvedValue([
            weeklyRow({ projected_points: 14.2 }),
            weeklyRow({ player_id: "p2", name: "Scrub", projected_points: 3.1 }),
        ]);
        const body = payload(await tool("get_weekly_projections").handler({ min_points: 10 }));
        expect(body.count).toBe(1);
    });

    it("filters to free agents with team_name FA", async () => {
        mockPlayerList.mockResolvedValue([
            makeListItem({ id: "p1", team_name: null }),
            makeListItem({ id: "p2", team_name: "Team A" }),
        ]);
        mockWeeklyBoard.mockResolvedValue([
            weeklyRow({ player_id: "p1", name: "Waiver Guy" }),
            weeklyRow({ player_id: "p2", name: "Rostered Guy" }),
        ]);
        const body = payload(await tool("get_weekly_projections").handler({ team_name: "FA" }));
        expect((body.players as Record<string, unknown>[]).map((p) => p.name)).toEqual([
            "Waiver Guy",
        ]);
    });

    it("surfaces the actual result once a week has been played", async () => {
        mockWeeklyBoard.mockResolvedValue([weeklyRow({ actual_points: 18.6 })]);
        const body = payload(await tool("get_weekly_projections").handler({}));
        expect((body.players as Record<string, unknown>[])[0].actual_points).toBe(18.6);
    });

    it("falls back to the last week once the regular season is over", async () => {
        mockDisplayWeeks.mockResolvedValue({ season: 2025, upcoming: null, previous: 18 });
        await tool("get_weekly_projections").handler({});
        expect(mockWeeklyBoard).toHaveBeenCalledWith(2025, 18);
    });

    it("explains itself rather than returning an empty list out of season", async () => {
        mockWeeklyBoard.mockResolvedValue([]);
        const result = await tool("get_weekly_projections").handler({});
        expect(result.content[0].text).toContain("ingested during the NFL season");
    });
});

describe("get_player weekly context", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSeasonContext.mockResolvedValue(SEASON_CTX);
        mockPlayerDetail.mockResolvedValue({
            id: "p1",
            ottoneu_id: 100,
            name: "Some Player",
            position: "RB",
            nfl_team: "KC",
            birth_date: null,
            price: 23,
            team_name: "Team A",
            seasonStats: [],
            transactions: [],
        } as never);
        mockPlayerProjection.mockResolvedValue({ projected_ppg: 11.8, projection_method: "v33" });
        mockDraftSharks.mockResolvedValue(null);
        mockDisplayWeeks.mockResolvedValue({ season: 2025, upcoming: 3, previous: 2 });
    });

    it("nests weekly rows separately from the seasonal projection", async () => {
        mockPlayerWeekly.mockResolvedValue(
            new Map([
                [3, { week: 3, source: "sleeper", projected_points: 14.2, actual_points: null,
                      opponent: "LAC", projected_at: "2025-09-17T11:00:00Z" } as never],
                [2, { week: 2, source: "sleeper", projected_points: 12.0, actual_points: 19.4,
                      opponent: "DEN", projected_at: "2025-09-10T11:00:00Z" } as never],
            ]),
        );
        const body = payload(await tool("get_player").handler({ ottoneu_id: 100 }));

        // The seasonal model stays where it was, in its own units.
        expect((body.projection as Record<string, unknown>).projected_ppg).toBe(11.8);

        const weekly = body.weekly_projections as Record<string, Record<string, unknown>>;
        expect(weekly.upcoming.projected_points).toBe(14.2);
        // Last week keeps its projection next to what actually happened.
        expect(weekly.previous.projected_points).toBe(12.0);
        expect(weekly.previous.actual_points).toBe(19.4);
    });

    it("marks a week with no row as a bye or inactive rather than zero", async () => {
        mockPlayerWeekly.mockResolvedValue(new Map());
        const body = payload(await tool("get_player").handler({ ottoneu_id: 100 }));
        const weekly = body.weekly_projections as Record<string, Record<string, unknown>>;
        expect(weekly.upcoming.projection).toBeNull();
        expect(String(weekly.upcoming.note)).toContain("bye or inactive");
    });
});
