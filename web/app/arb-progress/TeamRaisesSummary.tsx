import DataTable from "@/components/DataTable";
import type { Allocation } from "@/lib/arb-progress";

interface TeamRaisesSummaryProps {
  teamRaiseTotals: Map<string, number>;
  allocations: Allocation[];
}

export default function TeamRaisesSummary({
  teamRaiseTotals,
  allocations,
}: TeamRaisesSummaryProps) {
  if (teamRaiseTotals.size === 0) return null;

  const rows = Array.from(teamRaiseTotals.entries())
    .map(([team, total]) => ({
      team_name: team,
      total_raise: total,
      player_count: allocations.filter((a) => a.team_name === team).length,
    }))
    .sort((a, b) => b.total_raise - a.total_raise);

  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
        Raises by Team
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        Total salary increases received per team from arbitration.
      </p>
      <DataTable
        columns={[
          { key: "team_name", label: "Team" },
          { key: "total_raise", label: "Total Raise", format: "currency" },
          { key: "player_count", label: "Players Affected", format: "number" },
        ]}
        data={rows}
      />
    </section>
  );
}
