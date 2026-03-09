import {
    ARB_BUDGET_PER_TEAM,
    ARB_MIN_PER_TEAM,
    ARB_MAX_PER_TEAM,
    NUM_TEAMS
} from "./config";

import {
    ArbitrationTarget,
    TeamAllocation
} from "./types";

/**
 * Distributes the $60 team arbitration budget proportionally among opponent teams
 * based on the surplus value of their top targets, ensuring minimum and maximum bounds.
 */
export function allocateArbitrationBudget(targets: ArbitrationTarget[]): TeamAllocation[] {
    // Group targets by team
    const teamTargets = new Map<string, ArbitrationTarget[]>();
    for (const t of targets) {
        const team = t.team_name!;
        const list = teamTargets.get(team) ?? [];
        list.push(t);
        teamTargets.set(team, list);
    }

    // Sort teams by number of targets (most first) to get an initial order/array
    const teamsWithTargets = [...teamTargets.entries()]
        .sort((a, b) => b[1].length - a[1].length);

    // Calculate proportional allocation
    const TOTAL_BUDGET = ARB_BUDGET_PER_TEAM;
    const numOpponents = NUM_TEAMS - 1;
    const minAllocation = ARB_MIN_PER_TEAM;
    const maxAllocation = ARB_MAX_PER_TEAM;

    // Calculate scores for each team
    const teamScores = teamsWithTargets.map(([team, players]) => {
        // Score based on top 5 targets' total surplus
        const topTargets = players.slice(0, 5);
        const score = topTargets.reduce((sum, p) => sum + Math.max(0, p.surplus), 0);
        return { team, players, score };
    });

    const totalScore = teamScores.reduce((sum, t) => sum + t.score, 0);
    const budgetForDistribution = TOTAL_BUDGET - (numOpponents * minAllocation);

    // Initial allocation target based on score
    const targetAllocations = teamScores.map((t) => {
        const share = totalScore > 0 ? t.score / totalScore : 1 / numOpponents;
        // The target is min + share of the rest.
        const target = minAllocation + (share * budgetForDistribution);
        return { ...t, target, current: minAllocation };
    });

    // Distribute dollars one by one to the team that is furthest below their target
    // and hasn't hit max.
    let currentSpent = numOpponents * minAllocation;

    while (currentSpent < TOTAL_BUDGET) {
        let bestCandidate = -1;
        let maxDiff = -Infinity;

        for (let i = 0; i < targetAllocations.length; i++) {
            if (targetAllocations[i].current < maxAllocation) {
                const diff = targetAllocations[i].target - targetAllocations[i].current;
                if (diff > maxDiff) {
                    maxDiff = diff;
                    bestCandidate = i;
                }
            }
        }

        if (bestCandidate !== -1) {
            targetAllocations[bestCandidate].current += 1;
            currentSpent += 1;
        } else {
            break;
        }
    }

    return targetAllocations
        .map((t) => ({
            team: t.team,
            suggested: t.current,
            players: t.players.slice(0, 5).map((p) => ({
                name: p.name,
                position: p.position,
                price: p.price,
                dollar_value: p.dollar_value,
                surplus: p.surplus,
                surplus_after_arb: p.surplus_after_arb,
            })),
        }))
        .sort((a, b) => b.suggested - a.suggested);
}
