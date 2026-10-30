/**
 * The "hurricane" cone — where each side's score was headed, seen from any
 * point. From point t, for each side, the central 80% of where its score would
 * be at every later point s:
 *
 *   centre(s) = points(t) + remaining(t) − remaining(s)
 *   half(s)   = 1.2816 × sd × √(progress(s) − progress(t))
 *
 * `sd` is the spread of a full lineup's actual total around its projection —
 * a property of the league's scoring and lineup size, so the caller supplies
 * it (see `rebuild.ts` and the README on calibrating it).
 */

import type { Band, ConeFields, MinutesPoint } from "./types";

/** The central 80% of a normal distribution is ±1.2816 standard deviations. */
export const CONE_Z = 1.2816;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whether every point carries what a cone needs. */
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
  sd: number,
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
 * the lineup still to play.
 */
export function finalRanges(
  points: ConeFields[],
  from: number,
  sd: number,
): { left: Band; right: Band } | null {
  if (!hasCone(points) || from < 0 || from >= points.length) return null;
  const o = points[from];
  return {
    left: band(o.left + o.leftRemaining!, 1 - o.leftProgress!, sd),
    right: band(o.right + o.rightRemaining!, 1 - o.rightProgress!, sd),
  };
}

/**
 * Progress-view points in the cone's shape: a point at `pct` is where *both*
 * sides had played `pct` of their own lineups.
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
