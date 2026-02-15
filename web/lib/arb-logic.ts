
// === Config Constants ===
export const LEAGUE_ID = 309;
export const SEASON = 2025;
export const MY_TEAM = "The Witchcraft";
export const NUM_TEAMS = 12;
export const CAP_PER_TEAM = 400;
export const MIN_GAMES = 4;

// Replacement level: approximate number of fantasy-relevant players per position
// in a 12-team superflex league (accounts for 2 QBs starting per team)
export const REPLACEMENT_LEVEL: Record<string, number> = {
    QB: 24,
    RB: 30,
    WR: 30,
    TE: 15,
    K: 13,
};

// NOTE: Database salaries already reflect the end-of-season $4/$1 bump.
// No additional salary projection is needed.

// Arbitration constants
export const ARB_BUDGET_PER_TEAM = 60;
export const ARB_MIN_PER_TEAM = 1;
export const ARB_MAX_PER_TEAM = 8;
export const ARB_MAX_PER_PLAYER_PER_TEAM = 4;

export const POSITIONS = ["QB", "RB", "WR", "TE", "K"] as const;

export const POSITION_COLORS: Record<string, string> = {
    QB: "#EF4444",
    RB: "#3B82F6",
    WR: "#10B981",
    TE: "#F59E0B",
    K: "#8B5CF6",
};

// === Types ===
export interface Player {
    player_id: string;
    name: string;
    position: string;
    nfl_team: string;
    price: number;
    team_name: string | null;
    total_points: number;
    games_played: number;
    snaps: number;
    ppg: number;
    pps: number;
    [key: string]: string | number | null | undefined;
}

export interface VorpPlayer extends Player {
    replacement_ppg: number;
    vorp_per_game: number;
    full_season_vorp: number;
}

export interface SurplusPlayer extends VorpPlayer {
    dollar_value: number;
    surplus: number;
}

export interface ProjectedSalaryPlayer extends SurplusPlayer {
    recommendation: string;
}

export interface ArbitrationTarget extends SurplusPlayer {
    salary_after_arb: number;
    surplus_after_arb: number;
}

export interface TeamAllocation {
    team: string;
    suggested: number;
    players: {
        name: string;
        position: string;
        price: number;
        dollar_value: number;
        surplus: number;
        surplus_after_arb: number;
    }[];
}

// === Analysis Functions ===

export function calculateVorp(
    players: Player[],
    minGames: number = MIN_GAMES
): { players: VorpPlayer[]; replacementPpg: Record<string, number> } {
    const qualified = players.filter((p) => p.games_played >= minGames);
    if (qualified.length === 0) return { players: [], replacementPpg: {} };

    // Determine replacement-level PPG per position
    const replacementPpg: Record<string, number> = {};
    for (const [pos, rank] of Object.entries(REPLACEMENT_LEVEL)) {
        const posPlayers = qualified
            .filter((p) => p.position === pos)
            .sort((a, b) => b.total_points - a.total_points);

        if (posPlayers.length >= rank) {
            replacementPpg[pos] = posPlayers[rank - 1].ppg;
        } else if (posPlayers.length > 0) {
            replacementPpg[pos] = posPlayers[posPlayers.length - 1].ppg;
        } else {
            replacementPpg[pos] = 0;
        }
    }

    const vorpPlayers: VorpPlayer[] = qualified.map((p) => {
        const repPpg = replacementPpg[p.position] ?? 0;
        const vorpPerGame = p.ppg - repPpg;
        return {
            ...p,
            replacement_ppg: repPpg,
            vorp_per_game: Math.round(vorpPerGame * 100) / 100,
            full_season_vorp: Math.round(vorpPerGame * 17 * 10) / 10,
        };
    });

    return { players: vorpPlayers, replacementPpg };
}

export function calculateSurplus(players: Player[]): SurplusPlayer[] {
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
        const dollarValue = Math.round(Math.max(rawDollarValue, 1));
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

export function analyzeArbitration(allPlayers: Player[]): ArbitrationTarget[] {
    const surplusPlayers = calculateSurplus(allPlayers);
    if (surplusPlayers.length === 0) return [];

    // Filter to opponents' rostered players only
    const opponents = surplusPlayers.filter(
        (p) =>
            p.team_name != null &&
            p.team_name !== "" &&
            p.team_name !== "FA" &&
            p.team_name !== MY_TEAM
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
