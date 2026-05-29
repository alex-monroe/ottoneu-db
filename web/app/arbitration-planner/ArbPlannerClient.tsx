"use client";

import { useMemo } from "react";
import {
  ArbitrationPlan,
  ArbitrationTarget,
  PlayerHoverData,
  TeamAllocation,
} from "@/lib/types";
import ArbPlannerCore from "@/components/arb-planner/ArbPlannerCore";
import type { ComparisonMetricColumn } from "@/components/arb-planner/PlanComparison";

interface ArbPlannerClientProps {
  targets: ArbitrationTarget[];
  suggestedAllocations: TeamAllocation[];
  initialPlans: ArbitrationPlan[];
  opponentTeams: string[];
  adjustedSurplusEntries: { player_id: string; adjustment: number }[];
  hoverDataMap?: Record<string, PlayerHoverData> | null;
}

const surplusMetricColumn: ComparisonMetricColumn<ArbitrationTarget> = {
  label: "Surplus",
  getValue: (p) => p.surplus,
  render: (v) => `$${v}`,
  cellClassName: (v) =>
    `px-3 py-2 text-right font-medium ${
      v >= 0
        ? "text-green-600 dark:text-green-400"
        : "text-red-600 dark:text-red-400"
    }`,
};

function sortBySurplusDesc(a: ArbitrationTarget, b: ArbitrationTarget) {
  return b.surplus - a.surplus;
}

export default function ArbPlannerClient({
  targets,
  suggestedAllocations,
  initialPlans,
  opponentTeams,
  adjustedSurplusEntries,
  hoverDataMap,
}: ArbPlannerClientProps) {
  const playerMap = useMemo(
    () => new Map(targets.map((t) => [t.player_id, t])),
    [targets]
  );

  // Adjusted surplus map (raw surplus + per-player adjustment)
  const adjustedSurplus = useMemo(() => {
    if (adjustedSurplusEntries.length === 0) return undefined;
    const map = new Map<string, number>();
    for (const entry of adjustedSurplusEntries) {
      const player = playerMap.get(entry.player_id);
      if (player) {
        map.set(entry.player_id, player.surplus + entry.adjustment);
      }
    }
    return map;
  }, [adjustedSurplusEntries, playerMap]);

  // Build allocations from suggested per-team budgets (used by "Create from Suggested")
  const buildSuggestedAllocations = useMemo(() => {
    return () => {
      const newAllocations: Record<string, number> = {};

      // O(1) lookup keyed by name|team to avoid an O(N^2) nested scan.
      const targetMap = new Map<string, ArbitrationTarget>();
      for (const t of targets) {
        targetMap.set(`${t.name}|${t.team_name}`, t);
      }

      for (const team of suggestedAllocations) {
        let remaining = team.suggested;
        for (const player of team.players) {
          if (remaining <= 0) break;
          const target = targetMap.get(`${player.name}|${team.team}`);
          if (!target) continue;
          const amount = Math.min(4, remaining);
          newAllocations[target.player_id] = amount;
          remaining -= amount;
        }
      }

      return newAllocations;
    };
  }, [targets, suggestedAllocations]);

  return (
    <ArbPlannerCore
      players={targets}
      initialPlans={initialPlans}
      opponentTeams={opponentTeams}
      sortPlayers={sortBySurplusDesc}
      metricColumn={surplusMetricColumn}
      showSurplus
      adjustedSurplus={adjustedSurplus}
      hoverDataMap={hoverDataMap}
      nameMode="link"
      buildSuggestedAllocations={buildSuggestedAllocations}
    />
  );
}
