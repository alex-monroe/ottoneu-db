/**
 * Unit tests for data.ts — the unified data-access layer.
 *
 * Uses a chainable, per-table Supabase mock. Each call to `supabase.from(table)`
 * returns a query builder that records query options and resolves to the
 * pre-seeded `{ data, error }` payload for that table. The builder is
 * thenable so `await supabase.from(...).select(...).eq(...)` works.
 */

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

type TableResult = { data: unknown; error: unknown };
const tableResults = new Map<string, TableResult>();
const terminalMap = new Map<string, "single" | "maybeSingle" | null>();

function setTable(
    table: string,
    data: unknown,
    opts: { error?: unknown; terminal?: "single" | "maybeSingle" } = {}
) {
    tableResults.set(table, { data, error: opts.error ?? null });
    terminalMap.set(table, opts.terminal ?? null);
}

function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = (fn: string) =>
        jest.fn((..._args: unknown[]) => {
            void _args;
            void fn;
            return builder;
        });
    builder.select = chain("select");
    builder.eq = chain("eq");
    builder.gt = chain("gt");
    builder.lte = chain("lte");
    builder.order = chain("order");

    const result = () => {
        const entry = tableResults.get(table);
        if (!entry) return Promise.resolve({ data: null, error: null });
        return Promise.resolve(entry);
    };
    builder.single = jest.fn(result);
    builder.maybeSingle = jest.fn(result);
    builder.then = (
        onFulfilled: (v: TableResult) => unknown,
        onRejected?: (e: unknown) => unknown
    ) => result().then(onFulfilled, onRejected);
    return builder;
}

jest.mock("@/lib/supabase", () => ({
    supabase: {
        from: jest.fn((table: string) => makeBuilder(table)),
    },
}));

// Imports AFTER the mock so data.ts binds to the mocked supabase.
import {
    fetchPlayers,
    fetchPlayerList,
    fetchPlayersAtDate,
    fetchPlayerDetail,
    fetchPublicArbPlayers,
    fetchPlayerProjection,
} from "@/lib/data";

beforeEach(() => {
    tableResults.clear();
    terminalMap.clear();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const playerRows = [
    {
        id: "p1",
        ottoneu_id: 100,
        name: "Josh Allen",
        position: "QB",
        nfl_team: "BUF",
        birth_date: "1996-05-21",
        is_college: false,
    },
    {
        id: "p2",
        ottoneu_id: 200,
        name: "Saquon Barkley",
        position: "RB",
        nfl_team: "PHI",
        birth_date: "1997-02-09",
        is_college: false,
    },
    // No stats for p3 — filtered out by fetchers that require stats.
    {
        id: "p3",
        ottoneu_id: 300,
        name: "No Stats Guy",
        position: "WR",
        nfl_team: "FA",
        birth_date: null,
        is_college: false,
    },
];

const statsRows = [
    { player_id: "p1", total_points: 300, games_played: 16, snaps: 1000, ppg: 18.75, pps: 0.3 },
    { player_id: "p2", total_points: 250, games_played: 15, snaps: 800, ppg: 16.67, pps: 0.31 },
];

const pricesRows = [
    { player_id: "p1", price: 45, team_name: "Team A" },
    { player_id: "p2", price: 30, team_name: "Team B" },
    { player_id: "p3", price: 1, team_name: null },
];

// ---------------------------------------------------------------------------
// fetchPlayers
// ---------------------------------------------------------------------------

describe("fetchPlayers", () => {
    test("joins players + stats + prices and drops players without stats", async () => {
        setTable("players", playerRows);
        setTable("player_stats", statsRows);
        setTable("league_prices", pricesRows);

        const result = await fetchPlayers();
        expect(result.map((p) => p.player_id).sort()).toEqual(["p1", "p2"]);

        const allen = result.find((p) => p.player_id === "p1")!;
        expect(allen).toMatchObject({
            name: "Josh Allen",
            position: "QB",
            total_points: 300,
            ppg: 18.75,
            price: 45,
            team_name: "Team A",
        });
    });

    test("throws when players query errors", async () => {
        setTable("players", null, { error: { message: "boom" } });
        setTable("player_stats", statsRows);
        setTable("league_prices", pricesRows);

        await expect(fetchPlayers()).rejects.toThrow(/Failed to fetch players/);
    });

    test("defaults price to 0 and team_name to null when prices row is missing", async () => {
        setTable("players", [playerRows[0]]);
        setTable("player_stats", [statsRows[0]]);
        setTable("league_prices", []);

        const [p] = await fetchPlayers();
        expect(p.price).toBe(0);
        expect(p.team_name).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// fetchPlayerList
// ---------------------------------------------------------------------------

describe("fetchPlayerList", () => {
    test("returns every player (including those without stats) with nullable fields", async () => {
        setTable("players", playerRows);
        setTable("player_stats", statsRows);
        setTable("league_prices", pricesRows);

        const result = await fetchPlayerList();
        expect(result.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3"]);

        const noStats = result.find((p) => p.id === "p3")!;
        expect(noStats.ppg).toBeNull();
        expect(noStats.total_points).toBeNull();
        expect(noStats.games_played).toBeNull();
        expect(noStats.price).toBe(1);
    });

    test("returns empty array when players query returns null data", async () => {
        setTable("players", null);
        setTable("player_stats", []);
        setTable("league_prices", []);
        expect(await fetchPlayerList()).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// fetchPlayersAtDate (covers buildSalaryMapAtDate via transaction replay)
// ---------------------------------------------------------------------------

describe("fetchPlayersAtDate / buildSalaryMapAtDate", () => {
    test("replays transactions to pick the salary at the cutoff date", async () => {
        setTable("players", [playerRows[0]]);
        setTable("player_stats", [statsRows[0]]);
        setTable("transactions", [
            {
                player_id: "p1",
                transaction_type: "Auction Won",
                team_name: "Team A",
                salary: 10,
                transaction_date: "2025-09-01",
            },
            {
                player_id: "p1",
                transaction_type: "Keep",
                team_name: "Team A",
                salary: 14, // +$4 end-of-season bump
                transaction_date: "2025-12-31",
            },
        ]);
        setTable("league_prices", [{ player_id: "p1", price: 999, team_name: "Team A" }]);

        const [p] = await fetchPlayersAtDate("2025-12-31");
        expect(p.price).toBe(14);
        expect(p.team_name).toBe("Team A");
    });

    test("cut transaction clears team_name and resets salary state", async () => {
        setTable("players", [playerRows[0]]);
        setTable("player_stats", [statsRows[0]]);
        setTable("transactions", [
            {
                player_id: "p1",
                transaction_type: "Auction Won",
                team_name: "Team A",
                salary: 20,
                transaction_date: "2025-09-01",
            },
            {
                player_id: "p1",
                transaction_type: "Cut",
                team_name: null,
                salary: 20,
                transaction_date: "2025-11-01",
            },
        ]);
        setTable("league_prices", []);

        const [p] = await fetchPlayersAtDate("2025-12-01");
        expect(p.team_name).toBeNull();
    });

    test("falls back to league_prices for players with no transaction history", async () => {
        setTable("players", [playerRows[1]]);
        setTable("player_stats", [statsRows[1]]);
        setTable("transactions", []);
        setTable("league_prices", [{ player_id: "p2", price: 1, team_name: "Team B" }]);

        const [p] = await fetchPlayersAtDate("2025-12-01");
        expect(p.price).toBe(1);
        expect(p.team_name).toBe("Team B");
    });
});

// ---------------------------------------------------------------------------
// fetchPlayerDetail
// ---------------------------------------------------------------------------

describe("fetchPlayerDetail", () => {
    test("returns null for unknown ottoneu_id", async () => {
        setTable("players", null);
        const result = await fetchPlayerDetail(99999);
        expect(result).toBeNull();
    });

    test("assembles season stats and transactions for an existing player", async () => {
        setTable("players", {
            id: "p1",
            ottoneu_id: 100,
            name: "Josh Allen",
            position: "QB",
            nfl_team: "BUF",
            birth_date: "1996-05-21",
        });
        setTable("player_stats", [
            { season: 2025, total_points: 300, games_played: 16, snaps: 1000, ppg: 18.75, pps: 0.3 },
            { season: 2024, total_points: 280, games_played: 15, snaps: 950, ppg: 18.67, pps: 0.29 },
        ]);
        setTable("league_prices", { price: 45, team_name: "Team A" });
        setTable("transactions", [
            {
                id: "t1",
                transaction_type: "Auction Won",
                team_name: "Team A",
                from_team: null,
                salary: 45,
                transaction_date: "2025-09-01",
                raw_description: null,
            },
        ]);

        const result = await fetchPlayerDetail(100);
        expect(result).not.toBeNull();
        expect(result!.name).toBe("Josh Allen");
        expect(result!.price).toBe(45);
        expect(result!.seasonStats).toHaveLength(2);
        expect(result!.transactions).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// fetchPublicArbPlayers
// ---------------------------------------------------------------------------

describe("fetchPublicArbPlayers", () => {
    test("only returns rostered players (team_name set and not FA)", async () => {
        setTable("players", playerRows);
        setTable("player_stats", [
            ...statsRows,
            { player_id: "p3", total_points: 0, games_played: 0, snaps: 0, ppg: 0, pps: 0 },
        ]);
        setTable("transactions", []);
        setTable("league_prices", [
            { player_id: "p1", price: 45, team_name: "Team A" },
            { player_id: "p2", price: 30, team_name: "Team B" },
            { player_id: "p3", price: 1, team_name: "FA" }, // excluded
        ]);

        const result = await fetchPublicArbPlayers();
        expect(result.map((p) => p.player_id).sort()).toEqual(["p1", "p2"]);
    });
});

// ---------------------------------------------------------------------------
// fetchPlayerProjection
// ---------------------------------------------------------------------------

describe("fetchPlayerProjection", () => {
    test("returns projected_ppg + method when a row exists", async () => {
        setTable(
            "player_projections",
            { projected_ppg: "17.5", projection_method: "weighted_average_ppg" },
            { terminal: "maybeSingle" }
        );

        const result = await fetchPlayerProjection("p1", 2026);
        expect(result).toEqual({
            projected_ppg: 17.5,
            projection_method: "weighted_average_ppg",
        });
    });

    test("returns null when no projection row exists", async () => {
        setTable("player_projections", null, { terminal: "maybeSingle" });
        const result = await fetchPlayerProjection("p1", 2026);
        expect(result).toBeNull();
    });

    test("returns null on query error", async () => {
        setTable("player_projections", null, {
            error: { message: "fail" },
            terminal: "maybeSingle",
        });
        const result = await fetchPlayerProjection("p1", 2026);
        expect(result).toBeNull();
    });
});
