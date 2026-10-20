/**
 * The score worm — both teams' running totals across a fantasy week.
 *
 * Named for cricket's "worm", which plots each side's cumulative runs over by
 * over so the ebb and flow of a match is visible at a glance. Here the "overs"
 * are the lineup scrapes (`matchup_score_snapshots`, every 30 minutes through
 * game windows). This module is pure: it turns stored snapshots into the series
 * the chart draws. Fetching lives in lib/matchup-lineups.ts.
 *
 * The x-axis is the snapshot sequence, not wall-clock time. A fantasy week is
 * Thursday night, a long empty Friday and Saturday, then Sunday and Monday; on
 * a time axis the empty days would take up most of the chart and squash the
 * Sunday afternoon where the game is decided. Repeated identical totals are
 * dropped for the same reason — a scrape where nothing changed is not an over.
 */

import { LEAGUE_TZ } from "./nfl-week";

/** One stored snapshot, home and away as Ottoneu has them. */
export interface ScoreSnapshot {
  scraped_at: string;
  home_points: number;
  away_points: number;
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
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Swap home and away, so the viewer's team can be drawn first on /matchup. */
export function flipSnapshots(snapshots: ScoreSnapshot[]): ScoreSnapshot[] {
  return snapshots.map((s) => ({
    scraped_at: s.scraped_at,
    home_points: s.away_points,
    away_points: s.home_points,
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
  const points: WormPoint[] = [{ at: null, left: 0, right: 0, margin: 0, label: wormTimeLabel(null) }];
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
    });
  }
  return points.length >= 3 ? points : [];
}

/** How many times the lead changed hands. A tie is not a lead, so it neither starts nor ends one. */
export function leadChanges(points: WormPoint[]): number {
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
export function biggestLeads(points: WormPoint[]): { left: number; right: number } {
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

/** "Lead changed hands 3 times · biggest leads: Alpha 21.40, Beta 8.10." */
export function wormSummary(points: WormPoint[], leftName: string, rightName: string): string {
  const changes = leadChanges(points);
  const leads = biggestLeads(points);
  const changed =
    changes === 0 ? "The lead never changed hands" : `Lead changed hands ${changes} time${changes === 1 ? "" : "s"}`;
  const parts = [
    leads.left > 0 ? `${leftName} ${leads.left.toFixed(2)}` : null,
    leads.right > 0 ? `${rightName} ${leads.right.toFixed(2)}` : null,
  ].filter(Boolean);
  const biggest = parts.length ? ` · biggest lead${parts.length > 1 ? "s" : ""}: ${parts.join(", ")}` : "";
  return `${changed}${biggest}. One point per score update, read every 30 minutes through game windows.`;
}

export interface WormChart {
  points: WormPoint[];
  ticks: { index: number; label: string }[];
  left: { name: string; score: number };
  right: { name: string; score: number };
  summary: string;
}

/**
 * Everything ScoreWorm draws, or null when there is not enough history to draw
 * it. `snapshots` must already be oriented so `home_points` is the left side.
 */
export function wormChart(
  snapshots: ScoreSnapshot[],
  leftName: string,
  rightName: string,
): WormChart | null {
  const points = buildWorm(snapshots);
  if (points.length === 0) return null;
  const last = points[points.length - 1];
  return {
    points,
    ticks: dayTicks(points),
    left: { name: leftName, score: last.left },
    right: { name: rightName, score: last.right },
    summary: wormSummary(points, leftName, rightName),
  };
}
