/**
 * The score worm's "hurricane" cone — where each team's score was headed,
 * seen from any moment of the week.
 *
 * Hovering a point t on the clock view shades, for each side, the central 80%
 * of where its score would be at every later point s, given what was known at
 * t:
 *
 *   centre(s) = points(t) + remaining(t) − remaining(s)
 *   half(s)   = 1.2816 × WORM_LINEUP_SD × √(progress(s) − progress(t))
 *
 * `remaining` is the side's projected points still to come (each starter's
 * kickoff projection × the share of his game not yet played) and `progress`
 * its share of lineup minutes played, both stored per play by
 * scripts/rebuild_score_worm.py. The cone has no width at t and widens to the
 * final-score range; hovered early it is wide, and it closes around the actual
 * line as the hover moves right. The same model drives the Win % view.
 *
 * The Minutes played view uses the same cone with x = each side's share of
 * its own lineup minutes (`minutesConePoints`): there progress *is* the x-axis,
 * so a side's cone widens with √(share played since the hovered share).
 *
 * Pure and dependency-free (config only), so the client chart can import it:
 * a cone per hover point is computed on demand rather than shipped from the
 * server.
 */

import { WORM_LINEUP_SD } from "./config";
import type { MinutesPoint, WormPoint } from "./score-worm";

/** The central 80% of a normal distribution is ±1.2816 standard deviations. */
export const CONE_Z = 1.2816;

export type Band = [number, number];

export type ConeFields = Pick<
  WormPoint,
  "left" | "right" | "leftRemaining" | "rightRemaining" | "leftProgress" | "rightProgress"
>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whether every point carries what a cone needs (rebuilt plays, not scrapes). */
export function hasCone(points: ConeFields[]): boolean {
  return (
    points.length > 0 &&
    points.every(
      (p) =>
        p.leftRemaining != null &&
        p.rightRemaining != null &&
        p.leftProgress != null &&
        p.rightProgress != null,
    )
  );
}

/** A centre ± the 80% half-width; floored at 0, since a lineup's total does not go meaningfully negative. */
function band(centre: number, playedSince: number, sd: number): Band {
  const half = CONE_Z * sd * Math.sqrt(Math.max(0, playedSince));
  return [round2(Math.max(0, centre - half)), round2(centre + half)];
}

/**
 * Each point's 80% band per side as seen from point `from` — null before it
 * (the cone only looks forward). Empty when the points carry no cone data.
 */
export function coneFrom(
  points: ConeFields[],
  from: number,
  sd: number = WORM_LINEUP_SD,
): { leftBand: Band | null; rightBand: Band | null }[] {
  if (!hasCone(points) || from < 0 || from >= points.length) return [];
  const o = points[from];
  return points.map((p, i) => {
    if (i < from) return { leftBand: null, rightBand: null };
    return {
      leftBand: band(o.left + o.leftRemaining! - p.leftRemaining!, p.leftProgress! - o.leftProgress!, sd),
      rightBand: band(o.right + o.rightRemaining! - p.rightRemaining!, p.rightProgress! - o.rightProgress!, sd),
    };
  });
}

/**
 * Each side's 80% range for its *final* score, seen from point `from`: its
 * points plus everything still projected, give or take the uncertainty of all
 * the minutes still to play. (The drawn cone ends at the last scoring play,
 * which can come before the last whistle; this is the whole way.)
 */
export function finalRanges(
  points: ConeFields[],
  from: number,
  sd: number = WORM_LINEUP_SD,
): { left: Band; right: Band } | null {
  if (!hasCone(points) || from < 0 || from >= points.length) return null;
  const o = points[from];
  return {
    left: band(o.left + o.leftRemaining!, 1 - o.leftProgress!, sd),
    right: band(o.right + o.rightRemaining!, 1 - o.rightProgress!, sd),
  };
}

/**
 * Minutes-played points in the cone's shape: on that view a point at `pct`
 * is where *both* sides had played `pct` of their own lineup minutes, so both
 * progresses are `pct / 100`.
 */
export function minutesConePoints(points: MinutesPoint[]): ConeFields[] {
  return points.map((p) => ({
    left: p.left,
    right: p.right,
    leftRemaining: p.leftRemaining,
    rightRemaining: p.rightRemaining,
    leftProgress: p.pct / 100,
    rightProgress: p.pct / 100,
  }));
}
