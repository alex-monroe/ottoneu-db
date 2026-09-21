/**
 * Unit tests for replacement.ts — the lineup-derived, flex-aware baseline.
 *
 * The headline property under test is that nobody types a positional
 * adjustment anywhere: the superflex QB premium has to fall out of counting
 * lineup slots, or the whole construction is just a magic number wearing a
 * different hat.
 */
import {
    allocateLineupDemand,
    computeReplacementLevels,
    valueAtRank,
} from "@/lib/replacement";
import {
    NUM_TEAMS,
    STARTING_LINEUP,
    FLEX_SLOTS,
    BENCH_DEPTH_PER_TEAM,
} from "@/lib/config";

/** Slots per team that the greedy allocator hands out beyond the dedicated ones. */
const CONTESTED_PER_TEAM = FLEX_SLOTS + BENCH_DEPTH_PER_TEAM;
/** Every non-kicker slot the league fills. */
const TOTAL_SLOTS =
    NUM_TEAMS *
    ((["QB", "RB", "WR", "TE"] as const).reduce((sum, pos) => sum + STARTING_LINEUP[pos], 0) +
        CONTESTED_PER_TEAM);

/** A descending run of `n` values starting at `top`, stepping down by `step`. */
function ramp(n: number, top: number, step: number): number[] {
    return Array.from({ length: n }, (_, i) => top - i * step);
}

/**
 * A pool shaped like a real superflex league: QBs score far more than skill
 * players, so the superflex slots should go to them.
 */
function leaguePool() {
    return {
        // 24 startable quarterbacks, then a cliff — the shape of a real
        // superflex pool, where demand (24) outruns startable supply.
        QB: [...ramp(24, 400, 4), ...ramp(16, 100, 2)],
        RB: ramp(60, 300, 4),
        WR: ramp(70, 290, 3),
        TE: ramp(30, 200, 5),
    };
}

describe("allocateLineupDemand", () => {
    test("superflex slots go to QB, producing 2 starting QBs per team", () => {
        const demand = allocateLineupDemand(leaguePool());
        // 12 dedicated + 12 superflex = 24, the number the format's economics
        // are built on (docs/references/ottoneu-strategy.md §3). The 25th QB
        // is off the cliff, so the depth slots go elsewhere.
        expect(demand.QB).toBe(NUM_TEAMS * (STARTING_LINEUP.QB + FLEX_SLOTS));
    });

    test("depth slots go to the positions with the best players left", () => {
        const demand = allocateLineupDemand(leaguePool());
        // RB and WR are still deep where QB has run out, so they absorb the
        // bench slots; TE (worst marginal player) gets none.
        expect(demand.RB).toBeGreaterThan(NUM_TEAMS * STARTING_LINEUP.RB);
        expect(demand.WR).toBeGreaterThan(NUM_TEAMS * STARTING_LINEUP.WR);
        expect(demand.TE).toBe(NUM_TEAMS * STARTING_LINEUP.TE);
    });

    test("total demand equals every non-kicker slot the league fills", () => {
        const demand = allocateLineupDemand(leaguePool());
        const total = Object.values(demand).reduce((a, b) => a + b, 0);
        expect(total).toBe(TOTAL_SLOTS);
    });

    test("flex follows value — weak QBs send the slots to RB/WR instead", () => {
        // Quarterbacks fall off after the top 12: the one-QB-league shape, in
        // which the flex should stop being a QB slot.
        const pool = { ...leaguePool(), QB: [...ramp(12, 400, 4), ...ramp(28, 120, 2)] };
        const demand = allocateLineupDemand(pool);
        expect(demand.QB).toBe(NUM_TEAMS * STARTING_LINEUP.QB);
        expect(demand.RB + demand.WR + demand.TE).toBe(
            TOTAL_SLOTS - NUM_TEAMS * STARTING_LINEUP.QB
        );
    });

    test("positions absent from the pool get no demand", () => {
        const demand = allocateLineupDemand({ RB: ramp(80, 300, 2) });
        expect(demand.QB).toBeUndefined();
        expect(demand.TE).toBeUndefined();
        // The lone position absorbs every contested slot.
        expect(demand.RB).toBe(
            NUM_TEAMS * (STARTING_LINEUP.RB + CONTESTED_PER_TEAM)
        );
    });

    test("kickers never enter the allocation (they are filtered upstream)", () => {
        const demand = allocateLineupDemand(leaguePool());
        expect(demand.K).toBeUndefined();
    });

    test("stops early rather than over-allocating an exhausted pool", () => {
        // Two QBs total, nothing else: demand cannot exceed what exists plus
        // the dedicated slots, and the loop must terminate.
        const demand = allocateLineupDemand({ QB: [100, 90] });
        expect(Number.isFinite(demand.QB)).toBe(true);
        expect(demand.QB).toBeGreaterThanOrEqual(NUM_TEAMS * STARTING_LINEUP.QB);
    });

    test("does not require the caller to pre-sort", () => {
        const sorted = allocateLineupDemand(leaguePool());
        const shuffled = allocateLineupDemand({
            QB: [...leaguePool().QB].reverse(),
            RB: [...leaguePool().RB].reverse(),
            WR: [...leaguePool().WR].reverse(),
            TE: [...leaguePool().TE].reverse(),
        });
        expect(shuffled).toEqual(sorted);
    });

    test("scales with league size", () => {
        const demand = allocateLineupDemand(leaguePool(), 10);
        const total = Object.values(demand).reduce((a, b) => a + b, 0);
        // A smaller league fills fewer slots, so the pool of players worth
        // owning shrinks and every baseline gets easier to clear.
        expect(total).toBe((TOTAL_SLOTS / NUM_TEAMS) * 10);
        expect(total).toBeLessThan(TOTAL_SLOTS);
        // The elite quarterbacks are still the best marginal players, so they
        // keep taking contested slots even though fewer are dedicated to them.
        expect(demand.QB).toBeGreaterThan(10 * STARTING_LINEUP.QB);
    });
});

describe("computeReplacementLevels", () => {
    test("the baseline is the value at the demand rank", () => {
        const pool = leaguePool();
        const { level, rank } = computeReplacementLevels(pool);
        // QB24 in a descending ramp starting at 400, step 4 → 400 − 23×4.
        expect(rank.QB).toBe(24);
        expect(level.QB).toBe(400 - 23 * 4);
        // TE takes no depth slots, so its baseline is the 12th tight end.
        expect(rank.TE).toBe(NUM_TEAMS * STARTING_LINEUP.TE);
        expect(level.TE).toBe(200 - 11 * 5);
    });

    test("the marginal startable player sits exactly at replacement", () => {
        const pool = leaguePool();
        const { level, rank } = computeReplacementLevels(pool);
        for (const pos of Object.keys(pool) as (keyof typeof pool)[]) {
            const descending = [...pool[pos]].sort((a, b) => b - a);
            expect(descending[rank[pos] - 1]).toBe(level[pos]);
        }
    });

    test("a pool shallower than demand clamps to the worst player", () => {
        // Only 5 tight ends exist but the league wants 12.
        const { level, rank } = computeReplacementLevels({ TE: ramp(5, 200, 10) });
        expect(rank.TE).toBeGreaterThan(5);
        expect(level.TE).toBe(200 - 4 * 10); // the worst of the five
    });

    test("an empty pool has no replacement level", () => {
        expect(computeReplacementLevels({}).level).toEqual({});
    });
});

describe("valueAtRank", () => {
    test("is 1-indexed", () => {
        expect(valueAtRank([30, 20, 10], 1)).toBe(30);
        expect(valueAtRank([30, 20, 10], 3)).toBe(10);
    });

    test("clamps out-of-range ranks instead of returning undefined", () => {
        expect(valueAtRank([30, 20, 10], 0)).toBe(30);
        expect(valueAtRank([30, 20, 10], 99)).toBe(10);
    });

    test("an empty pool reads as 0", () => {
        expect(valueAtRank([], 5)).toBe(0);
    });
});
