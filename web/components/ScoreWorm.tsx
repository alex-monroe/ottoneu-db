"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MinutesPoint, WormPoint, WormReading } from "@/lib/score-worm";

/**
 * The score worm: both sides' running totals, play by play (scrape by scrape
 * until a week is rebuilt) — cricket's worm chart for a fantasy week. A rebuilt
 * point's tooltip also says who scored. A rebuilt worm can switch its x-axis
 * from the clock to **minutes played** — each team's score against the share
 * of its own lineup's game minutes played. Everything is computed on the
 * server (lib/score-worm.ts); this component only draws it.
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

type View = "clock" | "minutes";

const VIEWS: { key: View; label: string }[] = [
  { key: "clock", label: "Clock" },
  { key: "minutes", label: "Minutes played" },
];

const PCT_TICKS = [0, 25, 50, 75, 100];

const AXIS_TICK = { fontSize: 11, fill: "var(--ink-subtle)" };

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
  payload?: Array<{ payload: WormReading }>;
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
      {p.note && <p className="mt-1 max-w-[16rem] text-ink-muted">{p.note}</p>}
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
  minutes,
}: {
  points: WormPoint[];
  /** Index + label of the first snapshot of each day. */
  ticks: { index: number; label: string }[];
  left: Side;
  right: Side;
  /** One line under the chart — lead changes, biggest leads. */
  summary: string;
  /** The minutes-played view; null hides the toggle (live scrapes have no game clock). */
  minutes: { points: MinutesPoint[]; summary: string } | null;
}) {
  const [view, setView] = useState<View>("clock");
  const byMinutes = view === "minutes" && minutes !== null;
  const clockData = points.map((p, i) => ({ ...p, i }));
  const tickLabel = new Map(ticks.map((t) => [t.index, t.label]));
  const shown: WormReading[] = byMinutes ? minutes.points : points;

  return (
    <figure className="rounded-lg border border-line bg-raised p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
            The worm
          </span>
          {minutes && (
            <span
              className="flex overflow-hidden rounded-md border border-line text-xs font-medium"
              role="group"
              aria-label="Worm x-axis"
            >
              {VIEWS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  aria-pressed={view === key}
                  className={`whitespace-nowrap px-2.5 py-1 transition-colors ${
                    view === key ? "bg-blue-600 text-white" : "bg-raised text-ink-muted hover:bg-sunken"
                  }`}
                >
                  {label}
                </button>
              ))}
            </span>
          )}
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
          <LineChart
            data={byMinutes ? minutes.points : clockData}
            margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
          >
            <CartesianGrid vertical={false} stroke="var(--line)" />
            {byMinutes ? (
              <XAxis
                dataKey="pct"
                type="number"
                domain={[0, 100]}
                ticks={PCT_TICKS}
                tickFormatter={(pct: number) => `${pct}%`}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: "var(--line-strong)" }}
              />
            ) : (
              <XAxis
                dataKey="i"
                type="number"
                domain={[0, Math.max(1, clockData.length - 1)]}
                ticks={ticks.map((t) => t.index)}
                tickFormatter={(i: number) => tickLabel.get(i) ?? ""}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: "var(--line-strong)" }}
              />
            )}
            <YAxis
              tick={AXIS_TICK}
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
                // Minutes-played points are where either side moved; a score
                // holds until its own next step, so draw steps, not slopes.
                type={byMinutes ? "stepAfter" : "linear"}
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

      <p className="mt-2 text-xs text-ink-subtle">{byMinutes ? minutes.summary : summary}</p>

      {/* The chart is aria-hidden; this is its text equivalent. */}
      <table className="sr-only">
        <caption>{byMinutes ? "Running score by share of lineup minutes played" : "Running score by snapshot"}</caption>
        <thead>
          <tr>
            <th scope="col">{byMinutes ? "Lineup minutes played" : "Time"}</th>
            <th scope="col">{left.name}</th>
            <th scope="col">{right.name}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p, i) => (
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
