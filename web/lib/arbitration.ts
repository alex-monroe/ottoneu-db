import {
    MY_TEAM,
    ARB_MAX_PER_PLAYER_PER_TEAM,
    ARB_BUDGET_PER_TEAM,
    NUM_TEAMS,
    ARB_MIN_PER_TEAM,
    ARB_MAX_PER_TEAM,
} from "./config";

import {
    Player,
    ArbitrationTarget,
    TeamAllocation,
} from "./types";

import { calculateSurplus } from "./surplus";

export function analyzeArbitration(
    allPlayers: Player[],
    adjustments?: Map<string, number>
): ArbitrationTarget[] {
    const surplusPlayers = calculateSurplus(allPlayers, adjustments);
    if (surplusPlayers.length === 0) return [];

    // Filter to opponents' rostered players only (exclude kickers)
    const opponents = surplusPlayers.filter(
        (p) =>
            p.team_name != null &&
            p.team_name !== "" &&
            p.team_name !== "FA" &&
            p.team_name !== MY_TEAM &&
            p.position !== "K"
    );

    // DB salaries already include the end-of-season bump.
    // Arbitration adds up to $4 on top of current salary.
    const targets: ArbitrationTarget[] = opponents.map((p) => {
        const salaryAfterArb = p.price + ARB_MAX_PER_PLAYER_PER_TEAM;
        const surplusAfterArb = p.dollar_value - salaryAfterArb;

        return {
            ...p,
            salary_after_arb: salaryAfterArb,
            surplus_after_arb: surplusAfterArb,
        };
    });

    // Focus on danger zone: surplus between -10 and +15
    return targets
        .filter(
            (t) => t.surplus >= -10 && t.dollar_value > 1
        )
        .sort((a, b) => b.surplus - a.surplus);
}

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
