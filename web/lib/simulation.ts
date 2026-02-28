import {
    ARB_MAX_PER_PLAYER_PER_TEAM,
    ARB_BUDGET_PER_TEAM,
    ARB_MIN_PER_TEAM,
    ARB_MAX_PER_TEAM,
    ARB_MAX_PER_PLAYER_LEAGUE,
    NUM_SIMULATIONS,
    VALUE_VARIATION,
} from "./config";

import {
    Player,
    SurplusPlayer,
    SimulationResult
} from "./types";

import { calculateSurplus } from "./surplus";

// === Arbitration Simulation ===

/**
 * Seeded random number generator for reproducible simulations
 */
export class SeededRandom {
    private seed: number;

    constructor(seed: number) {
        this.seed = seed;
    }

    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }

    /**
     * Box-Muller transform to generate normally distributed random numbers
     */
    normalRandom(mean: number = 0, std: number = 1): number {
        const u1 = this.next();
        const u2 = this.next();
        const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        return z0 * std + mean;
    }

    /**
     * Generate lognormal random number
     */
    lognormalRandom(sigma: number): number {
        const normal = this.normalRandom(0, sigma);
        return Math.exp(normal);
    }
}

/**
 * Generate team-specific valuations with variation
 */
export function generateTeamValuations(
    players: SurplusPlayer[],
    allTeams: string[],
    variation: number,
    seed: number
): Map<string, SurplusPlayer[]> {
    const teamValuations = new Map<string, SurplusPlayer[]>();
    const rosteredTeams = allTeams.filter(t => t !== 'FA' && t !== '' && t !== null);

    for (const team of rosteredTeams) {
        const rng = new SeededRandom(seed + team.split('').reduce((a, b) => a + b.charCodeAt(0), 0));
        const teamPlayers = players.map(p => {
            const multiplier = rng.lognormalRandom(variation);
            const teamValueEstimate = Math.max(0, p.dollar_value * multiplier);

            return {
                ...p,
                dollar_value: Math.round(teamValueEstimate),
                surplus: Math.round(teamValueEstimate) - p.price,
            };
        });

        teamValuations.set(team, teamPlayers);
    }

    return teamValuations;
}

/**
 * Allocate one team's arbitration budget to opponent players only.
 *
 * In Ottoneu, teams can ONLY arbitrate opponents' players, not their own.
 * Strategy focuses on targeting high-surplus players to maximize disruption.
 */
export function allocateTeamBudget(
    teamName: string,
    teamValuations: SurplusPlayer[],
    allTeams: string[],
    budget: number,
    minPerTeam: number,
    maxPerTeam: number,
    maxPerPlayer: number
): Map<string, number> {
    const allocations = new Map<string, number>();
    const opponents = allTeams.filter(
        t => t !== teamName && t !== 'FA' && t !== '' && t !== null
    );

    let remainingBudget = budget - (opponents.length * minPerTeam);

    // Get all opponent players with positive surplus
    const opponentPlayers = teamValuations
        .filter(p => opponents.includes(p.team_name!) && p.dollar_value > 1 && p.surplus > 0)
        .sort((a, b) => b.surplus - a.surplus)
        .slice(0, 30);

    // Distribute budget across high-surplus targets
    for (const player of opponentPlayers) {
        if (remainingBudget <= 0) break;

        const targetTeam = player.team_name!;
        const currentToTeam = Array.from(allocations.entries())
            .filter(([key]) => key.endsWith(`|${targetTeam}`))
            .reduce((sum, [, amt]) => sum + amt, 0);

        const availableForTeam = maxPerTeam - currentToTeam;
        if (availableForTeam < 0.5) continue;

        const amount = Math.min(
            maxPerPlayer,
            availableForTeam,
            remainingBudget / 10
        );

        if (amount >= 0.5) {
            const key = `${player.name}|${targetTeam}`;
            allocations.set(key, (allocations.get(key) || 0) + amount);
            remainingBudget -= amount;
        }
    }

    // Ensure minimum allocation to all opponents
    for (const opponent of opponents) {
        const currentToTeam = Array.from(allocations.entries())
            .filter(([key]) => key.endsWith(`|${opponent}`))
            .reduce((sum, [, amt]) => sum + amt, 0);

        if (currentToTeam < minPerTeam) {
            // Find highest surplus player on this team
            const opponentPlayersForTeam = opponentPlayers.filter(p => p.team_name === opponent);

            if (opponentPlayersForTeam.length > 0) {
                const player = opponentPlayersForTeam[0];
                const key = `${player.name}|${opponent}`;
                const shortfall = minPerTeam - currentToTeam;
                allocations.set(key, (allocations.get(key) || 0) + shortfall);
            }
        }
    }

    return allocations;
}

/**
 * Run arbitration simulation
 */
export function runArbitrationSimulation(
    players: Player[],
    numSims: number = NUM_SIMULATIONS,
    valueVariation: number = VALUE_VARIATION,
    adjustments?: Map<string, number>
): SimulationResult[] {
    const surplusPlayers = calculateSurplus(players, adjustments);
    if (surplusPlayers.length === 0) return [];

    // Exclude kickers from arbitration simulation
    const surplusPlayersNoKickers = surplusPlayers.filter(p => p.position !== 'K');

    const allTeams = Array.from(new Set(surplusPlayersNoKickers.map(p => p.team_name).filter(Boolean))) as string[];
    const rosteredTeams = allTeams.filter(t => t !== 'FA' && t !== '');

    // Track arbitration totals across simulations
    const arbResults = new Map<string, number[]>();

    for (let sim = 0; sim < numSims; sim++) {
        const teamValuations = generateTeamValuations(
            surplusPlayersNoKickers,
            allTeams,
            valueVariation,
            sim
        );

        // Track totals for this simulation
        const simArbTotals = new Map<string, number>();

        // Each team allocates their budget
        for (const team of rosteredTeams) {
            const allocations = allocateTeamBudget(
                team,
                teamValuations.get(team)!,
                allTeams,
                ARB_BUDGET_PER_TEAM,
                ARB_MIN_PER_TEAM,
                ARB_MAX_PER_TEAM,
                ARB_MAX_PER_PLAYER_PER_TEAM
            );

            // Add to simulation totals
            for (const [key, amount] of allocations.entries()) {
                simArbTotals.set(key, (simArbTotals.get(key) || 0) + amount);
            }
        }

        // Cap at league maximum and record results
        for (const [key, total] of simArbTotals.entries()) {
            const cappedTotal = Math.min(total, ARB_MAX_PER_PLAYER_LEAGUE);

            if (!arbResults.has(key)) {
                arbResults.set(key, []);
            }
            arbResults.get(key)!.push(cappedTotal);
        }
    }

    // Aggregate simulation results
    const results: SimulationResult[] = [];

    const playerLookupMap = new Map(
        surplusPlayersNoKickers.map(p => [`${p.name}|${p.team_name}`, p])
    );

    for (const [key, amounts] of arbResults.entries()) {
        const playerData = playerLookupMap.get(key);

        if (!playerData) continue;

        const meanArb = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const variance = amounts.reduce((sum, x) => sum + Math.pow(x - meanArb, 2), 0) / amounts.length;
        const stdArb = Math.sqrt(variance);
        const minArb = Math.min(...amounts);
        const maxArb = Math.max(...amounts);
        const pctProtected = amounts.filter(x => x >= ARB_MAX_PER_PLAYER_LEAGUE * 0.9).length / amounts.length;

        const salaryAfterArb = playerData.price + meanArb;
        const surplusAfterArb = playerData.dollar_value - salaryAfterArb;

        results.push({
            ...playerData,
            mean_arb: Math.round(meanArb * 10) / 10,
            std_arb: Math.round(stdArb * 10) / 10,
            min_arb: Math.round(minArb * 10) / 10,
            max_arb: Math.round(maxArb * 10) / 10,
            pct_protected: Math.round(pctProtected * 100) / 100,
            salary_after_arb: Math.round(salaryAfterArb * 10) / 10,
            surplus_after_arb: Math.round(surplusAfterArb * 10) / 10,
        });
    }

    return results.sort((a, b) => b.mean_arb - a.mean_arb);
}