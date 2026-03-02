import {
  ARB_BUDGET_PER_TEAM,
  ARB_MIN_PER_TEAM,
  ARB_MAX_PER_TEAM,
  ARB_MAX_PER_PLAYER_PER_TEAM,
} from "./config";
import { TeamBudgetStatus } from "./types";

export interface PlanValidation {
  teamStatuses: TeamBudgetStatus[];
  totalAllocated: number;
  totalBudget: number;
  remaining: number;
  isValid: boolean;
  errors: string[];
}

/**
 * Validates an arbitration plan's allocations against budget constraints.
 *
 * @param allocations - Record of player_id -> amount (0-4)
 * @param playerTeamMap - Record of player_id -> team_name
 * @param opponentTeams - List of all opponent team names
 */
export function validatePlan(
  allocations: Record<string, number>,
  playerTeamMap: Record<string, string>,
  opponentTeams: string[]
): PlanValidation {
  const errors: string[] = [];

  // Calculate per-team totals
  const teamTotals = new Map<string, number>();
  for (const team of opponentTeams) {
    teamTotals.set(team, 0);
  }

  for (const [playerId, amount] of Object.entries(allocations)) {
    if (amount <= 0) continue;
    if (amount > ARB_MAX_PER_PLAYER_PER_TEAM) {
      errors.push(`A player has allocation $${amount}, max is $${ARB_MAX_PER_PLAYER_PER_TEAM}`);
    }
    const team = playerTeamMap[playerId];
    if (team) {
      teamTotals.set(team, (teamTotals.get(team) ?? 0) + amount);
    }
  }

  const teamStatuses: TeamBudgetStatus[] = opponentTeams.map((team) => {
    const allocated = teamTotals.get(team) ?? 0;
    const isValid = allocated >= ARB_MIN_PER_TEAM && allocated <= ARB_MAX_PER_TEAM;
    return { team_name: team, allocated, isValid };
  });

  // Check per-team constraints
  for (const status of teamStatuses) {
    if (status.allocated > ARB_MAX_PER_TEAM) {
      errors.push(`${status.team_name}: $${status.allocated} exceeds max $${ARB_MAX_PER_TEAM}`);
    }
  }

  const totalAllocated = teamStatuses.reduce((sum, t) => sum + t.allocated, 0);
  const remaining = ARB_BUDGET_PER_TEAM - totalAllocated;

  if (totalAllocated > ARB_BUDGET_PER_TEAM) {
    errors.push(`Total $${totalAllocated} exceeds budget $${ARB_BUDGET_PER_TEAM}`);
  }

  // Check under-allocated teams only when budget is fully spent
  if (totalAllocated === ARB_BUDGET_PER_TEAM) {
    for (const status of teamStatuses) {
      if (status.allocated < ARB_MIN_PER_TEAM) {
        errors.push(`${status.team_name}: $${status.allocated} below min $${ARB_MIN_PER_TEAM}`);
      }
    }
  }

  const isValid =
    totalAllocated === ARB_BUDGET_PER_TEAM &&
    teamStatuses.every((t) => t.isValid) &&
    errors.length === 0;

  return {
    teamStatuses: teamStatuses.sort((a, b) => b.allocated - a.allocated),
    totalAllocated,
    totalBudget: ARB_BUDGET_PER_TEAM,
    remaining,
    isValid,
    errors,
  };
}
