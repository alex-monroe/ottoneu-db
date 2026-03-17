"use client";

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { BacktestPlayer, Position, POSITION_COLORS } from "@/lib/types";

// Muted secondary palette for compare model (lighter variants)
const COMPARE_POSITION_COLORS: Record<Position, string> = {
  QB: "#FCA5A5",
  RB: "#93C5FD",
  WR: "#6EE7B7",
  TE: "#FCD34D",
  K: "#C4B5FD",
};

interface TooltipPayload {
  active?: boolean;
  payload?: Array<{ payload: BacktestPlayer & { _model?: string } }>;
}

function CustomTooltip({ active, payload }: TooltipPayload) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const signed = d.error >= 0 ? `+${d.error.toFixed(2)}` : d.error.toFixed(2);
  return (
    <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 p-3 rounded shadow-lg text-sm">
      <p className="font-bold text-slate-900 dark:text-slate-100">{d.name}</p>
      <p className="text-slate-500 dark:text-slate-400">
        {d.position} · {d.nfl_team}
        {d._model && (
          <span className="ml-2 text-xs text-purple-500">({d._model})</span>
        )}
      </p>
      <div className="mt-2 space-y-1">
        <p>
          Proj PPG:{" "}
          <span className="font-mono font-medium">
            {d.projected_ppg.toFixed(2)}
          </span>
        </p>
        <p>
          Actual PPG:{" "}
          <span className="font-mono font-medium">
            {d.actual_ppg.toFixed(2)}
          </span>
        </p>
        <p>
          Error:{" "}
          <span
            className={`font-mono font-medium ${
              d.error >= 0
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {signed}
          </span>
        </p>
      </div>
    </div>
  );
}

interface Props {
  players: BacktestPlayer[];
  selectedPositions: Position[];
  comparePlayers?: BacktestPlayer[];
  compareModelName?: string;
  primaryModelName?: string;
}

export default function AccuracyScatterChart({
  players,
  selectedPositions,
  comparePlayers,
  compareModelName,
  primaryModelName,
}: Props) {
  const filtered = players.filter((p) =>
    selectedPositions.includes(p.position as Position)
  );

  const filteredCompare = comparePlayers
    ? comparePlayers.filter((p) => selectedPositions.includes(p.position as Position))
    : [];

  const allFiltered = [...filtered, ...filteredCompare];
  const allPpg = allFiltered.flatMap((p) => [p.projected_ppg, p.actual_ppg]);
  const rawMin = allPpg.length > 0 ? Math.min(...allPpg) : 0;
  const rawMax = allPpg.length > 0 ? Math.max(...allPpg) : 20;
  const padding = (rawMax - rawMin) * 0.05;
  const minVal = Math.max(0, rawMin - padding);
  const maxVal = rawMax + padding;

  const hasCompare = filteredCompare.length > 0;
  const positions = (["QB", "RB", "WR", "TE", "K"] as Position[]).filter((pos) =>
    selectedPositions.includes(pos)
  );

  // Tag compare players with model name for tooltip
  const taggedCompare = filteredCompare.map((p) => ({
    ...p,
    _model: compareModelName ?? "Compare",
  }));

  return (
    <div className="w-full h-[500px] bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
          <XAxis
            type="number"
            dataKey="projected_ppg"
            name="Projected PPG"
            domain={[minVal, maxVal]}
            label={{
              value: "Projected PPG",
              position: "bottom",
              offset: 10,
              fill: "#94a3b8",
              fontSize: 12,
            }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="actual_ppg"
            name="Actual PPG"
            domain={[minVal, maxVal]}
            label={{
              value: "Actual PPG",
              angle: -90,
              position: "insideLeft",
              offset: -10,
              fill: "#94a3b8",
              fontSize: 12,
            }}
            tick={{ fontSize: 11 }}
          />
          <ReferenceLine
            segment={[
              { x: minVal, y: minVal },
              { x: maxVal, y: maxVal },
            ]}
            stroke="#94a3b8"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          <Legend verticalAlign="top" />

          {/* Primary model scatter series */}
          {positions.map((pos) => (
            <Scatter
              key={pos}
              name={hasCompare ? `${pos} (${primaryModelName ?? "Model A"})` : pos}
              data={filtered.filter((p) => p.position === pos)}
              fill={POSITION_COLORS[pos]}
              opacity={0.8}
            />
          ))}

          {/* Compare model scatter series — muted palette */}
          {hasCompare &&
            positions.map((pos) => (
              <Scatter
                key={`compare-${pos}`}
                name={`${pos} (${compareModelName ?? "Model B"})`}
                data={taggedCompare.filter((p) => p.position === pos)}
                fill={COMPARE_POSITION_COLORS[pos]}
                opacity={0.7}
                shape="diamond"
              />
            ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
