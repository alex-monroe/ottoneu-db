"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WormPoint } from "@/lib/score-worm";

/**
 * The score worm: both sides' running totals, snapshot by snapshot — cricket's
 * worm chart for a fantasy week. Everything is computed on the server
 * (lib/score-worm.ts); this component only draws it.
 *
 * Series colors are the `--worm-left` / `--worm-right` tokens in globals.css,
 * deliberately not positive/negative: neither team is the "good" one.
 */

interface Side {
  name: string;
  /** Total at the latest snapshot. */
  score: number;
}

const COLORS = { left: "var(--worm-left)", right: "var(--worm-right)" } as const;

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-0.5 w-4 shrink-0 rounded" style={{ background: color }} />;
}

function WormTooltip({
  active,
  payload,
  left,
  right,
}: {
  active?: boolean;
  payload?: Array<{ payload: WormPoint }>;
  left: string;
  right: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const leader = p.margin > 0 ? left : right;
  return (
    <div className="rounded border border-line bg-raised p-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{p.label}</p>
      <p className="flex items-center gap-2 tabular-nums text-ink-muted">
        <Swatch color={COLORS.left} />
        <span className="max-w-[10rem] truncate">{left}</span>
        <span className="ml-auto font-semibold text-ink">{p.left.toFixed(2)}</span>
      </p>
      <p className="flex items-center gap-2 tabular-nums text-ink-muted">
        <Swatch color={COLORS.right} />
        <span className="max-w-[10rem] truncate">{right}</span>
        <span className="ml-auto font-semibold text-ink">{p.right.toFixed(2)}</span>
      </p>
      <p className="mt-1 text-ink-subtle">
        {Math.abs(p.margin) < 0.005
          ? "Level"
          : `${leader} by ${Math.abs(p.margin).toFixed(2)}`}
      </p>
    </div>
  );
}

export default function ScoreWorm({
  points,
  ticks,
  left,
  right,
  summary,
}: {
  points: WormPoint[];
  /** Index + label of the first snapshot of each day. */
  ticks: { index: number; label: string }[];
  left: Side;
  right: Side;
  /** One line under the chart — lead changes, biggest leads. */
  summary: string;
}) {
  const data = points.map((p, i) => ({ ...p, i }));
  const tickLabel = new Map(ticks.map((t) => [t.index, t.label]));

  return (
    <figure className="rounded-lg border border-line bg-raised p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
          The worm
        </span>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          {([["left", left], ["right", right]] as const).map(([key, side]) => (
            <span key={key} className="flex items-center gap-1.5">
              <Swatch color={COLORS[key]} />
              <span className="max-w-[12rem] truncate">{side.name}</span>
              <span className="tabular-nums font-semibold text-ink">{side.score.toFixed(2)}</span>
            </span>
          ))}
        </span>
      </figcaption>

      <div className="h-56 w-full sm:h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="i"
              type="number"
              domain={[0, Math.max(1, data.length - 1)]}
              ticks={ticks.map((t) => t.index)}
              tickFormatter={(i: number) => tickLabel.get(i) ?? ""}
              tick={{ fontSize: 11, fill: "var(--ink-subtle)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--line-strong)" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--ink-subtle)" }}
              tickLine={false}
              axisLine={false}
              width={40}
              allowDecimals={false}
            />
            <Tooltip
              content={<WormTooltip left={left.name} right={right.name} />}
              cursor={{ stroke: "var(--line-strong)" }}
            />
            {(["left", "right"] as const).map((key) => (
              <Line
                key={key}
                dataKey={key}
                type="linear"
                stroke={COLORS[key]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--raised)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-ink-subtle">{summary}</p>

      {/* The chart is aria-hidden; this is its text equivalent. */}
      <table className="sr-only">
        <caption>Running score by snapshot</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">{left.name}</th>
            <th scope="col">{right.name}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{p.label}</td>
              <td>{p.left.toFixed(2)}</td>
              <td>{p.right.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
