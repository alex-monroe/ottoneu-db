"use client";

import DataTable from "@/components/DataTable";
import type { ArbitrationTarget, Column, HighlightRule, PlayerHoverData } from "@/lib/types";
import {
  playerNameCol,
  positionCol,
  nflTeamCol,
  ownerCol,
  salaryCol,
  valueCol,
} from "@/components/columns";

export type ProjectedTarget = ArbitrationTarget & {
  observed_ppg?: number;
};

const ARB_TARGET_RULES: HighlightRule<ProjectedTarget>[] = [
  { key: "surplus_after_arb", op: "lt", value: 0, className: "bg-red-50 dark:bg-red-950/30" },
];

/**
 * Top-20 arbitration targets table. Columns carry `renderCell` functions, so
 * they must be built inside a client component (functions can't be serialized
 * from a server component into the client DataTable).
 */
export default function ArbTargetsTable({
  data,
  hoverDataMap,
  isProjected,
}: {
  data: ProjectedTarget[];
  hoverDataMap: Record<string, PlayerHoverData> | null;
  isProjected: boolean;
}) {
  const columns: Column<ProjectedTarget>[] = isProjected
    ? [
        playerNameCol<ProjectedTarget>({ hoverDataMap }),
        positionCol<ProjectedTarget>(),
        nflTeamCol<ProjectedTarget>(),
        ownerCol<ProjectedTarget>(),
        salaryCol<ProjectedTarget>(),
        { key: "observed_ppg", label: "Obs PPG", format: "decimal" },
        { key: "ppg", label: "Proj PPG", format: "decimal" },
        valueCol<ProjectedTarget>(),
        { key: "surplus", label: "Surplus", format: "currency" },
        { key: "salary_after_arb", label: "After Arb", format: "currency" },
        { key: "surplus_after_arb", label: "Surplus (Post-Arb)", format: "currency" },
      ]
    : [
        playerNameCol<ProjectedTarget>({ hoverDataMap }),
        positionCol<ProjectedTarget>(),
        nflTeamCol<ProjectedTarget>(),
        ownerCol<ProjectedTarget>(),
        salaryCol<ProjectedTarget>(),
        valueCol<ProjectedTarget>(),
        { key: "surplus", label: "Surplus", format: "currency" },
        { key: "salary_after_arb", label: "After Arb", format: "currency" },
        { key: "surplus_after_arb", label: "Surplus (Post-Arb)", format: "currency" },
      ];

  return <DataTable columns={columns} data={data} highlightRules={ARB_TARGET_RULES} />;
}
