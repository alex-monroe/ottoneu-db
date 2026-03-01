import {
    MIN_GAMES,
    MIN_SALARY_PLAYERS,
    SALARY_REPLACEMENT_PERCENTILE,
    REPLACEMENT_LEVEL,
} from "./config";

import {
    Player,
    VorpPlayer,
} from "./types";

/**
 * Return the value at the given percentile (0–1) in a sorted numeric array.
 * Uses linear interpolation between adjacent values.
 */
function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function calculateVorp(
    players: Player[],
    minGames: number = MIN_GAMES
): { players: VorpPlayer[]; replacementPpg: Record<string, number>; replacementN: Record<string, number> } {
    // Exclude kickers from VORP analysis.
    // College players (is_college=true) are included even with 0 games
    // when they have a projected PPG from the college_prospect method.
    const qualified = players.filter(
        (p) => (p.games_played >= minGames || p.is_college) && p.position !== 'K'
    );
    if (qualified.length === 0) return { players: [], replacementPpg: {}, replacementN: {} };

    // Determine replacement-level PPG per position using salary-implied method.
    // Players in the bottom quartile of rostered salaries represent "replacement tier"
    // by manager consensus. Falls back to fixed-rank method when data is sparse.
    const replacementPpg: Record<string, number> = {};
    const replacementN: Record<string, number> = {};

    const nonCollege = qualified.filter((p) => !p.is_college);

    for (const [pos, rank] of Object.entries(REPLACEMENT_LEVEL)) {
        const rostered = nonCollege.filter(
            (p) => p.position === pos && p.team_name != null && p.team_name !== 'FA' && p.team_name !== ''
        );

        if (rostered.length >= MIN_SALARY_PLAYERS) {
            const sortedPrices = [...rostered.map((p) => p.price)].sort((a, b) => a - b);
            const threshold = percentile(sortedPrices, SALARY_REPLACEMENT_PERCENTILE);
            const bottomTier = rostered.filter((p) => p.price <= threshold);

            if (bottomTier.length >= MIN_SALARY_PLAYERS) {
                const sortedPpg = [...bottomTier.map((p) => p.ppg)].sort((a, b) => a - b);
                replacementPpg[pos] = percentile(sortedPpg, 0.5); // median
                replacementN[pos] = bottomTier.length;
                continue;
            }
        }

        // Fallback: fixed rank by total points
        const posPlayers = nonCollege
            .filter((p) => p.position === pos)
            .sort((a, b) => b.total_points - a.total_points);

        if (posPlayers.length >= rank) {
            replacementPpg[pos] = posPlayers[rank - 1].ppg;
        } else if (posPlayers.length > 0) {
            replacementPpg[pos] = posPlayers[posPlayers.length - 1].ppg;
        } else {
            replacementPpg[pos] = 0;
        }
        replacementN[pos] = rank;
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

    return { players: vorpPlayers, replacementPpg, replacementN };
}
