/**
 * Arbitration-target math for the MCP server, over already-computed surplus.
 *
 * This exists separately from `analyzeArbitration()` in lib/arbitration.ts
 * because that function recomputes surplus from raw players, while MCP tools
 * already hold a surplus pool. Both are viewer-relative — they take the team to
 * exclude as an argument — so a leaguemate's targets include the operator's
 * players and exclude their own. Passing no team excludes nobody, which is the
 * league-wide view.
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
