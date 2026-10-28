"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MinutesPoint, WormPoint, WormReading } from "@/lib/score-worm";
import { coneFrom, finalRanges, hasCone, type Band } from "@/lib/worm-cone";

/**
 * The score worm: both sides' running totals, play by play (scrape by scrape
 * until a week is rebuilt) — cricket's worm chart for a fantasy week. A rebuilt
 * point's tooltip also says who scored. A rebuilt worm can switch its x-axis
 * from the clock to **minutes played** — each team's score against the share
 * of its own lineup's game minutes played — or its y-axis to the left team's
 * **win probability**. On a rebuilt worm's clock view, hovering a moment
 * shades each team's 80% "hurricane" cone from there to the end of the week
 * (lib/worm-cone.ts, computed here per hover). Everything else is computed on
 * the server (lib/score-worm.ts); this component only draws it.
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

type View = "clock" | "minutes" | "win";

const VIEWS: { key: View; label: string }[] = [
  { key: "clock", label: "Clock" },
  { key: "minutes", label: "Minutes played" },
  { key: "win", label: "Win %" },
];

const PCT_TICKS = [0, 25, 50, 75, 100];

const AXIS_TICK = { fontSize: 11, fill: "var(--ink-subtle)" };

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-0.5 w-4 shrink-0 rounded" style={{ background: color }} />;
}

const fmtBand = ([low, high]: Band) => `${low.toFixed(0)}–${high.toFixed(0)}`;

function WormTooltip({
  active,
  payload,
  left,
  right,
  ranges,
}: {
  active?: boolean;
  payload?: Array<{ payload: WormReading }>;
  left: string;
  right: string;
  /** Each side's 80% final-score range from the hovered moment, when the cone is on. */
  ranges?: { left: Band; right: Band } | null;
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
      {ranges && (
        <div className="mt-1 border-t border-line pt-1 text-ink-subtle">
          <p>Likely finals from here (80%)</p>
          {([[left, ranges.left, "left"], [right, ranges.right, "right"]] as const).map(([name, range, key]) => (
            <p key={key} className="flex items-center gap-2 tabular-nums">
              <Swatch color={COLORS[key]} />
              <span className="max-w-[10rem] truncate">{name}</span>
              <span className="ml-auto text-ink-muted">{fmtBand(range)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function WinTooltip({
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
  if (p.winPct == null) return null;
  return (
    <div className="rounded border border-line bg-raised p-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{p.label}</p>
      {([[left, p.winPct, "left"], [right, 100 - p.winPct, "right"]] as const).map(([name, pct, key]) => (
        <p key={key} className="flex items-center gap-2 tabular-nums text-ink-muted">
          <Swatch color={COLORS[key]} />
          <span className="max-w-[10rem] truncate">{name}</span>
          <span className="ml-auto font-semibold text-ink">{pct < 1 && pct > 0 ? "<1" : Math.round(pct)}%</span>
        </p>
      ))}
      {p.note && <p className="mt-1 max-w-[16rem] text-ink-muted">{p.note}</p>}
      <p className="mt-1 tabular-nums text-ink-subtle">
        Score {p.left.toFixed(2)}–{p.right.toFixed(2)}
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
  win,
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
  /** The win-probability view (drawn from `points`); null hides it. */
  win: { summary: string } | null;
}) {
  const [view, setView] = useState<View>("clock");
  const [hover, setHover] = useState<number | null>(null);
  const byMinutes = view === "minutes" && minutes !== null;
  const byWin = view === "win" && win !== null;
  const coneOn = view === "clock" && hasCone(points);
  // Fix the y-axis to the widest any cone gets, so it never rescales mid-hover.
  const yTop = useMemo(() => {
    if (!hasCone(points)) return null;
    let top = 0;
    points.forEach((p, i) => {
      const r = finalRanges(points, i);
      top = Math.max(top, p.left, p.right, r?.left[1] ?? 0, r?.right[1] ?? 0);
    });
    return Math.ceil(top / 10) * 10;
  }, [points]);
  const cone = coneOn && hover !== null ? coneFrom(points, hover) : [];
  const ranges = coneOn && hover !== null ? finalRanges(points, hover) : null;
  const available = VIEWS.filter(
    ({ key }) => key === "clock" || (key === "minutes" && minutes) || (key === "win" && win),
  );
  const clockData = points.map((p, i) => ({
    ...p,
    i,
    leftBand: cone[i]?.leftBand ?? null,
    rightBand: cone[i]?.rightBand ?? null,
  }));
  const tickLabel = new Map(ticks.map((t) => [t.index, t.label]));
  const shown: WormReading[] = byMinutes ? minutes.points : points;

  return (
    <figure className="rounded-lg border border-line bg-raised p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
            The worm
          </span>
          {available.length > 1 && (
            <span
              className="flex overflow-hidden rounded-md border border-line text-xs font-medium"
              role="group"
              aria-label="Worm x-axis"
            >
              {available.map(({ key, label }) => (
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
          <ComposedChart
            data={byMinutes ? minutes.points : clockData}
            margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
            onMouseMove={(state) => {
              if (!coneOn) return;
              const index = state?.activeTooltipIndex;
              setHover(index == null ? null : Number(index));
            }}
            onMouseLeave={() => setHover(null)}
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
            {byWin ? (
              <YAxis
                domain={[0, 100]}
                ticks={PCT_TICKS}
                tickFormatter={(pct: number) => `${pct}%`}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={40}
              />
            ) : (
              <YAxis
                domain={coneOn && yTop !== null ? [0, yTop] : undefined}
                allowDataOverflow={coneOn && yTop !== null}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={40}
                allowDecimals={false}
              />
            )}
            <Tooltip
              content={
                byWin ? (
                  <WinTooltip left={left.name} right={right.name} />
                ) : (
                  <WormTooltip left={left.name} right={right.name} ranges={ranges} />
                )
              }
              cursor={{ stroke: "var(--line-strong)" }}
            />
            {byWin && <ReferenceLine y={50} stroke="var(--line-strong)" strokeDasharray="4 4" />}
            {coneOn &&
              (["left", "right"] as const).map((key) => (
                // The hurricane cone: [low, high] per point from the hovered one on.
                <Area
                  key={`${key}Band`}
                  dataKey={`${key}Band`}
                  type="linear"
                  stroke="none"
                  fill={COLORS[key]}
                  fillOpacity={0.15}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))}
            {byWin && (
              // One line: the left team's chance. The right team's is its mirror.
              <Line
                dataKey="winPct"
                type="linear"
                stroke={COLORS.left}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--raised)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            )}
            {!byWin && (["left", "right"] as const).map((key) => (
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
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-ink-subtle">
        {byWin ? win.summary : byMinutes ? minutes.summary : summary}
        {coneOn && " Hover to see where each team was headed from that moment: the shading is its 80% range."}
      </p>

      {/* The chart is aria-hidden; this is its text equivalent. */}
      <table className="sr-only">
        <caption>
          {byWin
            ? "Win probability by play"
            : byMinutes
              ? "Running score by share of lineup minutes played"
              : "Running score by snapshot"}
        </caption>
        <thead>
          <tr>
            <th scope="col">{byMinutes ? "Lineup minutes played" : "Time"}</th>
            <th scope="col">{left.name}{byWin ? " win %" : ""}</th>
            <th scope="col">{right.name}{byWin ? " win %" : ""}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p, i) => (
            <tr key={i}>
              <td>{p.label}</td>
              <td>{byWin && p.winPct != null ? `${Math.round(p.winPct)}%` : p.left.toFixed(2)}</td>
              <td>{byWin && p.winPct != null ? `${Math.round(100 - p.winPct)}%` : p.right.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
