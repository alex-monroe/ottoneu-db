/**
 * Pure transforms for the /arb-progress page.
 *
 * Every function here takes plain input and returns plain output — no DB,
 * no network, no React. The page component orchestrates these into a view.
 */
import { ARB_BUDGET_PER_TEAM, ARB_MAX_PER_PLAYER_LEAGUE, NUM_TEAMS } from "./config";
import type { CorePlayer } from "./types";

export interface TeamStatus {
  team_name: string;
  is_complete: boolean;
  scraped_at: string;
}

export interface AllocationRow {
  player_name: string;
  ottoneu_id: number | null;
  team_name: string | null;
  current_salary: number | null;
  raise_amount: number;
  new_salary: number | null;
}

export interface AllocationDetailRow {
  ottoneu_id: number;
  player_name: string;
  owner_team_name: string;
  allocating_team_name: string;
  amount: number;
}

export interface Allocation {
  [key: string]: string | number | boolean | null | undefined;
  name: string;
  player_id: string | null;
  ottoneu_id: number | null;
  team_name: string | null;
  current_salary: number | null;
  raise_amount: number;
  new_salary: number | null;
  projected_raise: number | null;
  projected_salary: number | null;
}

export interface PlayerAllocationDetail {
  allocating_team_name: string;
  amount: number;
}

export interface TeamSpendingRow {
  [key: string]: string | number | boolean | null | undefined;
  team_name: string;
  total_spent: number;
  players_targeted: number;
  budget_remaining: number;
}

export interface TeamSpendingEntry {
  row: TeamSpendingRow;
  allocations: {
    player_name: string;
    owner_team_name: string;
    amount: number;
  }[];
}

export interface TeamSpendingSummary {
  entries: TeamSpendingEntry[];
  teamSpentTotals: Map<string, number>;
}

/** Number of teams eligible to allocate against any given player (all but the owner). */
const ELIGIBLE_TEAMS = NUM_TEAMS - 1;

/**
 * Build a lookup from ottoneu_id → internal player_id. Players without an
 * ottoneu_id are skipped.
 */
export function buildOttoneuToPlayerIdMap(
  players: Pick<CorePlayer, "player_id" | "ottoneu_id">[]
): Map<number, string> {
  const map = new Map<number, string>();
  for (const p of players) {
    if (p.ottoneu_id != null) map.set(p.ottoneu_id, p.player_id);
  }
  return map;
}

/**
 * Combine raw allocation rows with the ottoneu→player_id lookup into
 * `Allocation` rows. Projected fields are left null; call `applyProjectedRaises`
 * to fill them in.
 */
export function buildAllocations(
  rows: AllocationRow[],
  ottoneuToPlayerId: Map<number, string>
): Allocation[] {
  return rows.map((row) => ({
    ...row,
    name: row.player_name,
    player_id: row.ottoneu_id != null ? (ottoneuToPlayerId.get(row.ottoneu_id) ?? null) : null,
    projected_raise: null,
    projected_salary: null,
  }));
}

/**
 * Extrapolate final raises assuming remaining teams allocate at the same rate
 * as the completed ones. Each player can be raised by 11 teams (everyone except
 * their owner), so the extrapolation factor is 11 / (eligible teams complete).
 *
 * Example with 6 of 12 teams complete:
 *   Player on a complete team   → 5 of 11 eligible have weighed in → factor 11/5 = 2.2x
 *   Player on an incomplete team → 6 of 11 eligible have weighed in → factor 11/6 = 1.83x
 *
 * Mutates each allocation's `projected_raise` / `projected_salary` in place.
 */
export function applyProjectedRaises(allocations: Allocation[], teams: TeamStatus[]): void {
  const completeTeamNames = new Set(teams.filter((t) => t.is_complete).map((t) => t.team_name));
  const completeCount = completeTeamNames.size;
  const allComplete = completeCount === NUM_TEAMS;

  for (const a of allocations) {
    const ownerIsComplete = a.team_name ? completeTeamNames.has(a.team_name) : false;
    const eligibleComplete = completeCount - (ownerIsComplete ? 1 : 0);

    if (eligibleComplete > 0 && !allComplete) {
      const rawProjected = a.raise_amount * (ELIGIBLE_TEAMS / eligibleComplete);
      a.projected_raise = Math.min(Math.round(rawProjected), ARB_MAX_PER_PLAYER_LEAGUE);
    } else {
      a.projected_raise = a.raise_amount;
    }
    a.projected_salary = a.current_salary != null ? a.current_salary + a.projected_raise : null;
  }
}

/** Total raises received per team (sum of raise_amount grouped by owner). */
export function buildTeamRaiseTotals(allocations: Allocation[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const a of allocations) {
    if (a.team_name) {
      totals.set(a.team_name, (totals.get(a.team_name) ?? 0) + a.raise_amount);
    }
  }
  return totals;
}

/** Group allocation details by player (ottoneu_id), preserving order. */
export function buildDetailsByPlayer(
  details: AllocationDetailRow[]
): Record<number, PlayerAllocationDetail[]> {
  const grouped: Record<number, PlayerAllocationDetail[]> = {};
  for (const d of details) {
    (grouped[d.ottoneu_id] ??= []).push({
      allocating_team_name: d.allocating_team_name,
      amount: d.amount,
    });
  }
  return grouped;
}

/**
 * Summarize per-team spending: rows for the spending table plus a lookup of
 * total dollars each team has spent (used on the team status cards). Entries
 * are sorted by total spent descending.
 */
export function buildTeamSpending(details: AllocationDetailRow[]): TeamSpendingSummary {
  const spendingMap = new Map<string, { total: number; allocations: TeamSpendingEntry["allocations"] }>();
  for (const d of details) {
    let entry = spendingMap.get(d.allocating_team_name);
    if (!entry) {
      entry = { total: 0, allocations: [] };
      spendingMap.set(d.allocating_team_name, entry);
    }
    entry.total += d.amount;
    entry.allocations.push({
      player_name: d.player_name,
      owner_team_name: d.owner_team_name,
      amount: d.amount,
    });
  }

  const entries: TeamSpendingEntry[] = Array.from(spendingMap.entries())
    .map(([team, info]) => ({
      row: {
        team_name: team,
        total_spent: info.total,
        players_targeted: info.allocations.length,
        budget_remaining: ARB_BUDGET_PER_TEAM - info.total,
      },
      allocations: info.allocations,
    }))
    .sort((a, b) => b.row.total_spent - a.row.total_spent);

  const teamSpentTotals = new Map<string, number>();
  for (const [team, info] of spendingMap) {
    teamSpentTotals.set(team, info.total);
  }

  return { entries, teamSpentTotals };
}
