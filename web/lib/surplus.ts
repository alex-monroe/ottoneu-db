import { NUM_TEAMS, CAP_PER_TEAM, ROSTER_SPOTS, MIN_PLAYER_SALARY } from "./config";
import { Player, SurplusPlayer, ProjectedSalaryPlayer } from "./types";
import { calculateVorp } from "./vorp";

/**
 * The money a league has to spend on production *above* replacement level.
 *
 * An auction is a closed economy: every dollar of cap ends up on somebody, so
 * dollar values are not absolute — they are a share of a fixed pot. Every one
 * of the league's roster spots must be filled, and the cheapest a spot can be
 * filled for is the minimum salary, so that floor is committed before any
 * bidding starts. What is left is what actually chases production:
 *
 *   league cap     = 12 teams × $400            = $4,800
 *   salary floor   = (12 × 20 spots) × $1       =   $240
 *   distributable  = $4,800 − $240              = $4,560
 *
 * This replaced a flat `× 0.875` factor ($4,200), which was the same idea
 * carrying a magic number instead of the arithmetic. Deriving it has a property
 * the constant lacked: dollar values now sum to exactly the league cap, because
 * every rostered player is priced at `MIN_PLAYER_SALARY + his share of the
 * remainder`.
 *
 * Note this prices a **full-reset market** — what the league would pay if every
 * contract cleared at once — which is the frame the FanGraphs auction
 * calculator uses and the right one for "what is this player worth". An actual
 * Ottoneu auction distributes only the *uncommitted* cap (the rest is tied up
 * in keepers), so in-year auction prices run below these values by whatever
 * share of the cap is already committed. See docs/references/player-valuation.md.
 */
export function distributableCap(): number {
    const leagueCap = NUM_TEAMS * CAP_PER_TEAM;
    const salaryFloor = NUM_TEAMS * ROSTER_SPOTS * MIN_PLAYER_SALARY;
    return leagueCap - salaryFloor;
}

/**
 * Calculates the surplus value (dollar_value - salary) for each player based on their VORP.
 *
 * Every player is worth at least the minimum salary; above-replacement players
 * additionally split the distributable cap in proportion to their VORP.
 */
export function calculateSurplus(
    players: Player[],
    adjustments?: Map<string, number>
): SurplusPlayer[] {
    const { players: vorpPlayers } = calculateVorp(players);
    if (vorpPlayers.length === 0) return [];

    const dollarPerVorp = computeDollarPerVorpFrom(vorpPlayers);
    if (dollarPerVorp === 0) return [];

    return vorpPlayers.map((p) => {
        // A below-replacement player is worth the floor every roster spot costs,
        // and nothing more — which is what the market pays for bench filler.
        const rawDollarValue =
            p.full_season_vorp > 0
                ? MIN_PLAYER_SALARY + p.full_season_vorp * dollarPerVorp
                : MIN_PLAYER_SALARY;
        const baseDollarValue = Math.round(Math.max(rawDollarValue, MIN_PLAYER_SALARY));
        const adjustment = adjustments?.get(p.player_id) ?? 0;
        const dollarValue = Math.round(Math.max(baseDollarValue + adjustment, MIN_PLAYER_SALARY));
        return {
            ...p,
            dollar_value: dollarValue,
            surplus: dollarValue - p.price,
        };
    });
}

/**
 * Computes the dollar-per-VORP conversion rate from a set of players.
 * Useful for reverse-engineering PPG targets from dollar values.
 *
 * This is the market price of a point of production — it drifts every season
 * with the projection set and roster composition, and is not a constant.
 */
export function computeDollarPerVorp(players: Player[]): number {
    const { players: vorpPlayers } = calculateVorp(players);
    return computeDollarPerVorpFrom(vorpPlayers);
}

/** Shared rate calculation, so the rate and the values can never disagree. */
function computeDollarPerVorpFrom(vorpPlayers: { full_season_vorp: number }[]): number {
    const totalPositiveVorp = vorpPlayers
        .filter((p) => p.full_season_vorp > 0)
        .reduce((sum, p) => sum + p.full_season_vorp, 0);
    if (totalPositiveVorp === 0) return 0;
    return distributableCap() / totalPositiveVorp;
}

/**
 * Analyzes one team's projected salary by categorizing players into keep/cut
 * classifications based on surplus value thresholds.
 *
 * `myTeam` is the viewer's team (web/lib/viewer-team.ts), not a global
 * constant — two managers looking at this page must see their own rosters.
 * A null team (nobody signed in, or no team bound) yields no rows.
 */
export function analyzeProjectedSalary(
    allPlayers: Player[],
    myTeam: string | null
): ProjectedSalaryPlayer[] {
    if (!myTeam) return [];
    const surplusPlayers = calculateSurplus(allPlayers);
    if (surplusPlayers.length === 0) return [];

    const myRoster = surplusPlayers.filter((p) => p.team_name === myTeam);
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