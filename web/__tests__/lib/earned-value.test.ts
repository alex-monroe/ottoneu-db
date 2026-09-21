/**
 * Unit tests for earned-value.ts — the retrospective ("Player Rater") half of
 * the valuation system.
 *
 * The property that matters most here, and the one that separates this from
 * `surplus.ts`, is that **availability is observed rather than modelled**: two
 * players with identical per-game rates must not earn the same money if one of
 * them only played half a season.
 */
import {
    computeEarnedValue,
    calculateEarnedValue,
    computeDollarPerEarnedPoint,
    type EarnedValueInput,
} from "@/lib/earned-value";
import { distributableCap } from "@/lib/surplus";
import { allocateLineupDemand } from "@/lib/replacement";
import { buildStatWindow, fullSeasonWindow } from "@/lib/stat-window";
import { MIN_PLAYER_SALARY, NUM_TEAMS, STARTING_LINEUP, FLEX_SLOTS } from "@/lib/config";
import type { Player } from "@/lib/types";

function row(overrides: Partial<EarnedValueInput> = {}): EarnedValueInput {
    return { position: "RB", total_points: 0, price: 1, ...overrides };
}

/** A season's worth of finishers, deep enough that no baseline clamps. */
function seasonPool(): EarnedValueInput[] {
    const shape: [string, number, number, number][] = [
        ["QB", 40, 400, 5],
        ["RB", 60, 320, 4],
        ["WR", 70, 300, 3],
        ["TE", 30, 220, 6],
    ];
    const rows: EarnedValueInput[] = [];
    for (const [position, count, top, step] of shape) {
        for (let i = 0; i < count; i++) {
            rows.push(row({ position, total_points: top - i * step, price: Math.max(1, 50 - i) }));
        }
    }
    return rows;
}

describe("computeEarnedValue — availability is observed, not modelled", () => {
    test("a half-season at a star rate earns far less than a full one", () => {
        const pool = seasonPool();
        // Two RBs at the same 20 PPG rate; one played 17 games, one played 8.
        const full = row({ position: "RB", total_points: 340, price: 40 });
        const half = row({ position: "RB", total_points: 160, price: 40 });

        const priced = computeEarnedValue([...pool, full, half]);
        const [fullOut, halfOut] = priced.slice(-2);

        expect(fullOut.total_points).toBe(340);
        expect(halfOut.total_points).toBe(160);
        expect(halfOut.earned_value).toBeLessThan(fullOut.earned_value);
        // And the injured one is a negative return on a $40 salary.
        expect(halfOut.realized_surplus).toBeLessThan(0);
        expect(fullOut.realized_surplus).toBeGreaterThan(0);
    });

    test("no minimum-games filter — a three-game player is still priced", () => {
        const pool = seasonPool();
        const cameo = row({ position: "WR", total_points: 45, price: 1 });
        const priced = computeEarnedValue([...pool, cameo]);
        expect(priced).toHaveLength(pool.length + 1);
        expect(priced[priced.length - 1].total_points).toBe(45);
    });
});

describe("computeEarnedValue — the economy matches the projected path", () => {
    test("above-replacement dollars sum to the distributable cap", () => {
        const priced = computeEarnedValue(seasonPool());
        const above = priced.filter((p) => p.points_above_replacement > 0);
        expect(above.length).toBeGreaterThan(0);

        const allocated = above.reduce(
            (sum, p) => sum + (p.earned_value - MIN_PLAYER_SALARY),
            0
        );
        expect(Math.abs(allocated - distributableCap())).toBeLessThanOrEqual(
            above.length * 0.5
        );
    });

    test("below-replacement players earn exactly the salary floor", () => {
        const priced = computeEarnedValue(seasonPool());
        const below = priced.filter((p) => p.points_above_replacement <= 0);
        expect(below.length).toBeGreaterThan(0);
        for (const p of below) {
            expect(p.earned_value).toBe(MIN_PLAYER_SALARY);
        }
    });

    test("uses the same flex-aware baseline as the projected path", () => {
        const pool = seasonPool();
        const priced = computeEarnedValue(pool);

        // The baseline must be the QB sitting at the allocator's demand rank —
        // the same allocator vorp.ts uses, so a projected-vs-earned comparison
        // measures the forecast rather than a difference in method.
        const qbPoints = pool
            .filter((r) => r.position === "QB")
            .map((r) => r.total_points)
            .sort((a, b) => b - a);
        const demand = allocateLineupDemand({
            QB: qbPoints,
            RB: pool.filter((r) => r.position === "RB").map((r) => r.total_points),
            WR: pool.filter((r) => r.position === "WR").map((r) => r.total_points),
            TE: pool.filter((r) => r.position === "TE").map((r) => r.total_points),
        });

        const qb = priced.find((p) => p.position === "QB")!;
        expect(qb.replacement_points).toBe(qbPoints[demand.QB - 1]);
        // Superflex still puts QB demand at or above two per team.
        expect(demand.QB).toBeGreaterThanOrEqual(
            NUM_TEAMS * (STARTING_LINEUP.QB + FLEX_SLOTS)
        );
    });

    test("realized surplus is earned value minus the salary paid", () => {
        for (const p of computeEarnedValue(seasonPool())) {
            expect(p.realized_surplus).toBe(p.earned_value - p.price);
        }
    });
});

describe("computeEarnedValue — pool construction", () => {
    test("excludes kickers", () => {
        const priced = computeEarnedValue([
            ...seasonPool(),
            row({ position: "K", total_points: 180, price: 1 }),
        ]);
        expect(priced.some((p) => p.position === "K")).toBe(false);
    });

    test("excludes college prospects, who have no NFL production to price", () => {
        const priced = computeEarnedValue([
            ...seasonPool(),
            row({ position: "RB", total_points: 0, price: 0, is_college: true }),
        ]);
        expect(priced).toHaveLength(seasonPool().length);
    });

    test("empty input returns empty", () => {
        expect(computeEarnedValue([])).toEqual([]);
    });

    test("a degenerate pool with nobody above replacement returns empty", () => {
        const flat = Array.from({ length: 40 }, () =>
            row({ position: "RB", total_points: 100, price: 1 })
        );
        expect(computeEarnedValue(flat)).toEqual([]);
    });

    test("preserves the caller's fields", () => {
        const priced = computeEarnedValue([
            ...seasonPool(),
            { position: "WR", total_points: 290, price: 12, name: "Tagged" } as EarnedValueInput & {
                name: string;
            },
        ]);
        const tagged = priced.find((p) => "name" in p && p.name === "Tagged");
        expect(tagged).toBeDefined();
        expect(tagged!.price).toBe(12);
    });
});

describe("calculateEarnedValue over full Player rows", () => {
    test("accepts what fetchPlayersEndOfSeason returns", () => {
        const players: Player[] = seasonPool().map((r, i) => ({
            player_id: `p${i}`,
            ottoneu_id: i,
            name: `P${i}`,
            position: r.position,
            nfl_team: "ANY",
            birth_date: null,
            is_college: false,
            price: r.price,
            team_name: `Team ${i % NUM_TEAMS}`,
            total_points: r.total_points,
            games_played: 16,
            snaps: 0,
            ppg: r.total_points / 16,
            pps: 0,
        }));

        const priced = calculateEarnedValue(players);
        expect(priced.length).toBe(players.length);
        expect(priced[0].name).toBe("P0");
        expect(priced[0].earned_value).toBeGreaterThan(MIN_PLAYER_SALARY);
    });
});

describe("computeDollarPerEarnedPoint", () => {
    test("is the distributable cap over total points above replacement", () => {
        const pool = seasonPool();
        const priced = computeEarnedValue(pool);
        const totalPositive = priced
            .filter((p) => p.points_above_replacement > 0)
            .reduce((sum, p) => sum + p.points_above_replacement, 0);

        expect(computeDollarPerEarnedPoint(pool)).toBeCloseTo(
            distributableCap() / totalPositive,
            6
        );
    });

    test("returns 0 on an empty pool", () => {
        expect(computeDollarPerEarnedPoint([])).toBe(0);
    });
});

describe("computeEarnedValue — a season in progress", () => {
    /**
     * These guard the two claims the in-season view rests on:
     *
     *   1. A window covering a full season is a **strict no-op**, so the
     *      retrospective pages cannot change behaviour.
     *   2. Prorating scales both sides by the same factor, so the ranking and the
     *      sign of `realized_surplus` never move — only the units. That is what
     *      makes the small dollar figures in week 2 safe to read, and it is why
     *      `return_on_salary` is scale-free.
     */
    const week2 = buildStatWindow({
        season: 2026,
        complete: false,
        gamesPlayed: Array(50).fill(2),
    });

    /** Two weeks of the same pool: everybody's totals scaled to 2 of 17 games. */
    function partialPool(): EarnedValueInput[] {
        const f = week2.fraction;
        return seasonPool().map((r) => ({ ...r, total_points: r.total_points * f }));
    }

    test("a full-season window changes nothing", () => {
        const pool = seasonPool();
        const plain = computeEarnedValue(pool);
        const windowed = computeEarnedValue(pool, fullSeasonWindow(2025));
        expect(windowed.map((p) => p.earned_value)).toEqual(
            plain.map((p) => p.earned_value),
        );
        expect(windowed.map((p) => p.realized_surplus)).toEqual(
            plain.map((p) => p.realized_surplus),
        );
        // Over a finished season "paid so far" is simply the salary.
        for (const p of windowed) expect(p.salary_to_date).toBe(p.price);
    });

    test("prorates the pot, so two weeks hand out two weeks of money", () => {
        const priced = computeEarnedValue(partialPool(), week2);
        const total = priced.reduce((sum, p) => sum + p.earned_value, 0);
        const fullSeason = computeEarnedValue(seasonPool()).reduce(
            (sum, p) => sum + p.earned_value,
            0,
        );
        // Not exact: every row is rounded to cents, and there are hundreds of
        // them. Within a tenth of a percent of the prorated pot is the claim.
        const expected = fullSeason * week2.fraction;
        expect(Math.abs(total - expected) / expected).toBeLessThan(0.001);
    });

    test("prorates the salary to match, so the comparison stays like-for-like", () => {
        const priced = computeEarnedValue(partialPool(), week2);
        const dear = priced.find((p) => p.price === 50)!;
        // A $50 player has cost his owner 2/17 of $50 so far, not $50.
        expect(dear.salary_to_date).toBeCloseTo(50 * week2.fraction, 1);
        expect(dear.salary_to_date).toBeLessThan(dear.price);
    });

    test("the sign of realized surplus is unchanged by prorating", () => {
        // The whole design rests on this: `fraction` only rescales, so nobody
        // crosses from beating their price to missing it because of the window —
        // which is also why a little imprecision from bye weeks cannot mislead.
        const full = computeEarnedValue(seasonPool());
        const partial = computeEarnedValue(partialPool(), week2);
        let checked = 0;
        for (let i = 0; i < full.length; i++) {
            // A player who broke exactly even over the season is a coin toss at
            // cent precision, and "he is within a dollar of his price" is not a
            // claim this guards. Everyone else must land on the same side.
            if (Math.abs(full[i].realized_surplus) < 1) continue;
            checked++;
            expect(Math.sign(partial[i].realized_surplus)).toBe(
                Math.sign(full[i].realized_surplus),
            );
        }
        expect(checked).toBeGreaterThan(50);
    });

    test("return on salary is the same number at any window", () => {
        const full = computeEarnedValue(seasonPool());
        const partial = computeEarnedValue(partialPool(), week2);
        const priced = full
            .map((p, i) => [p, partial[i]] as const)
            .filter(([f]) => f.price > 1);
        expect(priced.length).toBeGreaterThan(10);
        for (const [f, p] of priced) {
            // Both are taken from unrounded dollars, so this is exact bar the
            // final round to two places.
            expect(p.return_on_salary!).toBeCloseTo(f.return_on_salary!, 1);
        }
    });

    test("an unpriced spot has no return rather than an infinite one", () => {
        const priced = computeEarnedValue(
            [...seasonPool(), row({ position: "RB", total_points: 200, price: 0 })],
            week2,
        );
        expect(priced[priced.length - 1].return_on_salary).toBeNull();
    });

    test("a window with no football played prices nothing", () => {
        // Before kickoff, or before the stats pull has run. Handing out a full
        // season's cap over an empty table is the failure to avoid.
        const empty = buildStatWindow({ season: 2026, complete: false, gamesPlayed: [] });
        expect(computeEarnedValue(seasonPool(), empty)).toEqual([]);
    });

    test("keeps a decimal mid-season, whole dollars once the season is done", () => {
        const partial = computeEarnedValue(partialPool(), week2);
        // Prorating a $1 floor to a fortnight would round the entire bottom of
        // the board to $0 if these were whole dollars.
        expect(partial.some((p) => !Number.isInteger(p.earned_value))).toBe(true);
        // The salary floor has to stay visible rather than rounding away to $0.
        expect(partial.every((p) => p.earned_value > 0)).toBe(true);
        const full = computeEarnedValue(seasonPool(), fullSeasonWindow(2025));
        expect(full.every((p) => Number.isInteger(p.earned_value))).toBe(true);
    });
});
