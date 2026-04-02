"use client";

import DataTable, { Column } from "@/components/DataTable";
import type { TableRow } from "@/lib/types";

interface PlayerAllocation {
  player_name: string;
  owner_team_name: string;
  amount: number;
}

export interface TeamSpendingRow extends TableRow {
  team_name: string;
  total_spent: number;
  players_targeted: number;
  budget_remaining: number;
}

export interface TeamSpendingData {
  row: TeamSpendingRow;
  allocations: PlayerAllocation[];
}

const COLUMNS: Column[] = [
  { key: "team_name", label: "Team" },
  { key: "total_spent", label: "Total Spent", format: "currency" },
  { key: "players_targeted", label: "Players Targeted", format: "number" },
  { key: "budget_remaining", label: "Budget Remaining", format: "currency" },
];

export default function TeamSpendingTable({
  data,
}: {
  data: TeamSpendingData[];
}) {
  const rows = data.map((d) => d.row);
  const allocationsByTeam: Record<string, PlayerAllocation[]> = {};
  for (const d of data) {
    allocationsByTeam[d.row.team_name] = d.allocations;
  }

  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      renderExpandedRow={(row) => {
        const allocations = allocationsByTeam[row.team_name as string] ?? [];
        const sorted = [...allocations].sort((a, b) => b.amount - a.amount);
        return (
          <div className="px-6 py-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              Players Targeted
            </p>
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="text-left py-1 pr-6 text-slate-600 dark:text-slate-400 font-medium">
                    Player
                  </th>
                  <th className="text-left py-1 pr-6 text-slate-600 dark:text-slate-400 font-medium">
                    Owner
                  </th>
                  <th className="text-right py-1 text-slate-600 dark:text-slate-400 font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => (
                  <tr key={`${a.player_name}-${a.owner_team_name}`}>
                    <td className="py-0.5 pr-6 text-slate-700 dark:text-slate-300">
                      {a.player_name}
                    </td>
                    <td className="py-0.5 pr-6 text-slate-500 dark:text-slate-400">
                      {a.owner_team_name}
                    </td>
                    <td className="text-right py-0.5 text-slate-700 dark:text-slate-300">
                      ${a.amount}
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
