/**
 * Which free agents are worth a roster spot on the viewer's team.
 *
 * `/free-agents` used to flag any free agent who beat the *weakest* player the
 * viewer held at that position. In a dynasty roster the weakest player at a
 * position is a college stash, a handcuff, or a young player held for upside —
 * someone kept on purpose who projects near zero for this week. Measured
 * against that, half the wire is an "upgrade", and the flag stops meaning
 * anything.
 *
 * The question the page should answer is narrower: has someone fallen through
 * the cracks who would START for me, or would at least be my first man off the
 * bench? So a free agent is judged against the viewer's optimal starting
 * lineup (the same Superflex optimiser `/lineup` uses), and only falls back to
 * a bench verdict when he beats the viewer's best backup at that position AND
 * is close enough to starter quality to cover a bye or an injury.
 */

import {
  LINEUP_SLOTS,
  getMetricScore,
  lineupTotal,
  optimizeLineup,
  type LineupMetric,
  type LineupPlayer,
} from "./lineup";

/**
 * - `starter`: adding him changes the optimal lineup, by `gain` points.
 * - `bye_fill`: same, but the starter he displaces has no forecast this week
 *   (bye or inactive) — a one-week streamer, not a permanent upgrade.
 * - `bench`: not a starter, but better than every backup the viewer holds at
 *   his position (or the only one) and within `BENCH_FLOOR` of the weakest
 *   starter there.
 */
export type UpgradeKind = "starter" | "bye_fill" | "bench";

export interface UpgradeVerdict {
  kind: UpgradeKind;
  /** Points over the player he would replace (lineup total gain for starters). */
  gain: number;
  /**
   * The rostered player he would replace — the displaced starter, or the best
   * backup. Null when he fills an empty slot or would be the only backup.
   */
  over: LineupPlayer | null;
}

/**
 * A bench pickup has to project at least this fraction of the weakest starter
 * at his position. Without a floor, a roster whose backups are all stashes
 * and handcuffs would flag every warm body above them, which is the problem
 * this module exists to fix.
 */
export const BENCH_FLOOR = 0.8;

/** Positions where holding a backup is a real roster decision. */
const BENCH_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

/**
 * Classify each free agent against the viewer's roster. Free agents that are
 * neither a starter nor a top-bench upgrade are absent from the result.
 */
export function classifyFreeAgents(
  roster: readonly LineupPlayer[],
  freeAgents: readonly LineupPlayer[],
  metric: LineupMetric,
): Map<string, UpgradeVerdict> {
  const out = new Map<string, UpgradeVerdict>();
  if (roster.length === 0) return out;

  const byId = new Map(roster.map((p) => [p.player_id, p]));
  const base = optimizeLineup(roster, metric);
  const baseTotal = lineupTotal(base, byId, metric);
  const starterIds = new Set(
    LINEUP_SLOTS.map((s) => base[s.id]).filter((id): id is string => id != null),
  );

  // Per position: the weakest starter and the best backup.
  const weakestStarter = new Map<string, LineupPlayer>();
  const bestBackup = new Map<string, LineupPlayer>();
  for (const p of roster) {
    const score = getMetricScore(p, metric);
    if (starterIds.has(p.player_id)) {
      const cur = weakestStarter.get(p.position);
      if (!cur || score < getMetricScore(cur, metric)) weakestStarter.set(p.position, p);
    } else {
      const cur = bestBackup.get(p.position);
      if (!cur || score > getMetricScore(cur, metric)) bestBackup.set(p.position, p);
    }
  }

  for (const fa of freeAgents) {
    const score = getMetricScore(fa, metric);
    if (score <= 0) continue;

    // Roster first, so a tie keeps the player the viewer already has.
    const withFa = [...roster, fa];
    const lineup = optimizeLineup(withFa, metric);
    const ids = new Set(Object.values(lineup));
    if (ids.has(fa.player_id)) {
      const gain = lineupTotal(lineup, new Map(withFa.map((p) => [p.player_id, p])), metric) - baseTotal;
      // Exactly one starter leaves the lineup (none, if a slot was empty).
      const displacedId = [...starterIds].find((id) => !ids.has(id));
      const displaced = displacedId ? byId.get(displacedId) : undefined;
      if (gain > 0) {
        const bye = metric === "weekly" && displaced != null && displaced.weekly_points == null;
        out.set(fa.player_id, {
          kind: bye ? "bye_fill" : "starter",
          gain,
          over: displaced ?? null,
        });
        continue;
      }
    }

    if (!BENCH_POSITIONS.has(fa.position)) continue;
    const backup = bestBackup.get(fa.position);
    const starter = weakestStarter.get(fa.position);
    if (!starter) continue;
    const backupScore = backup ? getMetricScore(backup, metric) : 0;
    if (score > backupScore && score >= BENCH_FLOOR * getMetricScore(starter, metric)) {
      out.set(fa.player_id, { kind: "bench", gain: score - backupScore, over: backup ?? null });
    }
  }
  return out;
}
