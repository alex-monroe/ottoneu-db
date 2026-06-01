/**
 * Lineup planning logic for the Superflex starting lineup.
 *
 * Ottoneu League 309 starting lineup (9 starters):
 *   1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX (RB/WR/TE), 1 SUPERFLEX (QB/RB/WR/TE), 1 K.
 *
 * Scores are per-game (PPG) — either each player's projected PPG or their
 * actual PPG from last season. The lineup "score" is the sum of the starters'
 * chosen metric (i.e. projected points for one week's lineup).
 */

export type SlotId =
  | "QB"
  | "RB1"
  | "RB2"
  | "WR1"
  | "WR2"
  | "TE"
  | "FLEX"
  | "SUPERFLEX"
  | "K";

export interface SlotDef {
  id: SlotId;
  /** Display label (multiple slots can share a label, e.g. two "RB"). */
  label: string;
  /** Positions eligible to fill this slot. */
  eligible: readonly string[];
}

/**
 * Slot order is also the display order. Eligibility forms a laminar family
 * ({RB} ⊂ {RB,WR,TE} ⊂ {QB,RB,WR,TE}, {QB} ⊂ superflex, {K} disjoint), which
 * is what makes the greedy optimizer below provably optimal.
 */
export const LINEUP_SLOTS: readonly SlotDef[] = [
  { id: "QB", label: "QB", eligible: ["QB"] },
  { id: "RB1", label: "RB", eligible: ["RB"] },
  { id: "RB2", label: "RB", eligible: ["RB"] },
  { id: "WR1", label: "WR", eligible: ["WR"] },
  { id: "WR2", label: "WR", eligible: ["WR"] },
  { id: "TE", label: "TE", eligible: ["TE"] },
  { id: "FLEX", label: "FLEX", eligible: ["RB", "WR", "TE"] },
  { id: "SUPERFLEX", label: "SUPERFLEX", eligible: ["QB", "RB", "WR", "TE"] },
  { id: "K", label: "K", eligible: ["K"] },
];

export const SLOT_IDS: readonly SlotId[] = LINEUP_SLOTS.map((s) => s.id);

export interface LineupPlayer {
  player_id: string;
  name: string;
  position: string;
  nfl_team: string;
  /** Actual PPG from last season (0 if the player did not play). */
  ppg: number;
  /** Projected PPG (0 when projections are unavailable). */
  projected_ppg: number;
}

export type LineupMetric = "projected" | "last_season";

export type Lineup = Record<SlotId, string | null>;

export function emptyLineup(): Lineup {
  return SLOT_IDS.reduce((acc, id) => {
    acc[id] = null;
    return acc;
  }, {} as Lineup);
}

/** Score accessor for a player under the chosen metric. */
export function getMetricScore(p: LineupPlayer, metric: LineupMetric): number {
  return metric === "projected" ? p.projected_ppg : p.ppg;
}

export function isEligible(slot: SlotDef, position: string): boolean {
  return slot.eligible.includes(position);
}

/**
 * Greedy optimal lineup. Processes slots from the most restrictive (smallest
 * eligible set) to the least restrictive, assigning the best remaining
 * eligible player to each. Optimal because the eligibility family is laminar.
 */
export function optimizeLineup(
  players: readonly LineupPlayer[],
  metric: LineupMetric
): Lineup {
  const lineup = emptyLineup();
  const used = new Set<string>();
  const order = [...LINEUP_SLOTS].sort(
    (a, b) => a.eligible.length - b.eligible.length
  );

  for (const slot of order) {
    let best: LineupPlayer | null = null;
    let bestScore = -Infinity;
    for (const p of players) {
      if (used.has(p.player_id)) continue;
      if (!isEligible(slot, p.position)) continue;
      const score = getMetricScore(p, metric);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) {
      lineup[slot.id] = best.player_id;
      used.add(best.player_id);
    }
  }
  return lineup;
}

/** Total of the starters' chosen metric. */
export function lineupTotal(
  lineup: Lineup,
  playerMap: Map<string, LineupPlayer>,
  metric: LineupMetric
): number {
  let total = 0;
  for (const id of SLOT_IDS) {
    const pid = lineup[id];
    if (!pid) continue;
    const p = playerMap.get(pid);
    if (p) total += getMetricScore(p, metric);
  }
  return total;
}
