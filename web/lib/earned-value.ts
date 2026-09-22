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
 * ## Reading it mid-season
 *
 * Nothing above assumes the season is over, and that is the point: season totals
 * through week 2 are still "the points he actually scored", which is exactly what
 * this module prices. Two things have to move with the window
 * (web/lib/stat-window.ts) for the answer to stay honest:
 *
 *   1. **The pot is prorated.** Through two of seventeen games the league has
 *      earned two seventeenths of its cap, not all of it — see
 *      `surplus.ts#distributableCap`.
 *   2. **The salary is prorated to match.** A $90 back has cost his owner $90
 *      for a season and about $10.60 so far. Setting a fortnight of earnings
 *      against a full year's price is the one comparison that would make the
 *      whole view lie, so `salary_to_date` is what `realized_surplus` subtracts.
 *
 * Both are the same scale factor, so `realized_surplus` mid-season is exactly
 * `fraction ×` what it would be on the full-season scale: the ranking and the
 * sign never move, only the units. That is why {@link EarnedValue.return_on_salary}
 * is the number to read in week 2 — being a ratio, it is free of the scale
 * altogether, and free of the small imprecision in `fraction` that bye weeks
 * introduce.
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
import type { StatWindow } from "./stat-window";
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
    /** Points of the marginal ownable player at this position, over the window. */
    replacement_points: number;
    /** Points above that baseline. Negative below replacement. */
    points_above_replacement: number;
    /**
     * What an efficient auction with perfect foresight would have paid — for the
     * slice of season the window covers. Over a full season that is a season's
     * salary; through week 2 it is two weeks' worth of one.
     */
    earned_value: number;
    /**
     * The salary this roster spot has cost over the window: `price × fraction`.
     * Equal to `price` on a completed season.
     */
    salary_to_date: number;
    /** `earned_value − salary_to_date`. Positive = the roster spot paid off. */
    realized_surplus: number;
    /**
     * `earned_value / salary_to_date` — dollars earned per dollar paid. 1.0 is
     * breaking even, 2.0 is twice the production the price asked for.
     *
     * Scale-free, so it is the same number whatever slice of season is in view
     * and the one figure worth reading off a two-game sample. Null when the spot
     * cost nothing (a free agent, or an unpriced row), where a ratio is undefined
     * rather than infinite.
     */
    return_on_salary: number | null;
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
    rows: T[],
    window?: StatWindow
): (T & EarnedValue)[] {
    // No window means the caller is pricing a finished season, which is the
    // arithmetic this module was written for: fraction 1, and every line below
    // reduces to what it did before windows existed.
    const fraction = window ? window.fraction : 1;
    const eligible = rows.filter((r) => r.position !== "K" && !r.is_college);
    if (eligible.length === 0) return [];
    // Nothing has been played, so there is nothing to price. An empty result is
    // the same answer the degenerate-pool guard below gives, and callers already
    // render their own empty state for it.
    if (fraction <= 0) return [];

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

    const dollarPerPoint = distributableCap(fraction) / totalPositive;
    // The floor is a roster spot's cost, so it is prorated with everything else:
    // over two weeks a replacement-level body has earned two weeks of his $1.
    const floor = MIN_PLAYER_SALARY * fraction;
    // Whole dollars read best and are what a finished season has always shown.
    // Prorated to a fortnight they would collapse the whole board into 0s and 1s,
    // so a partial window rounds to cents instead. A single decimal is not enough:
    // at 2/17 the salary floor lands at $0.12, and rounding that to $0.1 puts a
    // 20% error on every figure at the bottom of the board.
    const money = (v: number) => {
        const rounded = fraction >= 1 ? Math.round(v) : Math.round(v * 100) / 100;
        // `realized_surplus` is now a difference of unrounded dollars, so a player
        // who broke exactly even lands on a value like -1e-13, and `Math.round` of
        // that is negative zero — which renders as "-$0".
        return rounded === 0 ? 0 : rounded;
    };

    return eligible.map((row, i) => {
        const par = above[i];
        const rawValue = par > 0 ? floor + par * dollarPerPoint : floor;
        const rawSalary = row.price * fraction;
        return {
            ...row,
            replacement_points: replacementPoints[row.position] ?? 0,
            points_above_replacement: Math.round(par * 10) / 10,
            earned_value: money(rawValue),
            salary_to_date: money(rawSalary),
            // Derived from the unrounded pair, then rounded once. Subtracting two
            // already-rounded figures would let the difference carry both their
            // errors, which at a 2/17 scale is most of its magnitude.
            realized_surplus: money(rawValue - rawSalary),
            // Likewise: a ratio built from rounded dollars is not the same ratio.
            // Taking it from the raw pair is what makes it hold its value across
            // windows, which is the property that makes it worth reading in week 2.
            return_on_salary:
                rawSalary > 0 ? Math.round((rawValue / rawSalary) * 100) / 100 : null,
        };
    });
}

/**
 * Convenience wrapper over a full `Player[]` — what `fetchPlayersEndOfSeason()`
 * returns — so a caller does not have to project the rows down by hand.
 */
export function calculateEarnedValue(
    players: Player[],
    window?: StatWindow
): EarnedValuePlayer[] {
    return computeEarnedValue(players, window);
}

/**
 * Dollars-per-point of production, earned. The retrospective twin of
 * `computeDollarPerVorp` — useful for reading how much a point was worth in a
 * given season, which drifts with the scoring environment.
 */
export function computeDollarPerEarnedPoint(
    rows: EarnedValueInput[],
    window?: StatWindow
): number {
    const priced = computeEarnedValue(rows, window);
    const totalPositive = priced
        .filter((p) => p.points_above_replacement > 0)
        .reduce((sum, p) => sum + p.points_above_replacement, 0);
    if (totalPositive === 0) return 0;
    return distributableCap(window ? window.fraction : 1) / totalPositive;
}
