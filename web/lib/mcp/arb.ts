/**
 * Arbitration-target math for the MCP server, parameterized by perspective.
 *
 * `analyzeArbitration()` in lib/arbitration.ts hardcodes the MY_TEAM
 * viewpoint (it excludes my roster from the target pool), which is wrong for
 * an external consumer — a leaguemate wants my players in the pool and their
 * own excluded. This applies the same bump + danger-zone logic with the
 * excluded team as an argument (or nobody excluded for a league-wide view).
 */

import { ARB_MAX_PER_PLAYER_PER_TEAM } from "../config";
import type { SurplusPlayer, ArbitrationTarget } from "../types";

/**
 * Identify arbitration targets among rostered players, excluding kickers and
 * (optionally) one team's roster. Mirrors `analyzeArbitration`: applies the
 * max single-team raise on top of current salary, then keeps the "danger
 * zone" — players whose surplus is at least -10 and whose dollar value
 * exceeds $1 — sorted by surplus descending.
 */
export function analyzeArbTargets(
  surplusPlayers: SurplusPlayer[],
  excludeTeam?: string,
): ArbitrationTarget[] {
  const pool = surplusPlayers.filter(
    (p) =>
      p.team_name != null &&
      p.team_name !== "" &&
      p.team_name !== "FA" &&
      (excludeTeam == null || p.team_name !== excludeTeam) &&
      p.position !== "K",
  );

  const targets: ArbitrationTarget[] = pool.map((p) => {
    const salaryAfterArb = p.price + ARB_MAX_PER_PLAYER_PER_TEAM;
    return {
      ...p,
      salary_after_arb: salaryAfterArb,
      surplus_after_arb: p.dollar_value - salaryAfterArb,
    };
  });

  return targets
    .filter((t) => t.surplus >= -10 && t.dollar_value > 1)
    .sort((a, b) => b.surplus - a.surplus);
}
