"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import DataTable, { Column } from "@/components/DataTable";
import { POSITIONS, POSITION_COLORS } from "@/lib/analysis";

interface BarData {
  name: string;
  position: string;
  full_season_vorp: number;
}

interface TableRow {
  name: string;
  position: string;
  nfl_team: string;
  ppg: number;
  total_points: number;
  games_played: number;
  vorp_per_game: number;
  full_season_vorp: number;
  price: number;
  team_name: string;
}

const TABLE_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "Team" },
  { key: "ppg", label: "PPG", format: "decimal" },
  { key: "total_points", label: "Points", format: "decimal" },
  { key: "games_played", label: "GP", format: "number" },
  { key: "vorp_per_game", label: "VORP/G", format: "decimal" },
  { key: "full_season_vorp", label: "Full VORP", format: "decimal" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "team_name", label: "Owner" },
];

interface Props {
  top15: BarData[];
  tableData: TableRow[];
}

export default function VorpClient({ top15, tableData }: Props) {
  const [selectedPos, setSelectedPos] = useState<string | null>(null);

  const filteredData = selectedPos
    ? tableData.filter((p) => p.position === selectedPos)
    : tableData;

  const sortedData = [...filteredData].sort(
    (a, b) => b.full_season_vorp - a.full_season_vorp
  );

  return (
    <>
      {/* Bar Chart - Top 15 VORP */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
          Top 15 by Full-Season VORP
        </h2>
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={top15}
              margin={{ top: 10, right: 20, bottom: 60, left: 20 }}
            >
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                interval={0}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                height={80}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                label={{
                  value: "Full-Season VORP",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "#94a3b8" },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#e2e8f0",
                }}
                formatter={(value) => [Number(value).toFixed(1), "VORP"]}
              />
              <Bar dataKey="full_season_vorp" radius={[4, 4, 0, 0]}>
                {top15.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={POSITION_COLORS[entry.position] ?? "#6366f1"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Position Filter + Table */}
      <section>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            All Players
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedPos(null)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
                selectedPos === null
                  ? "bg-slate-700 text-white border-transparent"
                  : "bg-transparent text-slate-500 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              All
            </button>
            {POSITIONS.map((pos) => (
              <button
                key={pos}
                onClick={() =>
                  setSelectedPos(selectedPos === pos ? null : pos)
                }
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
                  selectedPos === pos
                    ? "text-white border-transparent"
                    : "bg-transparent text-slate-500 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
                style={{
                  backgroundColor:
                    selectedPos === pos
                      ? POSITION_COLORS[pos]
                      : undefined,
                }}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>
        <DataTable columns={TABLE_COLUMNS} data={sortedData} />
      </section>
    </>
  );
}
