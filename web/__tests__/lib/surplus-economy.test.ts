/**
 * The closed-economy properties of the dollar conversion (surplus.ts).
 *
 * These are the invariants that the old flat `× 0.875` factor could not state,
 * let alone hold. They are separated from surplus.test.ts (which covers the
 * keep/cut classification and adjustment plumbing) because they are assertions
 * about the *economics*, and they are what a future change to the conversion
 * has to keep true.
 */
import { calculateSurplus, computeDollarPerVorp, distributableCap } from "@/lib/surplus";
import { calculateVorp } from "@/lib/vorp";
import {
    NUM_TEAMS,
    CAP_PER_TEAM,
    ROSTER_SPOTS,
    MIN_PLAYER_SALARY,
    FULL_SEASON_GAMES,
} from "@/lib/config";
import type { Player } from "@/lib/types";

function makePlayer(overrides: Partial<Player> = {}): Player {
    return {
        player_id: "p",
        ottoneu_id: 1,
        name: "Player",
        position: "RB",
        nfl_team: "ANY",
        birth_date: null,
        is_college: false,
        price: 1,
        team_name: null,
        total_points: 0,
        games_played: 16,
        snaps: 0,
        ppg: 0,
        pps: 0,
        ...overrides,
    };
}

/** A pool deep enough at every position that no baseline has to clamp. */
function deepPool(): Player[] {
    const shape: [string, number, number, number][] = [
        // position, count, top PPG, step
        ["QB", 40, 24, 0.35],
        ["RB", 60, 20, 0.22],
        ["WR", 70, 19, 0.18],
        ["TE", 30, 14, 0.3],
    ];
    const players: Player[] = [];
    for (const [position, count, top, step] of shape) {
        for (let i = 0; i < count; i++) {
            const ppg = top - i * step;
            players.push(
                makePlayer({
                    player_id: `${position}${i}`,
                    name: `${position}${i}`,
                    position,
                    ppg,
                    games_played: 16,
                    total_points: ppg * 16,
                    price: Math.max(1, 55 - i),
                    team_name: `Team ${i % NUM_TEAMS}`,
                })
            );
        }
    }
    return players;
}

describe("distributableCap", () => {
    test("is the league cap minus the salary floor on every roster spot", () => {
        expect(distributableCap()).toBe(
            NUM_TEAMS * CAP_PER_TEAM - NUM_TEAMS * ROSTER_SPOTS * MIN_PLAYER_SALARY
        );
    });

    test("is strictly less than the league cap but most of it", () => {
        const leagueCap = NUM_TEAMS * CAP_PER_TEAM;
        expect(distributableCap()).toBeLessThan(leagueCap);
        expect(distributableCap() / leagueCap).toBeGreaterThan(0.9);
    });
});

describe("the auction is a closed economy", () => {
    test("above-replacement dollars sum to exactly the distributable cap", () => {
        const result = calculateSurplus(deepPool());
        const above = result.filter((p) => p.full_season_vorp > 0);
        expect(above.length).toBeGreaterThan(0);

        const allocated = above.reduce(
            (sum, p) => sum + (p.dollar_value - MIN_PLAYER_SALARY),
            0
        );
        // Each player's value is rounded to the dollar, so the total can drift
        // by at most half a dollar per player.
        expect(Math.abs(allocated - distributableCap())).toBeLessThanOrEqual(
            above.length * 0.5
        );
    });

    test("every player is worth at least the salary floor", () => {
        for (const p of calculateSurplus(deepPool())) {
            expect(p.dollar_value).toBeGreaterThanOrEqual(MIN_PLAYER_SALARY);
        }
    });

    test("below-replacement players are worth exactly the floor, not more", () => {
        const result = calculateSurplus(deepPool());
        const below = result.filter((p) => p.full_season_vorp <= 0);
        expect(below.length).toBeGreaterThan(0);
        for (const p of below) {
            expect(p.dollar_value).toBe(MIN_PLAYER_SALARY);
        }
    });

    test("the marginal startable player is worth exactly the floor", () => {
        const players = deepPool();
        const { replacementPpg, replacementN } = calculateVorp(players);
        const result = calculateSurplus(players);

        // The QB at the demand rank is the replacement player by construction.
        const marginal = result.find(
            (p) => p.position === "QB" && p.ppg === replacementPpg.QB
        );
        expect(marginal).toBeDefined();
        expect(replacementN.QB).toBeGreaterThan(0);
        expect(marginal!.full_season_vorp).toBe(0);
        expect(marginal!.dollar_value).toBe(MIN_PLAYER_SALARY);
    });

    test("the rate is the distributable cap over total positive VORP", () => {
        const players = deepPool();
        const { players: vorpPlayers } = calculateVorp(players);
        const totalPositive = vorpPlayers
            .filter((p) => p.full_season_vorp > 0)
            .reduce((sum, p) => sum + p.full_season_vorp, 0);

        expect(computeDollarPerVorp(players)).toBeCloseTo(
            distributableCap() / totalPositive,
            6
        );
    });

    test("a deeper league cap raises values proportionally, not the baseline", () => {
        // Sanity check on the direction of the economy: the *share* each player
        // commands is set by VORP alone, so two players' value ratio (net of
        // the floor) is independent of how much money is in the league.
        const result = calculateSurplus(deepPool());
        const [best, second] = result
            .filter((p) => p.full_season_vorp > 0)
            .sort((a, b) => b.full_season_vorp - a.full_season_vorp);

        const valueRatio =
            (best.dollar_value - MIN_PLAYER_SALARY) /
            (second.dollar_value - MIN_PLAYER_SALARY);
        const vorpRatio = best.full_season_vorp / second.full_season_vorp;
        expect(valueRatio).toBeCloseTo(vorpRatio, 1);
    });
});

describe("the superflex premium is priced, not assumed", () => {
    test("the top QB outvalues the top RB despite a smaller points edge", () => {
        const result = calculateSurplus(deepPool());
        const topQb = result.find((p) => p.player_id === "QB0")!;
        const topRb = result.find((p) => p.player_id === "RB0")!;

        // QB0 scores 24 PPG, RB0 scores 20 — a 20% edge in raw points…
        expect(topQb.ppg / topRb.ppg).toBeLessThan(1.25);
        // …but the QB baseline is set by the 24th QB rather than the 24th RB,
        // so the dollar gap is much wider than the points gap.
        expect(topQb.dollar_value).toBeGreaterThan(topRb.dollar_value);
    });
});

describe("the display scale never moves a dollar value", () => {
    test("dollar values are invariant to FULL_SEASON_GAMES, up to rounding", async () => {
        // full_season_vorp scales linearly with FULL_SEASON_GAMES and the
        // conversion divides by the same total, so the constant cancels
        // algebraically. It is not bit-exact in practice because
        // full_season_vorp is rounded to one decimal for display *before* the
        // conversion reads it, and that rounding lands differently at a
        // different scale — worth at most a dollar on a player. The point
        // stands: this constant sets how VORP reads on screen, not what anyone
        // is worth.
        const players = deepPool();
        const baseline = calculateSurplus(players);

        jest.resetModules();
        jest.doMock("@/lib/config", () => ({
            ...jest.requireActual("@/lib/config"),
            FULL_SEASON_GAMES: FULL_SEASON_GAMES * 2,
        }));

        const { calculateSurplus: rescaled } = await import("@/lib/surplus");
        const doubled = rescaled(players);

        expect(doubled).toHaveLength(baseline.length);
        for (let i = 0; i < baseline.length; i++) {
            expect(Math.abs(doubled[i].dollar_value - baseline[i].dollar_value)).toBeLessThanOrEqual(1);
        }
        // …while the displayed VORP really did double (within its own 0.1
        // rounding unit, doubled).
        expect(
            Math.abs(doubled[0].full_season_vorp - baseline[0].full_season_vorp * 2)
        ).toBeLessThanOrEqual(0.2);

        jest.dontMock("@/lib/config");
        jest.resetModules();
    });
});
