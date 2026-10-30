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
 * `remaining` and `progress` are stored per play by
 * scripts/rebuild_score_worm.py. The math lives in the league-agnostic
 * `fantasy-worm` package; this module only supplies the league's spread,
 * WORM_LINEUP_SD (config.json), as the default.
 *
 * Pure and dependency-free (config only), so the client chart can import it:
 * a cone per hover point is computed on demand rather than shipped from the
 * server.
 */

import {
  coneFrom as packageConeFrom,
  finalRanges as packageFinalRanges,
  type Band,
  type ConeFields,
} from "fantasy-worm";
import { WORM_LINEUP_SD } from "./config";

export { CONE_Z, hasCone, minutesConePoints } from "fantasy-worm";
export type { Band, ConeFields };

/** Each point's 80% band per side as seen from point `from` (see fantasy-worm). */
export function coneFrom(
  points: ConeFields[],
  from: number,
  sd: number = WORM_LINEUP_SD,
): { leftBand: Band | null; rightBand: Band | null }[] {
  return packageConeFrom(points, from, sd);
}

/** Each side's 80% range for its final score, seen from point `from` (see fantasy-worm). */
export function finalRanges(
  points: ConeFields[],
  from: number,
  sd: number = WORM_LINEUP_SD,
): { left: Band; right: Band } | null {
  return packageFinalRanges(points, from, sd);
}
