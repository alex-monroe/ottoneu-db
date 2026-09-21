/**
 * Earned auction value — the retrospective half of the valuation system.
 *
 * `surplus.ts` prices what a player is *projected* to be worth. This module
 * prices what he *was* worth, from the points he actually scored. It is the
 * football analogue of the FanGraphs Player Rater: the same closed-economy
 * dollar allocation, run on actuals instead of projections.
 *
 * The output answers "if the auction had been run with perfect foresight, what
 * would he have gone for?" — and, set beside what he actually cost, it is the
 * only honest scoreboard for an auction buy, an arbitration dollar, or a
 * keep/cut call.
 *
 * ## What differs from the projected path
 *
 *   - **Ranked on season totals, not PPG.** This is the important one.
 *     Availability is not modelled here, it is observed: a star who missed
 *     eight games earned eight games less, and ranking him on his per-game rate
 *     would credit him for value he never delivered. `surplus.ts` needs the
 *     `projected_games` discount precisely because it cannot see this yet.
 *   - **No minimum-games filter.** A player who managed three games earned what
 *     he earned; dropping him would misstate the pool he was part of.
 *   - **Replacement level is recomputed on actuals** — the baseline is whoever
 *     actually finished as the marginal ownable player, not whoever was
 *     projected to.
 *
 * ## What is shared
 *
 * The lineup-derived, flex-aware replacement level (`replacement.ts`) and the
 * dollar conversion (`surplus.ts#distributableCap`) are the same in both
 * directions. That is deliberate: if the two used different baselines, the
 * projected-vs-earned comparison would measure the difference between the two
 * methods rather than the difference between the forecast and reality.
 *
 * ## Known limitation: this counts points you never started
 *
 * Roto baseball accumulates everything a player does. Football has a weekly
 * start/sit gate, so a season total credits a player for points scored on
 * somebody's bench. The fix is to compute the same thing over `matchup_lineups`
 * (which records who was actually started, per week) — tracked as follow-up
 * work in docs/references/player-valuation.md. Season totals are the right
 * first cut: they are what every public Player Rater reports, so they are
 * comparable outside this league.
 */
import { MIN_PLAYER_SALARY } from "./config";
import { computeReplacementLevels } from "./replacement";
import { distributableCap } from "./surplus";
import type { EarnedValuePlayer, Player } from "./types";

/** The minimum a row needs for the earned-value math. */
export interface EarnedValueInput {
    position: string;
    total_points: number;
    /**
     * The salary the player was actually carried at **during that season**.
     * Use `fetchPlayersEndOfSeason()`, whose snapshot predates the +$4/+$1
     * bump; a post-bump or post-arbitration salary compares his production
     * against a price nobody paid for it.
     */
    price: number;
    is_college?: boolean;
}

export interface EarnedValue {
    /** Season points of the marginal ownable player at this position. */
    replacement_points: number;
    /** Season points above that baseline. Negative below replacement. */
    points_above_replacement: number;
    /** What an efficient auction with perfect foresight would have paid. */
    earned_value: number;
    /** `earned_value − price`. Positive = the roster spot paid off. */
    realized_surplus: number;
}

/**
 * Price a set of player-seasons from their actual production.
 *
 * Kickers are excluded (as in `calculateVorp`) — every kicker clears at the
 * salary floor, so there is no surplus to allocate — and so are college
 * prospects, who have no NFL production to price.
 *
 * Returns an empty array when nobody finished above replacement, which can only
 * happen on a degenerate pool (every player at a position scoring identically).
 */
export function computeEarnedValue<T extends EarnedValueInput>(
    rows: T[]
): (T & EarnedValue)[] {
    const eligible = rows.filter((r) => r.position !== "K" && !r.is_college);
    if (eligible.length === 0) return [];

    const pointsByPosition: Record<string, number[]> = {};
    for (const row of eligible) {
        (pointsByPosition[row.position] ??= []).push(row.total_points);
    }

    const { level: replacementPoints } = computeReplacementLevels(pointsByPosition);

    const above = eligible.map(
        (row) => row.total_points - (replacementPoints[row.position] ?? 0)
    );
    const totalPositive = above
        .filter((v) => v > 0)
        .reduce((sum, v) => sum + v, 0);
    if (totalPositive === 0) return [];

    const dollarPerPoint = distributableCap() / totalPositive;

    return eligible.map((row, i) => {
        const par = above[i];
        const rawValue =
            par > 0 ? MIN_PLAYER_SALARY + par * dollarPerPoint : MIN_PLAYER_SALARY;
        const earnedValue = Math.round(rawValue);
        return {
            ...row,
            replacement_points: replacementPoints[row.position] ?? 0,
            points_above_replacement: Math.round(par * 10) / 10,
            earned_value: earnedValue,
            realized_surplus: earnedValue - row.price,
        };
    });
}

/**
 * Convenience wrapper over a full `Player[]` — what `fetchPlayersEndOfSeason()`
 * returns — so a caller does not have to project the rows down by hand.
 */
export function calculateEarnedValue(players: Player[]): EarnedValuePlayer[] {
    return computeEarnedValue(players);
}

/**
 * Dollars-per-point of production, earned. The retrospective twin of
 * `computeDollarPerVorp` — useful for reading how much a point was worth in a
 * given season, which drifts with the scoring environment.
 */
export function computeDollarPerEarnedPoint(rows: EarnedValueInput[]): number {
    const priced = computeEarnedValue(rows);
    const totalPositive = priced
        .filter((p) => p.points_above_replacement > 0)
        .reduce((sum, p) => sum + p.points_above_replacement, 0);
    if (totalPositive === 0) return 0;
    return distributableCap() / totalPositive;
}
