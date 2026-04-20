"use client";

import DataTable, { Column, HighlightRule } from "@/components/DataTable";
import type { PlayerHoverData } from "@/lib/types";
import type { Allocation, PlayerAllocationDetail } from "@/lib/arb-progress";

const COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "team_name", label: "Owner" },
  { key: "current_salary", label: "Salary", format: "currency" },
  { key: "raise_amount", label: "Raise", format: "currency" },
  { key: "new_salary", label: "New Salary", format: "currency" },
  { key: "projected_raise", label: "Proj. Raise", format: "currency" },
  { key: "projected_salary", label: "Proj. Salary", format: "currency" },
];

const HIGHLIGHT_RULES: HighlightRule[] = [
  {
    key: "raise_amount",
    op: "gte",
    value: 10,
    className: "bg-red-50 dark:bg-red-950/30",
  },
];

interface AllocationDetailsTableProps {
  data: Allocation[];
  hoverDataMap: Record<string, PlayerHoverData> | null;
  detailsByPlayer: Record<number, PlayerAllocationDetail[]>;
}

export default function AllocationDetailsTable({
  data,
  hoverDataMap,
  detailsByPlayer,
}: AllocationDetailsTableProps) {
  const hasDetails = Object.keys(detailsByPlayer).length > 0;

  if (!hasDetails) {
    return (
      <DataTable
        columns={COLUMNS}
        data={data}
        highlightRules={HIGHLIGHT_RULES}
        hoverDataMap={hoverDataMap}
      />
    );
  }

  return (
    <DataTable
      columns={COLUMNS}
      data={data}
      highlightRules={HIGHLIGHT_RULES}
      hoverDataMap={hoverDataMap}
      renderExpandedRow={(row) => {
        const details = detailsByPlayer[row.ottoneu_id as number] ?? [];
        if (details.length === 0) {
          return (
            <div className="px-6 py-3 text-sm text-slate-500 dark:text-slate-400">
              No individual allocation data available
            </div>
          );
        }
        const sorted = [...details].sort((a, b) => b.amount - a.amount);
        return (
          <div className="px-6 py-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              Individual Allocations
            </p>
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="text-left py-1 pr-8 text-slate-600 dark:text-slate-400 font-medium">
                    Team
                  </th>
                  <th className="text-right py-1 text-slate-600 dark:text-slate-400 font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((d) => (
                  <tr key={d.allocating_team_name}>
                    <td className="py-0.5 pr-8 text-slate-700 dark:text-slate-300">
                      {d.allocating_team_name}
                    </td>
                    <td className="text-right py-0.5 text-slate-700 dark:text-slate-300">
                      ${d.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    />
  );
}
