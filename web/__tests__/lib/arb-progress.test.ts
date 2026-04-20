/**
 * Unit tests for arb-progress.ts — pure transforms for the /arb-progress page.
 */
import {
  AllocationDetailRow,
  AllocationRow,
  TeamStatus,
  applyProjectedRaises,
  buildAllocations,
  buildDetailsByPlayer,
  buildOttoneuToPlayerIdMap,
  buildTeamRaiseTotals,
  buildTeamSpending,
} from "@/lib/arb-progress";
import { ARB_BUDGET_PER_TEAM, ARB_MAX_PER_PLAYER_LEAGUE, NUM_TEAMS } from "@/lib/config";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEAM_NAMES = Array.from({ length: NUM_TEAMS }, (_, i) => `Team ${i + 1}`);

function makeTeams(completeCount: number): TeamStatus[] {
  return TEAM_NAMES.map((team_name, i) => ({
    team_name,
    is_complete: i < completeCount,
    scraped_at: "2026-04-19T12:00:00Z",
  }));
}

function makeAllocationRow(overrides: Partial<AllocationRow> = {}): AllocationRow {
  return {
    player_name: "Player X",
    ottoneu_id: 100,
    team_name: "Team 1",
    current_salary: 20,
    raise_amount: 4,
    new_salary: 24,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildOttoneuToPlayerIdMap
// ---------------------------------------------------------------------------

describe("buildOttoneuToPlayerIdMap", () => {
  it("returns an empty map for no players", () => {
    expect(buildOttoneuToPlayerIdMap([]).size).toBe(0);
  });

  it("maps ottoneu_id → player_id, skipping null ottoneu_ids", () => {
    const map = buildOttoneuToPlayerIdMap([
      { player_id: "a", ottoneu_id: 1 },
      { player_id: "b", ottoneu_id: 2 },
      { player_id: "c", ottoneu_id: null as unknown as number }, // simulate missing id
    ]);
    expect(map.size).toBe(2);
    expect(map.get(1)).toBe("a");
    expect(map.get(2)).toBe("b");
  });
});

// ---------------------------------------------------------------------------
// buildAllocations
// ---------------------------------------------------------------------------

describe("buildAllocations", () => {
  it("returns an empty array for no rows", () => {
    expect(buildAllocations([], new Map())).toEqual([]);
  });

  it("looks up player_id and leaves projected fields null", () => {
    const rows = [makeAllocationRow({ ottoneu_id: 42 })];
    const idMap = new Map<number, string>([[42, "player-42"]]);
    const [alloc] = buildAllocations(rows, idMap);
    expect(alloc.player_id).toBe("player-42");
    expect(alloc.name).toBe("Player X");
    expect(alloc.projected_raise).toBeNull();
    expect(alloc.projected_salary).toBeNull();
  });

  it("sets player_id to null when ottoneu_id is missing or not in the map", () => {
    const rows = [
      makeAllocationRow({ ottoneu_id: null }),
      makeAllocationRow({ ottoneu_id: 999 }),
    ];
    const out = buildAllocations(rows, new Map());
    expect(out[0].player_id).toBeNull();
    expect(out[1].player_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyProjectedRaises
// ---------------------------------------------------------------------------

describe("applyProjectedRaises", () => {
  it("leaves projected_raise equal to raise_amount when no teams are complete", () => {
    const allocs = buildAllocations([makeAllocationRow({ raise_amount: 3 })], new Map());
    applyProjectedRaises(allocs, makeTeams(0));
    expect(allocs[0].projected_raise).toBe(3);
    expect(allocs[0].projected_salary).toBe(23);
  });

  it("extrapolates with factor 11/6 when 6 non-owner teams are complete", () => {
    // Player owned by Team 1 (not complete in this fixture); 6 non-owner teams complete.
    const allocs = buildAllocations([makeAllocationRow({ raise_amount: 6, team_name: "Team 12" })], new Map());
    applyProjectedRaises(allocs, makeTeams(6));
    // 6 complete teams, owner (Team 12) is NOT complete → eligibleComplete = 6.
    // Projected = 6 * (11/6) = 11.
    expect(allocs[0].projected_raise).toBe(11);
    expect(allocs[0].projected_salary).toBe(20 + 11);
  });

  it("subtracts the owner from eligibleComplete when owner team is complete", () => {
    // 6 complete teams including the owner → eligibleComplete = 5 → factor 11/5 = 2.2x.
    const allocs = buildAllocations([makeAllocationRow({ raise_amount: 5, team_name: "Team 1" })], new Map());
    applyProjectedRaises(allocs, makeTeams(6));
    expect(allocs[0].projected_raise).toBe(Math.round(5 * (11 / 5))); // 11
  });

  it("caps projected_raise at ARB_MAX_PER_PLAYER_LEAGUE", () => {
    // Huge raise with only a couple teams done → extrapolation would exceed the cap.
    const allocs = buildAllocations([makeAllocationRow({ raise_amount: 8, team_name: "Team 12" })], new Map());
    applyProjectedRaises(allocs, makeTeams(2));
    // 8 * (11/2) = 44. Exactly the cap — verify it never exceeds it.
    expect(allocs[0].projected_raise).toBeLessThanOrEqual(ARB_MAX_PER_PLAYER_LEAGUE);
  });

  it("uses actual raise when all teams are complete", () => {
    const allocs = buildAllocations([makeAllocationRow({ raise_amount: 9 })], new Map());
    applyProjectedRaises(allocs, makeTeams(NUM_TEAMS));
    expect(allocs[0].projected_raise).toBe(9);
  });

  it("leaves projected_salary null when current_salary is null", () => {
    const allocs = buildAllocations([makeAllocationRow({ current_salary: null })], new Map());
    applyProjectedRaises(allocs, makeTeams(4));
    expect(allocs[0].projected_salary).toBeNull();
  });

  it("handles negative raises (shouldn't occur in practice, but still coherent)", () => {
    const allocs = buildAllocations([makeAllocationRow({ raise_amount: -2, team_name: "Team 12" })], new Map());
    applyProjectedRaises(allocs, makeTeams(6));
    // -2 * (11/6) ≈ -3.67 → rounds to -4, capped only on the high side.
    expect(allocs[0].projected_raise).toBe(-4);
  });
});

// ---------------------------------------------------------------------------
// buildTeamRaiseTotals
// ---------------------------------------------------------------------------

describe("buildTeamRaiseTotals", () => {
  it("returns an empty map for no allocations", () => {
    expect(buildTeamRaiseTotals([]).size).toBe(0);
  });

  it("sums raises for a single team", () => {
    const allocs = buildAllocations(
      [
        makeAllocationRow({ team_name: "Team 1", raise_amount: 3 }),
        makeAllocationRow({ team_name: "Team 1", raise_amount: 5 }),
      ],
      new Map()
    );
    const totals = buildTeamRaiseTotals(allocs);
    expect(totals.get("Team 1")).toBe(8);
  });

  it("groups raises across multiple teams", () => {
    const allocs = buildAllocations(
      [
        makeAllocationRow({ team_name: "Team A", raise_amount: 2 }),
        makeAllocationRow({ team_name: "Team B", raise_amount: 7 }),
        makeAllocationRow({ team_name: "Team A", raise_amount: 4 }),
      ],
      new Map()
    );
    const totals = buildTeamRaiseTotals(allocs);
    expect(totals.get("Team A")).toBe(6);
    expect(totals.get("Team B")).toBe(7);
  });

  it("skips rows with a null team", () => {
    const allocs = buildAllocations([makeAllocationRow({ team_name: null })], new Map());
    const totals = buildTeamRaiseTotals(allocs);
    expect(totals.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildDetailsByPlayer
// ---------------------------------------------------------------------------

function makeDetail(overrides: Partial<AllocationDetailRow> = {}): AllocationDetailRow {
  return {
    ottoneu_id: 1,
    player_name: "Player",
    owner_team_name: "Team 1",
    allocating_team_name: "Team 2",
    amount: 3,
    ...overrides,
  };
}

describe("buildDetailsByPlayer", () => {
  it("returns an empty object when no details exist", () => {
    expect(buildDetailsByPlayer([])).toEqual({});
  });

  it("groups details by ottoneu_id", () => {
    const grouped = buildDetailsByPlayer([
      makeDetail({ ottoneu_id: 1, allocating_team_name: "Team A", amount: 3 }),
      makeDetail({ ottoneu_id: 1, allocating_team_name: "Team B", amount: 2 }),
      makeDetail({ ottoneu_id: 2, allocating_team_name: "Team C", amount: 4 }),
    ]);
    expect(grouped[1]).toHaveLength(2);
    expect(grouped[2]).toHaveLength(1);
    expect(grouped[1][0]).toEqual({ allocating_team_name: "Team A", amount: 3 });
  });
});

// ---------------------------------------------------------------------------
// buildTeamSpending
// ---------------------------------------------------------------------------

describe("buildTeamSpending", () => {
  it("returns empty results for no details", () => {
    const { entries, teamSpentTotals } = buildTeamSpending([]);
    expect(entries).toEqual([]);
    expect(teamSpentTotals.size).toBe(0);
  });

  it("aggregates spending for a single allocating team", () => {
    const { entries, teamSpentTotals } = buildTeamSpending([
      makeDetail({ allocating_team_name: "Team A", amount: 3 }),
      makeDetail({ allocating_team_name: "Team A", amount: 5, player_name: "Other Player", ottoneu_id: 2 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].row).toEqual({
      team_name: "Team A",
      total_spent: 8,
      players_targeted: 2,
      budget_remaining: ARB_BUDGET_PER_TEAM - 8,
    });
    expect(teamSpentTotals.get("Team A")).toBe(8);
  });

  it("sorts entries by total_spent descending across multiple teams", () => {
    const { entries } = buildTeamSpending([
      makeDetail({ allocating_team_name: "Small Spender", amount: 2 }),
      makeDetail({ allocating_team_name: "Big Spender", amount: 10 }),
      makeDetail({ allocating_team_name: "Big Spender", amount: 15 }),
      makeDetail({ allocating_team_name: "Mid", amount: 7 }),
    ]);
    expect(entries.map((e) => e.row.team_name)).toEqual([
      "Big Spender",
      "Mid",
      "Small Spender",
    ]);
    expect(entries[0].row.total_spent).toBe(25);
    expect(entries[0].row.budget_remaining).toBe(ARB_BUDGET_PER_TEAM - 25);
  });
});
