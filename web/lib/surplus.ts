import { NUM_TEAMS, CAP_PER_TEAM, MY_TEAM } from "./config";
import { Player, SurplusPlayer, ProjectedSalaryPlayer } from "./types";
import { calculateVorp } from "./vorp";

/**
 * Calculates the surplus value (dollar_value - salary) for each player based on their VORP.
 * Allocates a percentage of the total league cap across all positive VORP production.
 */
export function calculateSurplus(
    players: Player[],
    adjustments?: Map<string, number>
): SurplusPlayer[] {
    const { players: vorpPlayers } = calculateVorp(players);
    if (vorpPlayers.length === 0) return [];

    let totalPositiveVorp = 0;
    for (let i = 0; i < vorpPlayers.length; i++) {
        const p = vorpPlayers[i];
        if (p.full_season_vorp > 0) {
            totalPositiveVorp += p.full_season_vorp;
        }
    }

    if (totalPositiveVorp === 0) return [];

    // ~87.5% of total league cap goes to above-replacement players
    const totalCap = NUM_TEAMS * CAP_PER_TEAM * 0.875;
    const dollarPerVorp = totalCap / totalPositiveVorp;

    const result = new Array(vorpPlayers.length);
    for (let i = 0; i < vorpPlayers.length; i++) {
        const p = vorpPlayers[i];
        const rawDollarValue = p.full_season_vorp * dollarPerVorp;
        const baseDollarValue = Math.round(Math.max(rawDollarValue, 1));
        const adjustment = adjustments?.get(p.player_id) ?? 0;
        const dollarValue = Math.round(Math.max(baseDollarValue + adjustment, 1));

        result[i] = {
            ...p,
            dollar_value: dollarValue,
            surplus: dollarValue - p.price,
        };
    }
    return result;
}

/**
 * Computes the dollar-per-VORP conversion rate from a set of players.
 * Useful for reverse-engineering PPG targets from dollar values.
 */
export function computeDollarPerVorp(players: Player[]): number {
    const { players: vorpPlayers } = calculateVorp(players);
    let totalPositiveVorp = 0;
    for (let i = 0; i < vorpPlayers.length; i++) {
        const p = vorpPlayers[i];
        if (p.full_season_vorp > 0) {
            totalPositiveVorp += p.full_season_vorp;
        }
    }
    if (totalPositiveVorp === 0) return 0;
    return (NUM_TEAMS * CAP_PER_TEAM * 0.875) / totalPositiveVorp;
}

/**
 * Analyzes MY_TEAM's projected salary by categorizing players into keep/cut
 * classifications based on surplus value thresholds.
 */
export function analyzeProjectedSalary(
    allPlayers: Player[]
): ProjectedSalaryPlayer[] {
    const surplusPlayers = calculateSurplus(allPlayers);
    if (surplusPlayers.length === 0) return [];

    const myRoster = surplusPlayers.filter((p) => p.team_name === MY_TEAM);
    if (myRoster.length === 0) return [];

    // Classify based on surplus value thresholds
    return myRoster.map((p) => {
        let recommendation: string;
        if (p.surplus >= 10) recommendation = "Strong Keep";
        else if (p.surplus >= 0) recommendation = "Keep";
        else if (p.surplus >= -5) recommendation = "Borderline";
        else recommendation = "Cut Candidate";

        return { ...p, recommendation };
    });
}