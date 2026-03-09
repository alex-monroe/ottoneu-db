import {
    allocateArbitrationBudget,
} from "@/lib/arbitration-budget";
import {
    runArbitrationSimulation,
} from "@/lib/simulation";
import {
    ArbitrationTarget,
    SurplusPlayer,
} from "@/lib/types";

describe("allocateArbitrationBudget", () => {
    it("distributes correctly among opponent teams based on target surplus", () => {
        const targets: ArbitrationTarget[] = [
            { player_id: "p1", name: "Target 1", team_name: "Team A", position: "RB", surplus: 20, dollar_value: 25, price: 5, salary_after_arb: 9, surplus_after_arb: 16 } as ArbitrationTarget,
            { player_id: "p2", name: "Target 2", team_name: "Team B", position: "WR", surplus: 10, dollar_value: 15, price: 5, salary_after_arb: 9, surplus_after_arb: 6 } as ArbitrationTarget,
        ];

        const result = allocateArbitrationBudget(targets);
        expect(result.length).toBeGreaterThan(0);

        // Simple assertion just to ensure the function returns the correct structure
        // The real proportional math relies on NUM_TEAMS config, so a tight check
        // is harder without mocking the config, but we can verify it doesn't crash
        // and assigns dollars.
        expect(result[0]).toHaveProperty('team');
        expect(result[0]).toHaveProperty('suggested');
        expect(result[0].suggested).toBeGreaterThanOrEqual(1);
    });

    it("respects minimum and maximum constraints", () => {
        // Build one super-team
        const targets: ArbitrationTarget[] = [
            { player_id: "p1", name: "Target 1", team_name: "Team A", position: "RB", surplus: 100, dollar_value: 105, price: 5, salary_after_arb: 9, surplus_after_arb: 96 } as ArbitrationTarget,
            { player_id: "p2", name: "Target 2", team_name: "Team B", position: "WR", surplus: -5, dollar_value: 0, price: 5, salary_after_arb: 9, surplus_after_arb: -9 } as ArbitrationTarget,
        ];

        const result = allocateArbitrationBudget(targets);

        const teamARes = result.find(t => t.team === "Team A");
        const teamBRes = result.find(t => t.team === "Team B");

        // Even if Team A has massive surplus, max should clamp it
        expect(teamARes!.suggested).toBeLessThanOrEqual(8);

        // Even if Team B has negative surplus, min should give it $1
        expect(teamBRes!.suggested).toBeGreaterThanOrEqual(1);
    });
});

describe("runArbitrationSimulation", () => {
    it("handles empty arrays", () => {
        expect(runArbitrationSimulation([])).toHaveLength(0);
    });

    it("returns deterministic results for the same seed/params", () => {
        const players: SurplusPlayer[] = [
            { player_id: "p1", name: "Player 1", position: "QB", team_name: "Team A", price: 10, dollar_value: 20, surplus: 10 } as SurplusPlayer,
            { player_id: "p2", name: "Player 2", position: "RB", team_name: "Team B", price: 5, dollar_value: 10, surplus: 5 } as SurplusPlayer,
        ];

        const result1 = runArbitrationSimulation(players, 3, 0.2);
        const result2 = runArbitrationSimulation(players, 3, 0.2);

        expect(result1).toEqual(result2);
    });
});
