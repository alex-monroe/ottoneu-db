import { MIN_GAMES, MIN_SALARY_PLAYERS, SALARY_REPLACEMENT_PERCENTILE, REPLACEMENT_LEVEL } from "./config";
import { Player, VorpPlayer } from "./types";

const FULL_SEASON_GAMES = 17;

/**
 * Availability-adjusted per-game value used for the VORP math (#587 stage c2).
 *
 * When a player carries a projected_games estimate (set only on the projection
 * value paths — arbitration / projected modes), their value is discounted for
 * expected playing-time loss: `ppg × min(games,17)/17`. This is a per-game,
 * season-equivalent rate, so the downstream `× 17` still yields expected season
 * points (above an also-adjusted replacement level). Observed-PPG pages never
 * set projected_games, so this is a no-op there — `ppg` is returned unchanged.
 * The player's own `ppg` field (the displayed rate) is never mutated.
 */
function availabilityAdjustedPpg(p: Player): number {
    if (p.projected_games == null) return p.ppg;
    return p.ppg * Math.min(p.projected_games, FULL_SEASON_GAMES) / FULL_SEASON_GAMES;
}

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

/**
 * Calculates Value Over Replacement Player (VORP) for a given list of players.
 * It determines positional replacement levels either by the salary-implied bottom quartile
 * or by fixed rank fallbacks, then assigns VORP fields to each player.
 */
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
                const sortedPpg = [...bottomTier.map((p) => availabilityAdjustedPpg(p))].sort((a, b) => a - b);
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
            replacementPpg[pos] = availabilityAdjustedPpg(posPlayers[rank - 1]);
        } else if (posPlayers.length > 0) {
            replacementPpg[pos] = availabilityAdjustedPpg(posPlayers[posPlayers.length - 1]);
        } else {
            replacementPpg[pos] = 0;
        }
        replacementN[pos] = rank;
    }

    const vorpPlayers: VorpPlayer[] = qualified.map((p) => {
        const repPpg = replacementPpg[p.position] ?? 0;
        // Availability-adjusted value above replacement (#587 c2). On observed-PPG
        // pages availabilityAdjustedPpg(p) === p.ppg, so this is unchanged there.
        const vorpPerGame = availabilityAdjustedPpg(p) - repPpg;
        return {
            ...p,
            replacement_ppg: repPpg,
            vorp_per_game: Math.round(vorpPerGame * 100) / 100,
            full_season_vorp: Math.round(vorpPerGame * 17 * 10) / 10,
        };
    });

    return { players: vorpPlayers, replacementPpg, replacementN };
}