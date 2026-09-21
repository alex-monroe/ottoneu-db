/**
 * Tests for fetchEarnedValueBySeason / fetchPlayerEarnedValue.
 *
 * The behaviour worth pinning is that each season is priced as its own closed
 * economy: replacement level in 2021 must not be contaminated by 2025's pool,
 * and a player's earned value in a season depends on who else played that year.
 */
import {
    fetchEarnedValueBySeason,
    fetchPlayerEarnedValue,
} from "@/lib/earned-value-data";
import { MIN_PLAYER_SALARY } from "@/lib/config";

const mockFetchAllRows = jest.fn();

jest.mock("@/lib/supabase", () => ({
    supabase: { from: jest.fn(() => ({ select: jest.fn(() => ({})) })) },
    fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
}));

/** A season's worth of finishers at one position, descending. */
function ramp(prefix: string, position: string, n: number, top: number, step: number) {
    return Array.from({ length: n }, (_, i) => ({
        player_id: `${prefix}-${position}${i}`,
        position,
        total_points: top - i * step,
    }));
}

function seasonPool(prefix: string) {
    return [
        ...ramp(prefix, "QB", 40, 400, 5),
        ...ramp(prefix, "RB", 60, 320, 4),
        ...ramp(prefix, "WR", 70, 300, 3),
        ...ramp(prefix, "TE", 30, 220, 6),
    ];
}

/**
 * Wire the two paginated reads the module performs, in order: players, then
 * player_stats.
 */
function mockDb(rows: { player_id: string; position: string; total_points: number; season: number }[]) {
    const players = [...new Map(rows.map((r) => [r.player_id, r])).values()].map((r) => ({
        id: r.player_id,
        position: r.position,
        is_college: false,
    }));
    const stats = rows.map((r) => ({
        player_id: r.player_id,
        season: r.season,
        total_points: r.total_points,
    }));
    mockFetchAllRows.mockReset();
    mockFetchAllRows.mockResolvedValueOnce(players).mockResolvedValueOnce(stats);
}

describe("fetchEarnedValueBySeason", () => {
    test("returns an entry per requested season", async () => {
        mockDb([
            ...seasonPool("p").map((r) => ({ ...r, season: 2024 })),
            ...seasonPool("p").map((r) => ({ ...r, season: 2025 })),
        ]);
        const out = await fetchEarnedValueBySeason([2024, 2025]);
        expect([...out.keys()].sort()).toEqual([2024, 2025]);
        expect(out.get(2024)!.size).toBeGreaterThan(0);
    });

    test("prices each season as its own closed economy", async () => {
        // 2025 is a far higher-scoring environment than 2024. The same
        // *positional rank* should earn roughly the same money in both, because
        // each season is normalised against its own pool — earned value is a
        // share of a fixed pot, not an absolute points-to-dollars rate.
        mockDb([
            ...seasonPool("p").map((r) => ({ ...r, season: 2024 })),
            ...seasonPool("p").map((r) => ({
                ...r,
                season: 2025,
                total_points: r.total_points * 2,
            })),
        ]);
        const out = await fetchEarnedValueBySeason([2024, 2025]);
        const a = out.get(2024)!.get("p-QB0")!.earned_value;
        const b = out.get(2025)!.get("p-QB0")!.earned_value;
        expect(b).toBeGreaterThan(a * 0.8);
        expect(b).toBeLessThan(a * 1.25);
    });

    test("a season's replacement level is set by that season's pool", async () => {
        // 2024 has a deep quarterback pool; 2025 has the same top QB but a
        // collapsed field behind him, so his edge over replacement is larger.
        mockDb([
            ...seasonPool("p").map((r) => ({ ...r, season: 2024 })),
            ...seasonPool("p")
                .map((r) => ({ ...r, season: 2025 }))
                .map((r) =>
                    r.position === "QB" && r.player_id !== "p-QB0"
                        ? { ...r, total_points: 100 }
                        : r,
                ),
        ]);
        const out = await fetchEarnedValueBySeason([2024, 2025]);
        expect(out.get(2025)!.get("p-QB0")!.replacement_points).toBeLessThan(
            out.get(2024)!.get("p-QB0")!.replacement_points,
        );
    });

    test("empty season list short-circuits without querying", async () => {
        mockFetchAllRows.mockReset();
        const out = await fetchEarnedValueBySeason([]);
        expect(out.size).toBe(0);
        expect(mockFetchAllRows).not.toHaveBeenCalled();
    });

    test("stats rows with no matching player are skipped, not crashed on", async () => {
        mockFetchAllRows.mockReset();
        mockFetchAllRows
            .mockResolvedValueOnce([{ id: "known", position: "RB", is_college: false }])
            .mockResolvedValueOnce([
                { player_id: "known", season: 2025, total_points: 200 },
                { player_id: "orphan", season: 2025, total_points: 999 },
            ]);
        const out = await fetchEarnedValueBySeason([2025]);
        expect(out.get(2025)?.has("orphan")).toBeFalsy();
    });

    test("below-replacement finishers earn the salary floor", async () => {
        mockDb(seasonPool("p").map((r) => ({ ...r, season: 2025 })));
        const out = await fetchEarnedValueBySeason([2025]);
        // The very worst wide receiver on the board is nowhere near startable.
        expect(out.get(2025)!.get("p-WR69")!.earned_value).toBe(MIN_PLAYER_SALARY);
    });
});

describe("fetchPlayerEarnedValue", () => {
    test("narrows to one player across seasons", async () => {
        mockDb([
            ...seasonPool("p").map((r) => ({ ...r, season: 2024 })),
            ...seasonPool("p").map((r) => ({ ...r, season: 2025 })),
        ]);
        const out = await fetchPlayerEarnedValue("p-RB0", [2024, 2025]);
        expect([...out.keys()].sort()).toEqual([2024, 2025]);
        expect(out.get(2024)!.earned_value).toBeGreaterThan(MIN_PLAYER_SALARY);
    });

    test("omits seasons the player has no row for", async () => {
        mockDb(seasonPool("p").map((r) => ({ ...r, season: 2025 })));
        const out = await fetchPlayerEarnedValue("p-RB0", [2024, 2025]);
        expect(out.has(2024)).toBe(false);
        expect(out.has(2025)).toBe(true);
    });

    test("an unknown player yields nothing rather than throwing", async () => {
        mockDb(seasonPool("p").map((r) => ({ ...r, season: 2025 })));
        const out = await fetchPlayerEarnedValue("nobody", [2025]);
        expect(out.size).toBe(0);
    });
});
