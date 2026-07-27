/**
 * Unit tests for lib/mcp/arb.ts — perspective-parameterized arbitration targets.
 */
import { analyzeArbTargets } from "@/lib/mcp/arb";
import { analyzeArbitration } from "@/lib/arbitration";
import { calculateSurplus } from "@/lib/surplus";
import { ARB_MAX_PER_PLAYER_PER_TEAM, MY_TEAM } from "@/lib/config";
import type { Player, SurplusPlayer } from "@/lib/types";

function makeSurplusPlayer(overrides: Partial<SurplusPlayer> = {}): SurplusPlayer {
    return {
        player_id: overrides.player_id ?? "p",
        ottoneu_id: 1,
        name: overrides.name ?? "Player",
        position: overrides.position ?? "RB",
        nfl_team: "ANY",
        birth_date: null,
        is_college: false,
        price: overrides.price ?? 10,
        team_name: overrides.team_name ?? "Team A",
        total_points: 0,
        games_played: 16,
        snaps: 0,
        ppg: overrides.ppg ?? 10,
        pps: 0,
        replacement_ppg: 5,
        vorp_per_game: 5,
        full_season_vorp: 85,
        dollar_value: overrides.dollar_value ?? 30,
        surplus: overrides.surplus ?? 20,
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

describe("analyzeArbTargets", () => {
    test("applies the max single-team raise to salary and surplus", () => {
        const [target] = analyzeArbTargets([
            makeSurplusPlayer({ price: 10, dollar_value: 30, surplus: 20 }),
        ]);
        expect(target.salary_after_arb).toBe(10 + ARB_MAX_PER_PLAYER_PER_TEAM);
        expect(target.surplus_after_arb).toBe(30 - (10 + ARB_MAX_PER_PLAYER_PER_TEAM));
    });

    test("keeps only the danger zone: surplus ≥ -10 and dollar_value > 1", () => {
        const targets = analyzeArbTargets([
            makeSurplusPlayer({ player_id: "keep", surplus: -10, dollar_value: 20 }),
            makeSurplusPlayer({ player_id: "too-negative", surplus: -11, dollar_value: 20 }),
            makeSurplusPlayer({ player_id: "worthless", surplus: 5, dollar_value: 1 }),
        ]);
        expect(targets.map((t) => t.player_id)).toEqual(["keep"]);
    });

    test("excludes kickers, free agents, and the excluded team's roster", () => {
        const targets = analyzeArbTargets(
            [
                makeSurplusPlayer({ player_id: "kicker", position: "K" }),
                makeSurplusPlayer({ player_id: "fa", team_name: "FA" }),
                makeSurplusPlayer({ player_id: "unrostered", team_name: null }),
                makeSurplusPlayer({ player_id: "mine", team_name: "My Squad" }),
                makeSurplusPlayer({ player_id: "opponent", team_name: "Rival" }),
            ],
            "My Squad",
        );
        expect(targets.map((t) => t.player_id)).toEqual(["opponent"]);
    });

    test("includes every rostered team when no team is excluded", () => {
        const targets = analyzeArbTargets([
            makeSurplusPlayer({ player_id: "a", team_name: "Team A" }),
            makeSurplusPlayer({ player_id: "b", team_name: "Team B" }),
        ]);
        expect(targets).toHaveLength(2);
    });

    test("sorts by surplus descending", () => {
        const targets = analyzeArbTargets([
            makeSurplusPlayer({ player_id: "low", surplus: 5 }),
            makeSurplusPlayer({ player_id: "high", surplus: 25 }),
        ]);
        expect(targets.map((t) => t.player_id)).toEqual(["high", "low"]);
    });

    test("matches analyzeArbitration when excluding MY_TEAM", () => {
        // Realistic pool: enough RBs for a replacement level, spread across teams.
        const pool: Player[] = [];
        for (let i = 0; i < 40; i++) {
            pool.push(
                makePlayer({
                    player_id: `rb${i}`,
                    position: "RB",
                    team_name: i % 3 === 0 ? MY_TEAM : `Team ${i % 12}`,
                    price: i < 12 ? 35 + i : 1 + i,
                    ppg: i < 12 ? 16 + i * 0.4 : 5 + (i - 12) * 0.2,
                    games_played: 16,
                    total_points: (i < 12 ? 16 + i * 0.4 : 5 + (i - 12) * 0.2) * 16,
                })
            );
        }
        const surplus = calculateSurplus(pool);
        const viaMcp = analyzeArbTargets(surplus, MY_TEAM);
        const viaSite = analyzeArbitration(pool);
        expect(viaMcp.map((t) => t.player_id)).toEqual(viaSite.map((t) => t.player_id));
        expect(viaMcp.map((t) => t.surplus_after_arb)).toEqual(
            viaSite.map((t) => t.surplus_after_arb)
        );
    });
});
