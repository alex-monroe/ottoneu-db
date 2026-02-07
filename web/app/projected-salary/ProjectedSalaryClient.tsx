"use client";

import DataTable, { Column } from "@/components/DataTable";

interface PlayerRow {
  name: string;
  position: string;
  nfl_team: string;
  price: number;
  ppg: number;
  total_points: number;
  games_played: number;
  price_per_ppg: number;
  recommendation: string;
}

const COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "nfl_team", label: "Team" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "ppg", label: "PPG", format: "decimal" },
  { key: "total_points", label: "Points", format: "decimal" },
  { key: "games_played", label: "GP", format: "number" },
  { key: "price_per_ppg", label: "$/PPG", format: "decimal" },
  { key: "recommendation", label: "Rec" },
];

const REC_BADGE: Record<string, string> = {
  "Strong Keep":
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Keep: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Borderline:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  "Cut Candidate":
    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function RecommendationBadge({ rec }: { rec: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${REC_BADGE[rec] ?? ""}`}
    >
      {rec}
    </span>
  );
}

interface Props {
  positionGroups: { pos: string; players: PlayerRow[] }[];
  recColors: Record<string, string>;
}

export default function ProjectedSalaryClient({ positionGroups }: Props) {
  // Custom columns that render recommendation as a badge
  const columnsWithBadge: Column[] = COLUMNS.map((col) =>
    col.key === "recommendation" ? { ...col, label: "Recommendation" } : col
  );

  return (
    <div className="space-y-8">
      {positionGroups.map(({ pos, players }) => (
        <section key={pos}>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            {pos}
          </h2>
          <DataTable
            columns={columnsWithBadge}
            data={players.map((p) => ({
              ...p,
              recommendation: p.recommendation,
              _rec_raw: p.recommendation,
            }))}
            highlightRow={(row) => {
              const rec = row._rec_raw as string;
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
          Each player&apos;s $/PPG is compared to the league-wide
          median at their position. Strong Keep ≤60%, Keep 60-90%, Borderline
          90-110%, Cut Candidate &gt;110%.
        </p>
      </div>
    </div>
  );
}
