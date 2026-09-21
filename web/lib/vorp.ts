import {
    MIN_GAMES,
    MIN_SALARY_PLAYERS,
    SALARY_REPLACEMENT_PERCENTILE,
    FULL_SEASON_GAMES,
    STARTING_LINEUP,
} from "./config";
import { computeReplacementLevels } from "./replacement";
import { Player, VorpPlayer } from "./types";

/**
 * Availability-adjusted per-game value used for the VORP math (#587 stage c2).
 *
 * When a player carries a projected_games estimate (set only on the projection
 * value paths — arbitration / projected modes), their value is discounted for
 * expected playing-time loss: `ppg × min(games,17)/17`. This is a per-game,
 * season-equivalent rate, so the downstream `× FULL_SEASON_GAMES` still yields
 * expected season points (above an also-adjusted replacement level). Observed-PPG
 * pages never set projected_games, so this is a no-op there — `ppg` is returned
 * unchanged. The player's own `ppg` field (the displayed rate) is never mutated.
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
 * Salary-implied replacement PPG — the median PPG of the bottom-salary quartile
 * of rostered players at a position.
 *
 * This was the primary baseline until the lineup-derived one replaced it. It is
 * now a **diagnostic**, surfaced alongside the real baseline so the two can be
 * compared on /value, because it has two defects that make it a poor anchor for
 * dollar values:
 *
 *   1. It is doubly circular — prices set the replacement level, which sets
 *      dollar values, which are what we then compare prices against.
 *   2. It is hostage to roster quirks. One manager stashing a talented injured
 *      back at $2 drags the RB baseline up and silently deflates every RB in
 *      the league.
 *
 * Returns `null` when the position lacks enough rostered players to compute it.
 */
function salaryImpliedReplacement(rostered: Player[]): number | null {
    if (rostered.length < MIN_SALARY_PLAYERS) return null;

    const sortedPrices = [...rostered.map((p) => p.price)].sort((a, b) => a - b);
    const threshold = percentile(sortedPrices, SALARY_REPLACEMENT_PERCENTILE);
    const bottomTier = rostered.filter((p) => p.price <= threshold);
    if (bottomTier.length < MIN_SALARY_PLAYERS) return null;

    const sortedPpg = [...bottomTier.map((p) => availabilityAdjustedPpg(p))].sort((a, b) => a - b);
    return percentile(sortedPpg, 0.5); // median
}

/**
 * Calculates Value Over Replacement Player (VORP) for a given list of players.
 *
 * Replacement level is **lineup-derived**: leaguewide starting demand per
 * position, with the superflex slot allocated greedily to whichever position
 * offers the best marginal player (see `replacement.ts`). The replacement
 * player is the last one expected to start anywhere in the league.
 *
 * `full_season_vorp` is scaled by FULL_SEASON_GAMES purely for display — it is
 * a per-game edge times a games count. That scale factor cancels out of the
 * dollar conversion in `surplus.ts` (it divides by the same total), so it never
 * moves a dollar value, only the VORP number shown on screen.
 */
export function calculateVorp(
    players: Player[],
    minGames: number = MIN_GAMES
): {
    players: VorpPlayer[];
    replacementPpg: Record<string, number>;
    replacementN: Record<string, number>;
    /** Diagnostic only — the superseded salary-implied baseline, for comparison. */
    salaryImpliedPpg: Record<string, number>;
} {
    // Exclude kickers from VORP analysis: they occupy a starting slot but the
    // market prices every kicker at the salary floor, so there is no surplus to
    // allocate. Excluding them here also keeps the K slot out of the lineup
    // demand allocation.
    // College players (is_college=true) are included even with 0 games
    // when they have a projected PPG from the college_prospect method.
    const qualified = players.filter(
        (p) => (p.games_played >= minGames || p.is_college) && p.position !== 'K'
    );
    if (qualified.length === 0) {
        return { players: [], replacementPpg: {}, replacementN: {}, salaryImpliedPpg: {} };
    }

    // College prospects are held out of the baseline: they are not part of the
    // startable NFL pool this season, and letting them in would drag it around.
    const nonCollege = qualified.filter((p) => !p.is_college);

    const positions = Object.keys(STARTING_LINEUP).filter(
        (pos) => pos !== 'K' && nonCollege.some((p) => p.position === pos)
    );

    const valuesByPosition: Record<string, number[]> = {};
    for (const pos of positions) {
        valuesByPosition[pos] = nonCollege
            .filter((p) => p.position === pos)
            .map((p) => availabilityAdjustedPpg(p));
    }

    const { level: replacementPpg, rank: replacementN } = computeReplacementLevels(valuesByPosition);

    const salaryImpliedPpg: Record<string, number> = {};
    for (const pos of positions) {
        const rostered = nonCollege.filter(
            (p) => p.position === pos && p.team_name != null && p.team_name !== 'FA' && p.team_name !== ''
        );
        const implied = salaryImpliedReplacement(rostered);
        if (implied !== null) salaryImpliedPpg[pos] = implied;
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
            full_season_vorp: Math.round(vorpPerGame * FULL_SEASON_GAMES * 10) / 10,
        };
    });

    return { players: vorpPlayers, replacementPpg, replacementN, salaryImpliedPpg };
}
