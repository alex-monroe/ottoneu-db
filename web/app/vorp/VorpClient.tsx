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
  Legend,
} from "recharts";
import DataTable, { Column } from "@/components/DataTable";
import { POSITIONS, POSITION_COLORS } from "@/lib/analysis";
import PositionFilter from "@/components/PositionFilter";
import { Position } from "@/lib/types";

interface BarData {
  name: string;
  position: string;
  full_season_vorp: number;   // vs waiver × 17
  vorp_vs_bench: number;      // vs bench × 17
}

interface VorpTableRow {
  name: string;
  position: string;
  nfl_team: string;
  ppg: number;
  total_points: number;
  games_played: number;
  vorp_vs_waiver: number;
  vorp_vs_bench: number;
  full_season_vorp: number;
  price: number;
  team_name: string;
  [key: string]: string | number | null | undefined;
}

const TABLE_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "Team" },
  { key: "ppg", label: "PPG", format: "decimal" },
  { key: "total_points", label: "Points", format: "decimal" },
  { key: "games_played", label: "GP", format: "number" },
  { key: "vorp_vs_waiver", label: "VORP/G (Waiver)", format: "decimal" },
  { key: "vorp_vs_bench", label: "VORP/G (Bench)", format: "decimal" },
  { key: "full_season_vorp", label: "Full VORP", format: "decimal" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "team_name", label: "Owner" },
];

interface Props {
  top15: BarData[];
  tableData: VorpTableRow[];
}

export default function VorpClient({ top15, tableData }: Props) {
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([...POSITIONS]);

  const togglePosition = (pos: Position) => {
    setSelectedPositions((prev) =>
      prev.includes(pos)
        ? prev.filter((p) => p !== pos)
        : [...prev, pos]
    );
  };

  const toggleAll = () => {
    setSelectedPositions(
      selectedPositions.length === POSITIONS.length ? [] : [...POSITIONS]
    );
  };

  const filteredData = tableData.filter((p) =>
    selectedPositions.includes(p.position as Position)
  );

  const sortedData = [...filteredData].sort(
    (a, b) => b.full_season_vorp - a.full_season_vorp
  );

  return (
    <>
      {/* Bar Chart - Top 15 VORP */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
          Top 15 by Full-Season VORP (vs Waiver)
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          Blue = vs Waiver (primary); gray outline = vs Bench (context).
          Gap between bars shows the &ldquo;rostered but replaceable&rdquo; zone.
        </p>
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={top15}
              margin={{ top: 10, right: 30, bottom: 60, left: 20 }}
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
                formatter={(value, name) => [
                  Number(value).toFixed(1),
                  name === "full_season_vorp" ? "vs Waiver" : "vs Bench",
                ]}
              />
              <Legend
                formatter={(value) =>
                  value === "full_season_vorp" ? "vs Waiver" : "vs Bench"
                }
                wrapperStyle={{ color: "#94a3b8", fontSize: 12 }}
              />
              {/* Bench VORP (background, slightly lighter) */}
              <Bar
                dataKey="vorp_vs_bench"
                radius={[3, 3, 0, 0]}
                opacity={0.35}
              >
                {top15.map((entry, i) => (
                  <Cell
                    key={`bench-${i}`}
                    fill={POSITION_COLORS[entry.position] ?? "#6366f1"}
                  />
                ))}
              </Bar>
              {/* Waiver VORP (foreground, full opacity) */}
              <Bar dataKey="full_season_vorp" radius={[4, 4, 0, 0]}>
                {top15.map((entry, i) => (
                  <Cell
                    key={`waiver-${i}`}
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
          <PositionFilter
            positions={POSITIONS}
            selectedPositions={selectedPositions}
            onToggle={togglePosition}
            showAll
            onToggleAll={toggleAll}
          />
        </div>
        <DataTable columns={TABLE_COLUMNS} data={sortedData} />
      </section>
    </>
  );
}
