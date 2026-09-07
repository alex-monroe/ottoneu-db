"use client";

import DataTable, { Column } from "@/components/DataTable";
import type { TeamSpendingEntry } from "@/lib/arb-progress";

const COLUMNS: Column[] = [
  { key: "team_name", label: "Team" },
  { key: "total_spent", label: "Total Spent", format: "currency" },
  { key: "players_targeted", label: "Players Targeted", format: "number" },
  { key: "budget_remaining", label: "Budget Remaining", format: "currency" },
];

export default function TeamSpendingTable({
  data,
}: {
  data: TeamSpendingEntry[];
}) {
  const rows = data.map((d) => d.row);
  const allocationsByTeam: Record<string, TeamSpendingEntry["allocations"]> = {};
  for (const d of data) {
    allocationsByTeam[d.row.team_name] = d.allocations;
  }

  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      renderExpandedRow={(row) => {
        const allocations = allocationsByTeam[row.team_name as string] ?? [];

        // Group by opponent team, sorted by total allocated desc
        const byOpponent = new Map<string, TeamSpendingEntry["allocations"]>();
        for (const a of allocations) {
          const existing = byOpponent.get(a.owner_team_name) ?? [];
          existing.push(a);
          byOpponent.set(a.owner_team_name, existing);
        }
        const opponents = Array.from(byOpponent.entries())
          .map(([team, allocs]) => ({
            team,
            allocs: allocs.sort((a, b) => b.amount - a.amount),
            total: allocs.reduce((sum, a) => sum + a.amount, 0),
          }))
          .sort((a, b) => b.total - a.total);

        return (
          <div className="px-6 py-3">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="text-left py-1 pr-6 text-ink-muted font-medium">
                    Opponent Team
                  </th>
                  <th className="text-left py-1 pr-6 text-ink-muted font-medium">
                    Player
                  </th>
                  <th className="text-right py-1 text-ink-muted font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {opponents.map((opp) => (
                  <>
                    {opp.allocs.map((a, i) => (
                      <tr key={`${a.owner_team_name}-${a.player_name}`}>
                        {i === 0 ? (
                          <td
                            rowSpan={opp.allocs.length + 1}
                            className="py-0.5 pr-6 text-ink-muted font-medium align-top"
                          >
                            {opp.team}
                          </td>
                        ) : null}
                        <td className="py-0.5 pr-6 text-ink-subtle">
                          {a.player_name}
                        </td>
                        <td className="text-right py-0.5 text-ink-muted">
                          ${a.amount}
                        </td>
                      </tr>
                    ))}
                    <tr
                      key={`${opp.team}-total`}
                      className="border-b border-line"
                    >
                      <td className="py-0.5 pr-6 text-ink-muted font-semibold italic">
                        Subtotal
                      </td>
                      <td className="text-right py-0.5 text-ink-muted font-semibold">
                        ${opp.total}
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    />
  );
}
