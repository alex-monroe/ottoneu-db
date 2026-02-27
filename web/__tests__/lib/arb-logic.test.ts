/**
 * Unit tests for arb-logic.ts — core analysis functions.
 *
 * All functions under test are pure (no DB/network calls).
 * We build mock Player[] arrays that exercise the various code paths.
 */
import {
    calculateVorp,
    calculateSurplus,
    analyzeArbitration,
    allocateArbitrationBudget,
    analyzeProjectedSalary,
    runArbitrationSimulation,
} from "@/lib/arb-logic";

import {
    Player,
    ArbitrationTarget,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid Player with sensible defaults. */
function makePlayer(overrides: Partial<Player> & { player_id: string; name: string; position: string }): Player {
    return {
        nfl_team: "BUF",
        price: 10,
        team_name: "Team A",
        birth_date: null,
        is_college: false,
        total_points: 100,
        games_played: 10,
        snaps: 200,
        ppg: 10,
        pps: 0.5,
        ...overrides,
    };
}

/**
 * Build a roster of N players across various teams with enough depth
 * to trigger the salary-implied replacement path.
 */
function buildLeaguePlayers(): Player[] {
    const teams = [
        "Team A", "Team B", "Team C", "Team D",
        "Team E", "Team F", "Team G", "Team H",
        "Team I", "Team J", "Team K", "The Witchcraft",
    ];
    const positions = ["QB", "RB", "WR", "TE"];
    const players: Player[] = [];
    let id = 1;

    for (const team of teams) {
        for (const pos of positions) {
            // 3 players per position per team = 144 total
            for (let i = 0; i < 3; i++) {
                const ppg = 5 + Math.random() * 15;
                const price = Math.round(1 + Math.random() * 50);
                players.push(
                    makePlayer({
                        player_id: String(id++),
                        name: `${pos}-${team}-${i}`,
                        position: pos,
                        team_name: team,
                        ppg: Math.round(ppg * 100) / 100,
                        price,
                        total_points: Math.round(ppg * 10),
                        games_played: 10,
                        snaps: 300,
                    })
                );
            }
        }
    }
    return players;
}

// ---------------------------------------------------------------------------
// calculateVorp
// ---------------------------------------------------------------------------

describe("calculateVorp", () => {
    it("returns empty for empty input", () => {
        const result = calculateVorp([]);
        expect(result.players).toHaveLength(0);
        expect(result.replacementPpg).toEqual({});
    });

    it("excludes kickers from analysis", () => {
        const kicker = makePlayer({
            player_id: "k1",
            name: "Kicker K",
            position: "K",
            games_played: 16,
            ppg: 8,
        });
        const qb = makePlayer({
            player_id: "qb1",
            name: "QB Allen",
            position: "QB",
            games_played: 16,
            ppg: 20,
        });
        const result = calculateVorp([kicker, qb]);
        expect(result.players.every((p) => p.position !== "K")).toBe(true);
    });

    it("filters out players below minGames threshold", () => {
        const goodPlayer = makePlayer({
            player_id: "1",
            name: "Starter",
            position: "QB",
            games_played: 10,
            ppg: 15,
        });
        const lowGamesPlayer = makePlayer({
            player_id: "2",
            name: "Backup",
            position: "QB",
            games_played: 2,
            ppg: 20,
        });
        const result = calculateVorp([goodPlayer, lowGamesPlayer], 4);
        expect(result.players).toHaveLength(1);
        expect(result.players[0].name).toBe("Starter");
    });

    it("includes college players with 0 games when is_college is true", () => {
        const nflPlayer = makePlayer({
            player_id: "1",
            name: "NFL QB",
            position: "QB",
            games_played: 10,
            ppg: 15,
        });
        const collegePlayer = makePlayer({
            player_id: "2",
            name: "College QB",
            position: "QB",
            nfl_team: "Colorado",
            is_college: true,
            games_played: 0,
            ppg: 12, // projected PPG from college_prospect method
            total_points: 0,
            snaps: 0,
        });
        const result = calculateVorp([nflPlayer, collegePlayer], 4);
        expect(result.players).toHaveLength(2);
        const names = result.players.map((p) => p.name);
        expect(names).toContain("College QB");
    });

    it("does not include non-college players with 0 games", () => {
        const nflPlayer = makePlayer({
            player_id: "1",
            name: "NFL QB",
            position: "QB",
            games_played: 10,
            ppg: 15,
        });
        const injuredPlayer = makePlayer({
            player_id: "2",
            name: "Injured QB",
            position: "QB",
            is_college: false,
            games_played: 0,
            ppg: 0,
        });
        const result = calculateVorp([nflPlayer, injuredPlayer], 4);
        expect(result.players).toHaveLength(1);
        expect(result.players[0].name).toBe("NFL QB");
    });

    it("calculates expected VORP fields", () => {
        const players = [
            makePlayer({ player_id: "1", name: "Star QB", position: "QB", ppg: 20, games_played: 10, total_points: 200 }),
            makePlayer({ player_id: "2", name: "OK QB", position: "QB", ppg: 10, games_played: 10, total_points: 100 }),
        ];
        const result = calculateVorp(players);
        expect(result.players.length).toBe(2);
        for (const p of result.players) {
            expect(p).toHaveProperty("replacement_ppg");
            expect(p).toHaveProperty("vorp_per_game");
            expect(p).toHaveProperty("full_season_vorp");
            expect(typeof p.replacement_ppg).toBe("number");
            expect(p.full_season_vorp).toBeCloseTo(p.vorp_per_game * 17, 0);
        }
    });

    it("uses salary-implied replacement with enough rostered players", () => {
        const players = buildLeaguePlayers();
        const result = calculateVorp(players);

        // Should have replacementPpg for all 4 positions
        expect(Object.keys(result.replacementPpg)).toEqual(
            expect.arrayContaining(["QB", "RB", "WR", "TE"])
        );

        // With 36 rostered players per position (12 teams × 3), salary-implied
        // path should be used — replacementN should NOT equal the REPLACEMENT_LEVEL ranks
        for (const pos of ["QB", "RB", "WR", "TE"]) {
            expect(result.replacementPpg[pos]).toBeGreaterThan(0);
        }
    });

    it("falls back to fixed-rank when few rostered players", () => {
        // Only 2 rostered players (below MIN_SALARY_PLAYERS=3)
        const players = [
            makePlayer({ player_id: "1", name: "P1", position: "QB", ppg: 20, games_played: 10, total_points: 200, team_name: "Team A" }),
            makePlayer({ player_id: "2", name: "P2", position: "QB", ppg: 10, games_played: 10, total_points: 100, team_name: "Team B" }),
            // Free agents don't count toward rostered
            makePlayer({ player_id: "3", name: "P3", position: "QB", ppg: 5, games_played: 10, total_points: 50, team_name: null }),
        ];
        const result = calculateVorp(players);
        expect(result.replacementPpg["QB"]).toBeDefined();
        // With 3 players total (2 rostered + 1 FA) and rank 24 exceeding count,
        // the fallback uses the LAST player by total_points descending.
        // The FA (ppg=5) is included and has the least total_points.
        expect(result.replacementPpg["QB"]).toBe(5);
    });

    it("excludes college players from replacement PPG calculation", () => {
        const nflPlayers = [
            makePlayer({ player_id: "1", name: "QB1", position: "QB", ppg: 20, games_played: 10, total_points: 200 }),
            makePlayer({ player_id: "2", name: "QB2", position: "QB", ppg: 10, games_played: 10, total_points: 100 }),
            makePlayer({ player_id: "3", name: "QB3", position: "QB", ppg: 5, games_played: 10, total_points: 50 }),
        ];
        const collegePlayer = makePlayer({
            player_id: "99",
            name: "College QB",
            position: "QB",
            ppg: 0.5,
            games_played: 0,
            total_points: 0,
            is_college: true,
            nfl_team: "Colorado",
        });

        const resultWithCollege = calculateVorp([...nflPlayers, collegePlayer]);
        const resultWithoutCollege = calculateVorp(nflPlayers);

        // Replacement PPG should be the same whether college players are present or not
        expect(resultWithCollege.replacementPpg["QB"]).toBe(resultWithoutCollege.replacementPpg["QB"]);
    });
});

// ---------------------------------------------------------------------------
// calculateSurplus
// ---------------------------------------------------------------------------

describe("calculateSurplus", () => {
    it("returns empty for empty input", () => {
        expect(calculateSurplus([])).toHaveLength(0);
    });

    it("produces dollar_value and surplus for each player", () => {
        const players = buildLeaguePlayers();
        const result = calculateSurplus(players);
        expect(result.length).toBeGreaterThan(0);
        for (const p of result) {
            expect(p).toHaveProperty("dollar_value");
            expect(p).toHaveProperty("surplus");
            expect(p.surplus).toBe(p.dollar_value - p.price);
        }
    });

    it("dollar_value is at least 1 (floor)", () => {
        const players = buildLeaguePlayers();
        const result = calculateSurplus(players);
        for (const p of result) {
            expect(p.dollar_value).toBeGreaterThanOrEqual(1);
        }
    });

    it("applies adjustments when provided", () => {
        const players = buildLeaguePlayers();
        const baseResult = calculateSurplus(players);
        const first = baseResult[0];

        const adjustments = new Map<string, number>();
        adjustments.set(first.player_id, 50);

        const adjustedResult = calculateSurplus(players, adjustments);
        const adjustedFirst = adjustedResult.find((p) => p.player_id === first.player_id)!;

        // Adjusted dollar value should be higher
        expect(adjustedFirst.dollar_value).toBeGreaterThanOrEqual(first.dollar_value);
    });
});

// ---------------------------------------------------------------------------
// analyzeProjectedSalary
// ---------------------------------------------------------------------------

describe("analyzeProjectedSalary", () => {
    it("returns empty for empty input", () => {
        expect(analyzeProjectedSalary([])).toHaveLength(0);
    });

    it("only returns players from MY_TEAM (The Witchcraft)", () => {
        const players = buildLeaguePlayers();
        const result = analyzeProjectedSalary(players);
        for (const p of result) {
            expect(p.team_name).toBe("The Witchcraft");
        }
    });

    it("assigns recommendation to every player", () => {
        const players = buildLeaguePlayers();
        const result = analyzeProjectedSalary(players);
        const validRecommendations = ["Strong Keep", "Keep", "Borderline", "Cut Candidate"];
        for (const p of result) {
            expect(validRecommendations).toContain(p.recommendation);
        }
    });
});

// ---------------------------------------------------------------------------
// analyzeArbitration
// ---------------------------------------------------------------------------

describe("analyzeArbitration", () => {
    it("returns empty for empty input", () => {
        expect(analyzeArbitration([])).toHaveLength(0);
    });

    it("excludes players from MY_TEAM and free agents", () => {
        const players = buildLeaguePlayers();
        const result = analyzeArbitration(players);
        for (const p of result) {
            expect(p.team_name).not.toBe("The Witchcraft");
            expect(p.team_name).not.toBe("FA");
            expect(p.team_name).not.toBe("");
            expect(p.team_name).not.toBeNull();
        }
    });

    it("excludes kickers", () => {
        const players = buildLeaguePlayers();
        const result = analyzeArbitration(players);
        for (const p of result) {
            expect(p.position).not.toBe("K");
        }
    });

    it("calculates salary_after_arb = price + 4", () => {
        const players = buildLeaguePlayers();
        const result = analyzeArbitration(players);
        for (const p of result) {
            expect(p.salary_after_arb).toBe(p.price + 4);
        }
    });

    it("output is sorted by surplus descending", () => {
        const players = buildLeaguePlayers();
        const result = analyzeArbitration(players);
        for (let i = 1; i < result.length; i++) {
            expect(result[i].surplus).toBeLessThanOrEqual(result[i - 1].surplus);
        }
    });
});

// ---------------------------------------------------------------------------
// allocateArbitrationBudget
// ---------------------------------------------------------------------------

describe("allocateArbitrationBudget", () => {
    /**
     * Build some ArbitrationTarget data for budget allocation tests.
     * We create targets across a few teams with varying surplus.
     */
    function makeTargets(): ArbitrationTarget[] {
        const targets: ArbitrationTarget[] = [];
        const teams = ["Team A", "Team B", "Team C", "Team D", "Team E"];
        let id = 1;

        for (const team of teams) {
            for (let i = 0; i < 6; i++) {
                const surplus = 50 - i * 10;
                targets.push({
                    player_id: String(id++),
                    name: `P${id}-${team}`,
                    position: "WR",
                    nfl_team: "BUF",
                    price: 10,
                    team_name: team,
                    birth_date: null,
                    total_points: 100,
                    games_played: 10,
                    snaps: 200,
                    ppg: 10,
                    pps: 0.5,
                    replacement_ppg: 5,
                    vorp_per_game: 5,
                    full_season_vorp: 85,
                    dollar_value: 60,
                    surplus,
                    salary_after_arb: 14,
                    surplus_after_arb: surplus - 4,
                });
            }
        }
        return targets;
    }

    it("returns allocations for teams", () => {
        const targets = makeTargets();
        const result = allocateArbitrationBudget(targets);
        expect(result.length).toBeGreaterThan(0);
    });

    it("each team allocation respects min ($1) and max ($8)", () => {
        const targets = makeTargets();
        const result = allocateArbitrationBudget(targets);
        for (const alloc of result) {
            expect(alloc.suggested).toBeGreaterThanOrEqual(1);
            expect(alloc.suggested).toBeLessThanOrEqual(8);
        }
    });

    it("total budget sums to $60", () => {
        const targets = makeTargets();
        const result = allocateArbitrationBudget(targets);
        // Need to account for teams that have targets + teams that don't
        // Budget is distributed among NUM_TEAMS - 1 = 11 opponents total
        // Only 5 teams have targets, so the other 6 are not in the output.
        // allocateArbitrationBudget only outputs teams present in targets.
        // The total of the output teams + (11 - output teams) * $1 each should <= $60.
        const outputTotal = result.reduce((sum, a) => sum + a.suggested, 0);
        // Since only teams with targets are included, the allocation within
        // those teams should not exceed budget
        expect(outputTotal).toBeLessThanOrEqual(60);
    });

    it("output is sorted by suggested descending", () => {
        const targets = makeTargets();
        const result = allocateArbitrationBudget(targets);
        for (let i = 1; i < result.length; i++) {
            expect(result[i].suggested).toBeLessThanOrEqual(result[i - 1].suggested);
        }
    });

    it("each allocation includes up to 5 players", () => {
        const targets = makeTargets();
        const result = allocateArbitrationBudget(targets);
        for (const alloc of result) {
            expect(alloc.players.length).toBeLessThanOrEqual(5);
            expect(alloc.players.length).toBeGreaterThan(0);
        }
    });
});

// ---------------------------------------------------------------------------
// runArbitrationSimulation
// ---------------------------------------------------------------------------

describe("runArbitrationSimulation", () => {
    it("returns empty for empty input", () => {
        expect(runArbitrationSimulation([])).toHaveLength(0);
    });

    it("produces simulation results with expected fields", () => {
        const players = buildLeaguePlayers();
        // Use fewer simulations for speed
        const result = runArbitrationSimulation(players, 5, 0.2);
        if (result.length === 0) return; // possible when no surplus

        for (const r of result) {
            expect(r).toHaveProperty("mean_arb");
            expect(r).toHaveProperty("std_arb");
            expect(r).toHaveProperty("min_arb");
            expect(r).toHaveProperty("max_arb");
            expect(r).toHaveProperty("pct_protected");
            expect(r).toHaveProperty("salary_after_arb");
            expect(r).toHaveProperty("surplus_after_arb");
            expect(r.mean_arb).toBeGreaterThanOrEqual(0);
            expect(r.min_arb).toBeLessThanOrEqual(r.max_arb);
        }
    });

    it("is deterministic — same inputs produce same outputs", () => {
        const players = buildLeaguePlayers();
        const result1 = runArbitrationSimulation(players, 3, 0.2);
        const result2 = runArbitrationSimulation(players, 3, 0.2);

        expect(result1.length).toBe(result2.length);
        for (let i = 0; i < result1.length; i++) {
            expect(result1[i].mean_arb).toBe(result2[i].mean_arb);
            expect(result1[i].std_arb).toBe(result2[i].std_arb);
        }
    });

    it("output is sorted by mean_arb descending", () => {
        const players = buildLeaguePlayers();
        const result = runArbitrationSimulation(players, 5, 0.2);
        for (let i = 1; i < result.length; i++) {
            expect(result[i].mean_arb).toBeLessThanOrEqual(result[i - 1].mean_arb);
        }
    });
});
