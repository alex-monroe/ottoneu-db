/**
 * The score worm — both teams' running totals across a fantasy week.
 *
 * Named for cricket's "worm", which plots each side's cumulative runs over by
 * over so the ebb and flow of a match is visible at a glance. Here the "overs"
 * are either the scoring plays of a finished week (`matchup_score_plays`,
 * rebuilt from nflverse play-by-play by scripts/rebuild_score_worm.py) or,
 * until then, the live lineup scrapes (`matchup_score_snapshots`). This module
 * is pure: it turns stored rows into the series the chart draws. Fetching
 * lives in lib/matchup-lineups.ts.
 *
 * The x-axis is the snapshot sequence, not wall-clock time. A fantasy week is
 * Thursday night, a long empty Friday and Saturday, then Sunday and Monday; on
 * a time axis the empty days would take up most of the chart and squash the
 * Sunday afternoon where the game is decided. Repeated identical totals are
 * dropped for the same reason — a scrape where nothing changed is not an over.
 *
 * A rebuilt worm can also be drawn by **minutes played**: each team's score
 * against the share of its own lineup's game minutes that had elapsed
 * (`home_progress`/`away_progress`, 60 minutes per starter plus any overtime).
 * That is closer to the cricket original, where each innings is measured in
 * its own overs: it shows who was ahead at the same point in their lineups,
 * however the NFL schedule spread those lineups across the week.
 *
 * And by **win probability** (`home_win_prob`, the left side's chance after
 * each play, plus a pre-game value on a 0–0 "Kickoff" row). The model lives in
 * scripts/rebuild_score_worm.py; this module only orients and summarises it.
 */

import { LEAGUE_TZ } from "./nfl-week";

/** One stored snapshot, home and away as Ottoneu has them. */
export interface ScoreSnapshot {
  /** When the score was read (a scrape) or made (a play). */
  scraped_at: string;
  home_points: number;
  away_points: number;
  /** Who scored, for a rebuilt play ("J. Chase +9.40"); absent for a scrape. */
  note?: string | null;
  /** Share (0–1) of each side's lineup minutes played; absent for a scrape. */
  home_progress?: number | null;
  away_progress?: number | null;
  /** The home side's chance of winning after this play (0–1); absent for a scrape. */
  home_win_prob?: number | null;
}

/**
 * Where a game's worm comes from: `plays` once the week has been rebuilt from
 * play-by-play, `scrapes` (the live snapshots) before that.
 */
export type WormSource = "plays" | "scrapes";

/** A game's stored score history and which table it came from. */
export interface ScoreHistory {
  source: WormSource;
  snapshots: ScoreSnapshot[];
}

/**
 * One point on the worm. `left` and `right` are the two sides in the order the
 * page shows them — home/away on a game page, you/them on /matchup.
 */
export interface WormPoint {
  /** Snapshot time (ISO); null for the 0–0 origin. */
  at: string | null;
  left: number;
  right: number;
  /** left − right. */
  margin: number;
  /** "Sun 2:30 PM" (league time), or "Start". Precomputed so the client chart needs no timezone code. */
  label: string;
  /** Who scored on this play, for a rebuilt worm; null otherwise. */
  note: string | null;
  /** The left side's win probability in percent (0–100); null when not stored. */
  winPct: number | null;
}

/** What the tooltip reads off any point, whichever axis it is drawn on. */
export type WormReading = Pick<WormPoint, "left" | "right" | "margin" | "label" | "note"> &
  Partial<Pick<WormPoint, "winPct">>;

/**
 * One point of the minutes-played view: both sides' scores once each had
 * played `pct` percent of its own lineup's game minutes.
 */
export interface MinutesPoint extends WormReading {
  /** 0–100. */
  pct: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const toPct = (p: number | null | undefined) => (p == null ? null : Math.round(p * 1000) / 10);

/** Swap home and away, so the viewer's team can be drawn first on /matchup. */
export function flipSnapshots(snapshots: ScoreSnapshot[]): ScoreSnapshot[] {
  return snapshots.map((s) => ({
    scraped_at: s.scraped_at,
    home_points: s.away_points,
    away_points: s.home_points,
    note: s.note,
    home_progress: s.away_progress,
    away_progress: s.home_progress,
    home_win_prob: s.home_win_prob == null ? s.home_win_prob : round4(1 - s.home_win_prob),
  }));
}

/**
 * Snapshots → worm points: in time order, consecutive repeats dropped (the
 * first time a score was seen is when it happened), behind a 0–0 origin.
 *
 * Returns [] when there are fewer than two distinct scores — a single snapshot
 * would draw one straight line from 0–0 to the current score, which says
 * nothing about how the game got there.
 */
export function buildWorm(snapshots: ScoreSnapshot[]): WormPoint[] {
  const sorted = [...snapshots].sort((a, b) => a.scraped_at.localeCompare(b.scraped_at));
  // A rebuilt game's 0–0 Kickoff row carries the pre-game win probability:
  // it becomes the origin's, and is otherwise dropped as a repeat of 0–0.
  const kickoff = sorted.find((s) => s.home_points === 0 && s.away_points === 0);
  const points: WormPoint[] = [
    {
      at: null,
      left: 0,
      right: 0,
      margin: 0,
      label: wormTimeLabel(null),
      note: null,
      winPct: toPct(kickoff?.home_win_prob),
    },
  ];
  for (const s of sorted) {
    const left = round2(s.home_points);
    const right = round2(s.away_points);
    const last = points[points.length - 1];
    if (left === last.left && right === last.right) continue;
    points.push({
      at: s.scraped_at,
      left,
      right,
      margin: round2(left - right),
      label: wormTimeLabel(s.scraped_at),
      note: s.note ?? null,
      winPct: toPct(s.home_win_prob),
    });
  }
  return points.length >= 3 ? points : [];
}

/** How many times the lead changed hands. A tie is not a lead, so it neither starts nor ends one. */
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

/** The largest lead each side held at any snapshot (0 if it never led). */
export function biggestLeads(points: Pick<WormReading, "margin">[]): { left: number; right: number } {
  let left = 0;
  let right = 0;
  for (const p of points) {
    if (p.margin > left) left = p.margin;
    if (-p.margin > right) right = -p.margin;
  }
  return { left: round2(left), right: round2(right) };
}

/** "Sun 2:30 PM" in league time; "Start" for the origin. */
export function wormTimeLabel(at: string | null): string {
  if (!at) return "Start";
  return new Date(at).toLocaleString("en-US", {
    timeZone: LEAGUE_TZ,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function weekday(at: string): string {
  return new Date(at).toLocaleString("en-US", { timeZone: LEAGUE_TZ, weekday: "short" });
}

/**
 * Axis ticks: the index of the first point of each league-time day, labelled
 * with that day ("Thu", "Sun", "Mon"). The origin is not a day.
 */
export function dayTicks(points: WormPoint[]): { index: number; label: string }[] {
  const ticks: { index: number; label: string }[] = [];
  let previous: string | null = null;
  points.forEach((p, index) => {
    if (!p.at) return;
    const day = weekday(p.at);
    if (day !== previous) ticks.push({ index, label: day });
    previous = day;
  });
  return ticks;
}

const SOURCE_NOTE: Record<WormSource, string> = {
  plays: "One point per scoring play, rebuilt from NFL play-by-play.",
  scrapes:
    "One point per score update, read during game windows; rebuilt play by play once the week's games are final.",
};

const MINUTES_NOTE =
  "Each team's score against the share of its own lineup's game minutes played — 60 per starter, plus any overtime.";

/** "Lead changed hands 3 times · biggest leads: Alpha 21.40, Beta 8.10." */
export function wormSummary(
  points: Pick<WormReading, "margin">[],
  leftName: string,
  rightName: string,
  source: WormSource | "minutes" = "scrapes",
): string {
  const changes = leadChanges(points);
  const leads = biggestLeads(points);
  const changed =
    changes === 0 ? "The lead never changed hands" : `Lead changed hands ${changes} time${changes === 1 ? "" : "s"}`;
  const parts = [
    leads.left > 0 ? `${leftName} ${leads.left.toFixed(2)}` : null,
    leads.right > 0 ? `${rightName} ${leads.right.toFixed(2)}` : null,
  ].filter(Boolean);
  const biggest = parts.length ? ` · biggest lead${parts.length > 1 ? "s" : ""}: ${parts.join(", ")}` : "";
  return `${changed}${biggest}. ${source === "minutes" ? MINUTES_NOTE : SOURCE_NOTE[source]}`;
}

/** "48% of lineup minutes played". */
export function minutesLabel(pct: number): string {
  const shown = pct > 0 && pct < 1 ? "<1" : String(Math.round(pct));
  return `${shown}% of lineup minutes played`;
}

/**
 * Rows → the minutes-played view: each side's score as a step function of its
 * own share of lineup minutes, read off at every share where either side
 * moved, so both values at a point belong to the same share. Starts at 0–0 and
 * ends at 100% with the final score.
 *
 * Returns [] unless every row carries both sides' progress (a scrape, or a
 * play rebuilt before progress was stored) and the game has at least two
 * distinct scores.
 */
export function buildMinutesWorm(snapshots: ScoreSnapshot[]): MinutesPoint[] {
  if (
    snapshots.length === 0 ||
    snapshots.some((s) => s.home_progress == null || s.away_progress == null)
  ) {
    return [];
  }
  const last = snapshots[snapshots.length - 1];
  const series = (side: "home" | "away"): [number, number][] => [
    [0, 0],
    ...snapshots.map((s): [number, number] => [
      round2((s[`${side}_progress`] as number) * 100),
      round2(s[`${side}_points`]),
    ]),
    [100, round2(last[`${side}_points`])],
  ];
  const home = series("home");
  const away = series("away");
  // Score once `pct` of the lineup is played: the latest step at or before it.
  const scoreAt = (steps: [number, number][], pct: number) => {
    let score = 0;
    for (const [at, value] of steps) {
      if (at > pct) break;
      score = value;
    }
    return score;
  };

  const shares = [...new Set([...home, ...away].map(([pct]) => pct))].sort((a, b) => a - b);
  const points: MinutesPoint[] = [];
  shares.forEach((pct, i) => {
    const left = scoreAt(home, pct);
    const right = scoreAt(away, pct);
    const previous = points[points.length - 1];
    const isLast = i === shares.length - 1;
    if (previous && previous.left === left && previous.right === right && !isLast) return;
    points.push({ pct, left, right, margin: round2(left - right), label: minutesLabel(pct), note: null });
  });
  const distinct = new Set(points.map((p) => `${p.left}|${p.right}`)).size;
  return distinct >= 3 ? points : [];
}

const WIN_NOTE =
  "Win probability blends each side's points so far with its starters' kickoff projections for their remaining minutes.";

/**
 * "Pre-game: Alpha 58%. Beta won after falling to 12% (Sun 4:30 PM)." — the
 * kickoff odds and the eventual winner's low point, its comeback.
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
  return `${parts.join(". ")}. ${WIN_NOTE}`;
}

export interface WormChart {
  points: WormPoint[];
  ticks: { index: number; label: string }[];
  left: { name: string; score: number };
  right: { name: string; score: number };
  summary: string;
  /** The minutes-played view, when every row carries progress; else null. */
  minutes: { points: MinutesPoint[]; summary: string } | null;
  /** The win-probability view's summary, when every point has a win probability; else null. */
  win: { summary: string } | null;
}

/**
 * Everything ScoreWorm draws, or null when there is not enough history to draw
 * it. `snapshots` must already be oriented so `home_points` is the left side.
 */
export function wormChart(
  snapshots: ScoreSnapshot[],
  leftName: string,
  rightName: string,
  source: WormSource = "scrapes",
): WormChart | null {
  const points = buildWorm(snapshots);
  if (points.length === 0) return null;
  const last = points[points.length - 1];
  const minutesPoints = buildMinutesWorm(snapshots);
  return {
    points,
    ticks: dayTicks(points),
    left: { name: leftName, score: last.left },
    right: { name: rightName, score: last.right },
    summary: wormSummary(points, leftName, rightName, source),
    minutes: minutesPoints.length
      ? { points: minutesPoints, summary: wormSummary(minutesPoints, leftName, rightName, "minutes") }
      : null,
    win: points.every((p) => p.winPct != null)
      ? { summary: winSummary(points, leftName, rightName) }
      : null,
  };
}
