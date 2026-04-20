/**
 * Unit tests for surplus.ts — dollar valuation and keep/cut classification.
 */
import {
    analyzeProjectedSalary,
    calculateSurplus,
    computeDollarPerVorp,
} from "@/lib/surplus";
import { MY_TEAM } from "@/lib/config";
import type { Player } from "@/lib/types";

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

/**
 * Build a realistic-ish player pool so VORP has a non-zero replacement level
 * and positive-VORP players exist for dollar allocation.
 */
function buildPool(): Player[] {
    const pool: Player[] = [];
    // 30 RBs: top 10 are star/value, bottom 20 spread across the replacement tier.
    for (let i = 0; i < 30; i++) {
        pool.push(
            makePlayer({
                player_id: `rb${i}`,
                position: "RB",
                team_name: `Team ${i % 12}`,
                price: i < 10 ? 40 + i : 1 + i,
                ppg: i < 10 ? 18 + i * 0.3 : 6 + (i - 10) * 0.2,
                games_played: 16,
                total_points: ((i < 10 ? 18 + i * 0.3 : 6 + (i - 10) * 0.2) as number) * 16,
            })
        );
    }
    return pool;
}

describe("calculateSurplus", () => {
    test("returns empty array for empty input", () => {
        expect(calculateSurplus([])).toEqual([]);
    });

    test("returns empty array when no players have positive VORP", () => {
        // All players identical → zero VORP for everyone → no positive VORP pool.
        const players: Player[] = Array.from({ length: 5 }, (_, i) =>
            makePlayer({
                player_id: `x${i}`,
                position: "RB",
                ppg: 10,
                games_played: 16,
                total_points: 160,
            })
        );
        expect(calculateSurplus(players)).toEqual([]);
    });

    test("assigns dollar_value ≥ 1 even to players with zero or negative VORP", () => {
        const players = buildPool();
        const result = calculateSurplus(players);
        for (const p of result) {
            expect(p.dollar_value).toBeGreaterThanOrEqual(1);
        }
    });

    test("surplus = dollar_value - price", () => {
        const players = buildPool();
        const result = calculateSurplus(players);
        for (const p of result) {
            expect(p.surplus).toBe(p.dollar_value - p.price);
        }
    });

    test("negative surplus when price exceeds dollar value", () => {
        const players = buildPool();
        // Add a player who's paid $80 but performs at near-replacement level.
        players.push(
            makePlayer({
                player_id: "overpriced",
                position: "RB",
                team_name: "Team A",
                price: 80,
                ppg: 6.5,
                games_played: 16,
                total_points: 104,
            })
        );
        const result = calculateSurplus(players);
        const overpriced = result.find((p) => p.player_id === "overpriced");
        expect(overpriced).toBeDefined();
        expect(overpriced!.surplus).toBeLessThan(0);
    });

    test("applies optional per-player adjustment", () => {
        const players = buildPool();
        const baseline = calculateSurplus(players);
        const baselinePlayer = baseline.find((p) => p.player_id === "rb0")!;

        const adjustments = new Map<string, number>([["rb0", 5]]);
        const adjusted = calculateSurplus(players, adjustments);
        const adjustedPlayer = adjusted.find((p) => p.player_id === "rb0")!;

        expect(adjustedPlayer.dollar_value).toBe(baselinePlayer.dollar_value + 5);
    });
});

describe("computeDollarPerVorp", () => {
    test("returns 0 when no positive VORP exists", () => {
        expect(computeDollarPerVorp([])).toBe(0);
    });

    test("returns a positive rate for a normal pool", () => {
        expect(computeDollarPerVorp(buildPool())).toBeGreaterThan(0);
    });
});

describe("analyzeProjectedSalary", () => {
    test("returns empty array when MY_TEAM has no roster", () => {
        const players = buildPool(); // uses "Team 0" … "Team 11", not MY_TEAM
        expect(analyzeProjectedSalary(players)).toEqual([]);
    });

    test("classifies players based on surplus thresholds", () => {
        // Seed a pool and attach one player to MY_TEAM for each tier.
        const pool = buildPool();
        pool.push(
            makePlayer({
                player_id: "keep_strong",
                position: "RB",
                team_name: MY_TEAM,
                price: 1, // cheap star → high surplus
                ppg: 25,
                games_played: 16,
                total_points: 400,
            }),
            makePlayer({
                player_id: "cut",
                position: "RB",
                team_name: MY_TEAM,
                price: 80, // overpaid → very negative surplus
                ppg: 6,
                games_played: 16,
                total_points: 96,
            })
        );
        const result = analyzeProjectedSalary(pool);
        const valid = new Set(["Strong Keep", "Keep", "Borderline", "Cut Candidate"]);
        for (const p of result) {
            expect(valid.has(p.recommendation)).toBe(true);
        }
        expect(result.find((p) => p.player_id === "keep_strong")!.recommendation).toBe(
            "Strong Keep"
        );
        expect(result.find((p) => p.player_id === "cut")!.recommendation).toBe(
            "Cut Candidate"
        );
    });
});
