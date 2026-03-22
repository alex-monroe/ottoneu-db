"use client";

import { useMemo } from "react";
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
  // ⚡ Bolt: Use useMemo and a single pass to group players by position to prevent O(P * N) operations
  // multiplying per render in ScatterChart components
  const { filtered, filteredByPos } = useMemo(() => {
    const validPositions = new Set(selectedPositions);
    const filtered: BacktestPlayer[] = [];
    const grouped = new Map<Position, BacktestPlayer[]>();

    for (const pos of selectedPositions) {
      grouped.set(pos, []);
    }

    for (const p of players) {
      const pos = p.position as Position;
      if (validPositions.has(pos)) {
        filtered.push(p);
        grouped.get(pos)?.push(p);
      }
    }

    return { filtered, filteredByPos: grouped };
  }, [players, selectedPositions]);

  const { filteredCompare, compareByPos } = useMemo(() => {
    const validPositions = new Set(selectedPositions);
    const filteredCompare: (BacktestPlayer & { _model?: string })[] = [];
    const grouped = new Map<Position, (BacktestPlayer & { _model?: string })[]>();

    for (const pos of selectedPositions) {
      grouped.set(pos, []);
    }

    if (comparePlayers) {
      for (const p of comparePlayers) {
        const pos = p.position as Position;
        if (validPositions.has(pos)) {
          const tagged = { ...p, _model: compareModelName ?? "Compare" };
          filteredCompare.push(tagged);
          grouped.get(pos)?.push(tagged);
        }
      }
    }

    return { filteredCompare, compareByPos: grouped };
  }, [comparePlayers, selectedPositions, compareModelName]);

  const { minVal, maxVal } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;

    const updateMinMax = (val: number) => {
      if (val < min) min = val;
      if (val > max) max = val;
    };

    for (const p of filtered) {
      updateMinMax(p.projected_ppg);
      updateMinMax(p.actual_ppg);
    }
    for (const p of filteredCompare) {
      updateMinMax(p.projected_ppg);
      updateMinMax(p.actual_ppg);
    }

    if (min === Infinity) {
      min = 0;
      max = 20;
    }

    const padding = (max - min) * 0.05;
    return {
      minVal: Math.max(0, min - padding),
      maxVal: max + padding
    };
  }, [filtered, filteredCompare]);

  const hasCompare = filteredCompare.length > 0;
  const positions = (["QB", "RB", "WR", "TE", "K"] as Position[]).filter((pos) =>
    selectedPositions.includes(pos)
  );

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
              data={filteredByPos.get(pos) || []}
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
                data={compareByPos.get(pos) || []}
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
