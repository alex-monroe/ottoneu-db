import { NUM_TEAMS, CAP_PER_TEAM, MY_TEAM } from "./config";
import { Player, SurplusPlayer, ProjectedSalaryPlayer } from "./types";
import { calculateVorp } from "./vorp";

export function calculateSurplus(
    players: Player[],
    adjustments?: Map<string, number>
): SurplusPlayer[] {
    const { players: vorpPlayers } = calculateVorp(players);
    if (vorpPlayers.length === 0) return [];

    const totalPositiveVorp = vorpPlayers
        .filter((p) => p.full_season_vorp > 0)
        .reduce((sum, p) => sum + p.full_season_vorp, 0);

    if (totalPositiveVorp === 0) return [];

    // ~87.5% of total league cap goes to above-replacement players
    const totalCap = NUM_TEAMS * CAP_PER_TEAM * 0.875;
    const dollarPerVorp = totalCap / totalPositiveVorp;

    return vorpPlayers.map((p) => {
        const rawDollarValue = p.full_season_vorp * dollarPerVorp;
        const baseDollarValue = Math.round(Math.max(rawDollarValue, 1));
        const adjustment = adjustments?.get(p.player_id) ?? 0;
        const dollarValue = Math.round(Math.max(baseDollarValue + adjustment, 1));
        return {
            ...p,
            dollar_value: dollarValue,
            surplus: dollarValue - p.price,
        };
    });
}

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