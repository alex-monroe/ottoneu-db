"use client";

import { ArbitrationPlan, PublicArbPlayer } from "@/lib/types";
import ArbPlannerCore from "@/components/arb-planner/ArbPlannerCore";
import type { ComparisonMetricColumn } from "@/components/arb-planner/PlanComparison";

interface PublicArbPlannerClientProps {
  players: PublicArbPlayer[];
  initialPlans: ArbitrationPlan[];
  opponentTeams: string[];
}

const ppgMetricColumn: ComparisonMetricColumn<PublicArbPlayer> = {
  label: "2025 PPG",
  getValue: (p) => p.ppg,
  render: (v) => v.toFixed(2),
  cellClassName: () => "px-3 py-2 text-right text-slate-900 dark:text-white",
};

function sortByPpgDesc(a: PublicArbPlayer, b: PublicArbPlayer) {
  return b.ppg - a.ppg;
}

export default function PublicArbPlannerClient({
  players,
  initialPlans,
  opponentTeams,
}: PublicArbPlannerClientProps) {
  return (
    <ArbPlannerCore
      players={players}
      initialPlans={initialPlans}
      opponentTeams={opponentTeams}
      sortPlayers={sortByPpgDesc}
      metricColumn={ppgMetricColumn}
      nameMode="plain"
      comparisonBodyRowClassName="border-b border-slate-100 dark:border-slate-800"
      hideCreateFromSuggested
    />
  );
}
