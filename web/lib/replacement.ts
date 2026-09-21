/**
 * Lineup-derived replacement level — the flex-aware baseline shared by the
 * prospective valuation (`vorp.ts`, projected PPG) and the retrospective one
 * (`earned-value.ts`, actual season points).
 *
 * ## Why this is not a per-position constant
 *
 * The old baseline was a hand-typed rank per position (QB24/RB30/WR30/TE20).
 * That silently assumes each position's demand is independent, which is false
 * the moment a lineup has a flex slot: the marginal QB, RB, WR and TE all
 * compete for the *same* roster spot. In a superflex league that error is not
 * small — it is the single biggest format-specific distortion (see
 * docs/references/ottoneu-strategy.md §3).
 *
 * So demand is *derived* from the lineup instead:
 *
 *   1. **Dedicated slots** — every position starts `NUM_TEAMS × STARTING_LINEUP[pos]`
 *      players leaguewide. At 12 teams that is QB 12, RB 24, WR 24, TE 12, K 12.
 *   2. **Flex and depth slots** — the remaining
 *      `NUM_TEAMS × (FLEX_SLOTS + BENCH_DEPTH_PER_TEAM)` slots are handed out
 *      one at a time to whichever eligible position offers the highest *next*
 *      player (greedy marginal allocation). In superflex the flex answer is
 *      essentially always QB, which is precisely why QB demand lands near 24
 *      and the QB baseline is so brutal. Nobody types that number in; it falls
 *      out of counting slots.
 *
 * The replacement level for a position is then the value of the player at its
 * demand rank. That player's value above replacement is zero by construction,
 * so he is worth exactly the minimum salary.
 *
 * ## How deep the pool goes is a calibration, and it is the one knob
 *
 * `BENCH_DEPTH_PER_TEAM` is the number of roster spots per team, beyond the
 * nominal starting lineup, that hold players who actually enter lineups over a
 * season — bye-week and injury coverage. It is the only judgement call left in
 * the construction, and it matters enormously, because it sets how concentrated
 * the money is:
 *
 *   - Count **starters only** and the pool is 84 players. The board goes
 *     violently top-heavy (the best player clears roughly half a team's cap)
 *     and everyone outside the pool is worth exactly the minimum — which is not
 *     what an Ottoneu auction looks like.
 *   - Count **every roster spot**, the way the FanGraphs baseball calculator
 *     does, and the pool is 228. The board flattens until a stud and a middling
 *     starter are priced within $20 of each other — also not what an auction
 *     looks like. The premise that fails here is that all 240 spots chase
 *     current production: real rosters spend theirs on prospects, injured
 *     stashes and lottery tickets.
 *
 * The truth is in between, so it is a number rather than a principle, and it
 * lives in config where it can be fitted against real auction clears
 * (`transactions`, `draft_sharks_values`) rather than argued about. The default
 * of 2 puts the pool at ~108, which is deliberately close to the scale the
 * superseded hand-typed ranks produced — so this change alters the *shape* of
 * the board (which is the actual fix) without silently repricing it wholesale.
 *
 * See docs/references/player-valuation.md for the full derivation.
 */
import {
    NUM_TEAMS,
    STARTING_LINEUP,
    FLEX_SLOTS,
    BENCH_DEPTH_PER_TEAM,
    FLEX_POSITIONS,
} from "./config";

/** Per-position player values, best-first. Callers need not pre-sort. */
export type ValuesByPosition = Record<string, number[]>;

export interface ReplacementLevels {
    /** Value of the marginal ownable player at each position. */
    level: Record<string, number>;
    /** Leaguewide demand (how many of that position are started). */
    rank: Record<string, number>;
}

/**
 * Leaguewide demand per position: dedicated starting slots, plus the flex and
 * depth slots allocated greedily to the best available marginal player.
 *
 * `valuesByPosition` supplies the candidate pool; positions absent from it get
 * no demand (this is how kickers stay out of the VORP math — they are filtered
 * upstream, so no K slot is ever allocated even though the lineup has one).
 *
 * The greedy loop is deterministic: ties resolve to the first position in
 * `FLEX_POSITIONS` order, and it stops early if every eligible pool is
 * exhausted.
 */
export function allocateLineupDemand(
    valuesByPosition: ValuesByPosition,
    numTeams: number = NUM_TEAMS
): Record<string, number> {
    const sorted = sortDescending(valuesByPosition);
    const demand: Record<string, number> = {};

    for (const [pos, perTeam] of Object.entries(STARTING_LINEUP)) {
        if (!(pos in sorted)) continue;
        demand[pos] = perTeam * numTeams;
    }

    const eligible = FLEX_POSITIONS.filter((pos) => pos in sorted);
    let remaining = (FLEX_SLOTS + BENCH_DEPTH_PER_TEAM) * numTeams;

    while (remaining > 0) {
        let bestPos: string | null = null;
        let bestValue = -Infinity;

        for (const pos of eligible) {
            // The next player at this position is the one just past current demand.
            const next = sorted[pos][demand[pos] ?? 0];
            if (next === undefined) continue; // pool exhausted at this position
            if (next > bestValue) {
                bestValue = next;
                bestPos = pos;
            }
        }

        if (bestPos === null) break; // every eligible pool is exhausted
        demand[bestPos] = (demand[bestPos] ?? 0) + 1;
        remaining -= 1;
    }

    return demand;
}

/**
 * Replacement level (value of the marginal ownable player) per position.
 *
 * When a position's pool is shallower than its demand — early-season data, a
 * sparse test fixture — the rank clamps to the worst available player rather
 * than falling off the end. That is the same degradation the old fixed-rank
 * fallback provided, without needing a second code path.
 */
export function computeReplacementLevels(
    valuesByPosition: ValuesByPosition,
    numTeams: number = NUM_TEAMS
): ReplacementLevels {
    const sorted = sortDescending(valuesByPosition);
    const rank = allocateLineupDemand(sorted, numTeams);
    const level: Record<string, number> = {};

    for (const pos of Object.keys(sorted)) {
        level[pos] = valueAtRank(sorted[pos], rank[pos] ?? 0);
    }

    return { level, rank };
}

/**
 * The value at a 1-indexed rank, clamped into range. An empty pool has no
 * replacement level, which reads as 0 (every player is then above replacement).
 */
export function valueAtRank(descending: number[], rank: number): number {
    if (descending.length === 0) return 0;
    const index = Math.min(Math.max(rank, 1), descending.length) - 1;
    return descending[index];
}

function sortDescending(valuesByPosition: ValuesByPosition): ValuesByPosition {
    const out: ValuesByPosition = {};
    for (const [pos, values] of Object.entries(valuesByPosition)) {
        out[pos] = [...values].sort((a, b) => b - a);
    }
    return out;
}
