"use client";

import DataTable, { Column } from "@/components/DataTable";

interface PlayerRow {
  name: string;
  position: string;
  nfl_team: string;
  price: number;
  dollar_value: number;
  surplus: number;
  ppg: number;
  total_points: number;
  games_played: number;
  recommendation: string;
}

const COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "nfl_team", label: "Team" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "surplus", label: "Surplus", format: "currency" },
  { key: "ppg", label: "PPG", format: "decimal" },
  { key: "total_points", label: "Points", format: "decimal" },
  { key: "games_played", label: "GP", format: "number" },
  { key: "recommendation", label: "Recommendation" },
];

interface Props {
  positionGroups: { pos: string; players: PlayerRow[] }[];
}

export default function ProjectedSalaryClient({ positionGroups }: Props) {
  return (
    <div className="space-y-8">
      {positionGroups.map(({ pos, players }) => (
        <section key={pos}>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            {pos}
          </h2>
          <DataTable
            columns={COLUMNS}
            data={players}
            highlightRow={(row) => {
              const rec = row.recommendation as string;
              if (rec === "Cut Candidate")
                return "bg-red-50 dark:bg-red-950/30 border-t border-slate-100 dark:border-slate-800";
              if (rec === "Strong Keep")
                return "bg-green-50 dark:bg-green-950/30 border-t border-slate-100 dark:border-slate-800";
              return undefined;
            }}
          />
        </section>
      ))}

      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400">
        <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
          How recommendations work
        </p>
        <p>
          Based on surplus value (dollar value from VORP minus salary).
          Strong Keep: surplus &ge; $10. Keep: surplus &ge; $0. Borderline:
          surplus &ge; -$5. Cut Candidate: surplus &lt; -$5.
        </p>
      </div>
    </div>
  );
}
