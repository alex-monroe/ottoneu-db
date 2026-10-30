/**
 * The worm — both sides' running totals across a scoring period, named for
 * cricket's worm chart. Frames in, chart series out.
 *
 * The x-axis is the frame sequence, not wall-clock time: a fantasy week has
 * long empty stretches that would squash the decisive hours on a time axis.
 * Repeated identical totals are dropped for the same reason.
 */

import type { MinutesPoint, ScoreFrame, WormPoint, WormReading } from "./types";

export interface LabelOptions {
  /** IANA time zone for clock labels and day ticks. Default "UTC". */
  timeZone?: string;
  /** BCP 47 locale for clock labels and day ticks. Default "en-US". */
  locale?: string;
  /** The origin's label. Default "Start". */
  originLabel?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const toPct = (p: number | null | undefined) => (p == null ? null : Math.round(p * 1000) / 10);

/** Swap the sides, e.g. so the viewer's team is drawn first. */
export function flipFrames(frames: ScoreFrame[]): ScoreFrame[] {
  return frames.map((f) => ({
    at: f.at,
    left: f.right,
    right: f.left,
    note: f.note,
    leftProgress: f.rightProgress,
    rightProgress: f.leftProgress,
    leftWinProb: f.leftWinProb == null ? f.leftWinProb : round4(1 - f.leftWinProb),
    leftRemaining: f.rightRemaining,
    rightRemaining: f.leftRemaining,
  }));
}

/** "Sun 2:30 PM" in `timeZone`; the origin label for null. */
export function timeLabel(at: string | null, options: LabelOptions = {}): string {
  if (!at) return options.originLabel ?? "Start";
  return new Date(at).toLocaleString(options.locale ?? "en-US", {
    timeZone: options.timeZone ?? "UTC",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Frames → worm points: in time order, consecutive repeats dropped, behind a
 * 0–0 origin that takes the kickoff frame's win probability and projections.
 * A last frame with both sides' progress at 1 is kept even if its score
 * repeats, so a closing "Final" frame settles the win line.
 *
 * Returns [] when there are fewer than two distinct scores — one line from 0–0
 * to the current score says nothing about how the game got there.
 */
export function buildWorm(frames: ScoreFrame[], options: LabelOptions = {}): WormPoint[] {
  const sorted = [...frames].sort((a, b) => a.at.localeCompare(b.at));
  const kickoff = sorted.find((f) => f.left === 0 && f.right === 0);
  const points: WormPoint[] = [
    {
      at: null,
      left: 0,
      right: 0,
      margin: 0,
      label: timeLabel(null, options),
      note: null,
      winPct: toPct(kickoff?.leftWinProb),
      leftRemaining: kickoff?.leftRemaining ?? null,
      rightRemaining: kickoff?.rightRemaining ?? null,
      leftProgress: kickoff ? (kickoff.leftProgress ?? null) : null,
      rightProgress: kickoff ? (kickoff.rightProgress ?? null) : null,
    },
  ];
  sorted.forEach((f, i) => {
    const left = round2(f.left);
    const right = round2(f.right);
    const last = points[points.length - 1];
    // A repeated score is dropped — unless it is the closing, settled frame
    // (every lineup fully played), which pins the win line to 0 or 100.
    const settles = i === sorted.length - 1 && f.leftProgress === 1 && f.rightProgress === 1;
    if (left === last.left && right === last.right && !settles) return;
    points.push({
      at: f.at,
      left,
      right,
      margin: round2(left - right),
      label: timeLabel(f.at, options),
      note: f.note ?? null,
      winPct: toPct(f.leftWinProb),
      leftRemaining: f.leftRemaining ?? null,
      rightRemaining: f.rightRemaining ?? null,
      leftProgress: f.leftProgress ?? null,
      rightProgress: f.rightProgress ?? null,
    });
  });
  return points.length >= 3 ? points : [];
}

/** How many times the lead changed hands. A tie is not a lead. */
export function leadChanges(points: Pick<WormReading, "margin">[]): number {
  let changes = 0;
  let leader = 0;
  for (const p of points) {
    const sign = Math.sign(p.margin);
    if (sign === 0) continue;
    if (leader !== 0 && sign !== leader) changes += 1;
    leader = sign;
  }
  return changes;
}

/** The largest lead each side held at any point (0 if it never led). */
export function biggestLeads(points: Pick<WormReading, "margin">[]): { left: number; right: number } {
  let left = 0;
  let right = 0;
  for (const p of points) {
    if (p.margin > left) left = p.margin;
    if (-p.margin > right) right = -p.margin;
  }
  return { left: round2(left), right: round2(right) };
}

/** Axis ticks: the index of the first point of each day in `timeZone`, labelled "Thu", "Sun"… */
export function dayTicks(points: WormPoint[], options: LabelOptions = {}): { index: number; label: string }[] {
  const ticks: { index: number; label: string }[] = [];
  let previous: string | null = null;
  points.forEach((p, index) => {
    if (!p.at) return;
    const day = new Date(p.at).toLocaleString(options.locale ?? "en-US", {
      timeZone: options.timeZone ?? "UTC",
      weekday: "short",
    });
    if (day !== previous) ticks.push({ index, label: day });
    previous = day;
  });
  return ticks;
}

/** "Lead changed hands 3 times · biggest leads: Alpha 21.40, Beta 8.10." */
export function leadSummary(points: Pick<WormReading, "margin">[], leftName: string, rightName: string): string {
  const changes = leadChanges(points);
  const leads = biggestLeads(points);
  const changed =
    changes === 0 ? "The lead never changed hands" : `Lead changed hands ${changes} time${changes === 1 ? "" : "s"}`;
  const parts = [
    leads.left > 0 ? `${leftName} ${leads.left.toFixed(2)}` : null,
    leads.right > 0 ? `${rightName} ${leads.right.toFixed(2)}` : null,
  ].filter(Boolean);
  const biggest = parts.length ? ` · biggest lead${parts.length > 1 ? "s" : ""}: ${parts.join(", ")}` : "";
  return `${changed}${biggest}.`;
}

/** "48% played" — a sliver shows as "<1%". */
export function progressLabel(pct: number, suffix = "played"): string {
  const shown = pct > 0 && pct < 1 ? "<1" : String(Math.round(pct));
  return `${shown}% ${suffix}`;
}

/**
 * Frames → the progress view: each side's score as a step function of its own
 * share of lineup played, read off at every share where either side moved, so
 * both values at a point belong to the same share. Starts at 0–0 and ends at
 * 100% with the final score.
 *
 * Returns [] unless every frame carries both sides' progress and the game has
 * at least two distinct scores.
 */
export function buildMinutesWorm(
  frames: ScoreFrame[],
  label: (pct: number) => string = (pct) => progressLabel(pct),
): MinutesPoint[] {
  if (frames.length === 0 || frames.some((f) => f.leftProgress == null || f.rightProgress == null)) {
    return [];
  }
  const last = frames[frames.length - 1];
  // [share played, score, projected points still to come] per side. The
  // kickoff frame (0%) supplies the pre-game projection; at 100% nothing is left.
  type Step = [number, number, number | null];
  const series = (side: "left" | "right"): Step[] => [
    [0, 0, null],
    ...frames.map((f): Step => [
      round2((f[`${side}Progress`] as number) * 100),
      round2(f[side]),
      f[`${side}Remaining`] ?? null,
    ]),
    [100, round2(last[side]), last[`${side}Remaining`] == null ? null : 0],
  ];
  const lefts = series("left");
  const rights = series("right");
  const stepAt = (steps: Step[], pct: number): Step => {
    let found = steps[0];
    for (const step of steps) {
      if (step[0] > pct) break;
      found = step;
    }
    return found;
  };

  const shares = [...new Set([...lefts, ...rights].map(([pct]) => pct))].sort((a, b) => a - b);
  const points: MinutesPoint[] = [];
  shares.forEach((pct, i) => {
    const [, left, leftRemaining] = stepAt(lefts, pct);
    const [, right, rightRemaining] = stepAt(rights, pct);
    const previous = points[points.length - 1];
    const isLast = i === shares.length - 1;
    if (previous && previous.left === left && previous.right === right && !isLast) return;
    points.push({
      pct,
      left,
      right,
      margin: round2(left - right),
      label: label(pct),
      note: null,
      leftRemaining,
      rightRemaining,
    });
  });
  const distinct = new Set(points.map((p) => `${p.left}|${p.right}`)).size;
  return distinct >= 3 ? points : [];
}

/**
 * "Pre-game: Alpha 58%. Beta won after falling to 12% (Sun 4:30 PM)." — the
 * kickoff odds and the eventual winner's low point. Every point must carry
 * `winPct` (see `wormChart`'s `win`).
 */
export function winSummary(points: WormPoint[], leftName: string, rightName: string): string {
  const first = points[0];
  const last = points[points.length - 1];
  const parts: string[] = [];
  if (first.winPct != null) {
    const leftPregame = Math.round(first.winPct);
    parts.push(
      leftPregame >= 50
        ? `Pre-game: ${leftName} ${leftPregame}%`
        : `Pre-game: ${rightName} ${100 - leftPregame}%`,
    );
  }
  if (Math.abs(last.margin) >= 0.005) {
    const leftWon = last.margin > 0;
    const winner = leftWon ? leftName : rightName;
    let low = points[0];
    for (const p of points) {
      const mine = leftWon ? p.winPct! : 100 - p.winPct!;
      const lowest = leftWon ? low.winPct! : 100 - low.winPct!;
      if (mine < lowest) low = p;
    }
    const lowPct = Math.round(leftWon ? low.winPct! : 100 - low.winPct!);
    parts.push(
      lowPct >= 50
        ? `${winner} was favoured throughout`
        : `${winner} won after falling to ${lowPct < 1 ? "<1" : lowPct}% (${low.label})`,
    );
  }
  return `${parts.join(". ")}.`;
}

export interface WormChartOptions extends LabelOptions {
  /** Label for a point of the progress view. Default "48% played". */
  progressLabel?: (pct: number) => string;
  /** Sentence appended to each view's summary (e.g. where the data came from). */
  notes?: { clock?: string; minutes?: string; win?: string };
}

export interface WormChart {
  points: WormPoint[];
  ticks: { index: number; label: string }[];
  left: { name: string; score: number };
  right: { name: string; score: number };
  summary: string;
  /** The progress view, when every frame carries progress; else null. */
  minutes: { points: MinutesPoint[]; summary: string } | null;
  /** The win-probability view's summary, when every point has a win probability; else null. */
  win: { summary: string } | null;
}

const withNote = (summary: string, note?: string) => (note ? `${summary} ${note}` : summary);

/**
 * Everything the chart draws, or null when there is not enough history to draw
 * it. `frames` must already be oriented so `left` is the side drawn first.
 */
export function wormChart(
  frames: ScoreFrame[],
  leftName: string,
  rightName: string,
  options: WormChartOptions = {},
): WormChart | null {
  const points = buildWorm(frames, options);
  if (points.length === 0) return null;
  const last = points[points.length - 1];
  const minutesPoints = buildMinutesWorm(frames, options.progressLabel);
  return {
    points,
    ticks: dayTicks(points, options),
    left: { name: leftName, score: last.left },
    right: { name: rightName, score: last.right },
    summary: withNote(leadSummary(points, leftName, rightName), options.notes?.clock),
    minutes: minutesPoints.length
      ? {
          points: minutesPoints,
          summary: withNote(leadSummary(minutesPoints, leftName, rightName), options.notes?.minutes),
        }
      : null,
    win: points.every((p) => p.winPct != null)
      ? { summary: withNote(winSummary(points, leftName, rightName), options.notes?.win) }
      : null,
  };
}
