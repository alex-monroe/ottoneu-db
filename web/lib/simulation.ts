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
    private hasSpare: boolean = false;
    private spare: number = 0;

    constructor(seed: number) {
        this.seed = seed;
    }

    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }

    /**
     * Box-Muller transform to generate normally distributed random numbers
     * Caches the second generated value to reduce expensive Math calls
     */
    normalRandom(mean: number = 0, std: number = 1): number {
        if (this.hasSpare) {
            this.hasSpare = false;
            return this.spare * std + mean;
        } else {
            const u1 = this.next();
            const u2 = this.next();
            const R = Math.sqrt(-2.0 * Math.log(u1));
            const theta = 2.0 * Math.PI * u2;
            const z0 = R * Math.cos(theta);
            this.spare = R * Math.sin(theta);
            this.hasSpare = true;
            return z0 * std + mean;
        }
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
    rosteredTeams: string[],
    variation: number,
    seed: number
): Map<string, SurplusPlayer[]> {
    const teamValuations = new Map<string, SurplusPlayer[]>();

    for (let i = 0; i < rosteredTeams.length; i++) {
        const team = rosteredTeams[i];
        let seedSum = 0;
        for (let j = 0; j < team.length; j++) {
            seedSum += team.charCodeAt(j);
        }
        const rng = new SeededRandom(seed + seedSum);

        const teamPlayers = new Array(players.length);
        for (let j = 0; j < players.length; j++) {
            const p = players[j];
            const multiplier = rng.lognormalRandom(variation);
            const teamValueEstimate = Math.max(0, p.dollar_value * multiplier);

            teamPlayers[j] = {
                ...p,
                dollar_value: Math.round(teamValueEstimate),
                surplus: Math.round(teamValueEstimate) - p.price,
            };
        }

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
    opponents: string[],
    budget: number,
    minPerTeam: number,
    maxPerTeam: number,
    maxPerPlayer: number,
    opponentSet: Set<string>
): Map<string, number> {
    const allocations = new Map<string, number>();

    let remainingBudget = budget - (opponents.length * minPerTeam);

    // Get top 30 opponent players with highest positive surplus
    const topOpponentPlayers: SurplusPlayer[] = [];
    for (let i = 0; i < teamValuations.length; i++) {
        const p = teamValuations[i];
        if (opponentSet.has(p.team_name!) && p.dollar_value > 1 && p.surplus > 0) {
            const surplus = p.surplus;

            // Maintain sorted array of top 30 elements to avoid full array sort
            if (topOpponentPlayers.length < 30) {
                let j = topOpponentPlayers.length - 1;
                topOpponentPlayers.push(p); // Add element at end temporarily
                while (j >= 0 && surplus > topOpponentPlayers[j].surplus) {
                    topOpponentPlayers[j + 1] = topOpponentPlayers[j];
                    j--;
                }
                topOpponentPlayers[j + 1] = p;
            } else if (surplus > topOpponentPlayers[29].surplus) {
                let j = 28;
                while (j >= 0 && surplus > topOpponentPlayers[j].surplus) {
                    topOpponentPlayers[j + 1] = topOpponentPlayers[j];
                    j--;
                }
                topOpponentPlayers[j + 1] = p;
            }
        }
    }

    // Optimization: Keep track of allocations to each opponent team
    // instead of calling .entries() and .filter() and .reduce() repeatedly.
    const currentToTeamMap = new Map<string, number>();
    for (const opponent of opponents) {
        currentToTeamMap.set(opponent, 0);
    }

    // Distribute budget across high-surplus targets
    for (let i = 0; i < topOpponentPlayers.length; i++) {
        const player = topOpponentPlayers[i];
        if (remainingBudget <= 0) break;

        const targetTeam = player.team_name!;
        const currentToTeam = currentToTeamMap.get(targetTeam) || 0;

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
            currentToTeamMap.set(targetTeam, currentToTeam + amount);
            remainingBudget -= amount;
        }
    }

    // Ensure minimum allocation to all opponents
    for (const opponent of opponents) {
        const currentToTeam = currentToTeamMap.get(opponent) || 0;

        if (currentToTeam < minPerTeam) {
            // Find highest surplus player on this team
            let highestOpponent = null;
            for (let i = 0; i < topOpponentPlayers.length; i++) {
                if (topOpponentPlayers[i].team_name === opponent) {
                    highestOpponent = topOpponentPlayers[i];
                    break;
                }
            }

            if (highestOpponent) {
                const key = `${highestOpponent.name}|${opponent}`;
                const shortfall = minPerTeam - currentToTeam;
                allocations.set(key, (allocations.get(key) || 0) + shortfall);
                currentToTeamMap.set(opponent, currentToTeam + shortfall);
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

    const allTeamsSet = new Set<string>();
    for (let i = 0; i < surplusPlayersNoKickers.length; i++) {
        const t = surplusPlayersNoKickers[i].team_name;
        if (t) allTeamsSet.add(t);
    }
    const allTeams = Array.from(allTeamsSet);
    const rosteredTeams = allTeams.filter(t => t !== 'FA' && t !== '');

    // Pre-calculate opponents lists for each team to avoid repeated filter calls
    const teamOpponents = new Map<string, string[]>();
    const teamOpponentSets = new Map<string, Set<string>>();
    for (const team of rosteredTeams) {
        const opponents = allTeams.filter(
            t => t !== team && t !== 'FA' && t !== '' && t !== null
        );
        teamOpponents.set(team, opponents);
        teamOpponentSets.set(team, new Set(opponents));
    }

    // Track arbitration totals across simulations
    const arbResults = new Map<string, number[]>();

    for (let sim = 0; sim < numSims; sim++) {
        const teamValuations = generateTeamValuations(
            surplusPlayersNoKickers,
            rosteredTeams,
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
                teamOpponents.get(team)!,
                ARB_BUDGET_PER_TEAM,
                ARB_MIN_PER_TEAM,
                ARB_MAX_PER_TEAM,
                ARB_MAX_PER_PLAYER_PER_TEAM,
                teamOpponentSets.get(team)!
            );

            // Add to simulation totals
            for (const [key, amount] of allocations.entries()) {
                simArbTotals.set(key, (simArbTotals.get(key) || 0) + amount);
            }
        }

        // Cap at league maximum and record results
        for (const [key, total] of simArbTotals.entries()) {
            const cappedTotal = Math.min(total, ARB_MAX_PER_PLAYER_LEAGUE);

            let arr = arbResults.get(key);
            if (!arr) {
                arr = [];
                arbResults.set(key, arr);
            }
            arr.push(cappedTotal);
        }
    }

    // Aggregate simulation results
    const results: SimulationResult[] = [];

    const playerLookupMap = new Map();
    for (let i = 0; i < surplusPlayersNoKickers.length; i++) {
        const p = surplusPlayersNoKickers[i];
        playerLookupMap.set(`${p.name}|${p.team_name}`, p);
    }

    for (const [key, amounts] of arbResults.entries()) {
        const playerData = playerLookupMap.get(key);

        if (!playerData) continue;

        let sumArb = 0;
        let sumArbSq = 0;
        let minArb = Infinity;
        let maxArb = -Infinity;
        let numProtected = 0;

        for (let i = 0; i < amounts.length; i++) {
            const val = amounts[i];
            sumArb += val;
            sumArbSq += val * val;
            if (val < minArb) minArb = val;
            if (val > maxArb) maxArb = val;
            if (val >= ARB_MAX_PER_PLAYER_LEAGUE * 0.9) numProtected++;
        }

        const meanArb = sumArb / amounts.length;
        // variance = E[X^2] - (E[X])^2
        const variance = Math.max(0, (sumArbSq / amounts.length) - (meanArb * meanArb));
        const stdArb = Math.sqrt(variance);
        const pctProtected = numProtected / amounts.length;

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
