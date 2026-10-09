/**
 * When this site's season-long projection model stops being worth showing.
 *
 * The model (and the Draft Sharks auction values shown beside it) is a
 * preseason product: it exists so arbitration and the auction have a
 * forward-looking number at a time of year when no public projections exist.
 * Once games are being played it is stale — it never updates — and better
 * sources are available: the season's actual production, per-game weekly
 * projections, and public rest-of-season rankings.
 *
 * Left in front of agents all season it became the anchor for in-season
 * trade and keep/cut advice, so in-season the player card, hover cards, and
 * the MCP server withhold it. The dedicated `/projections` page keeps it.
 */

import type { Phase } from "./season";

/** True while the preseason model should be withheld from player-level views. */
export function isPreseasonProjectionStale(phase: Phase): boolean {
  return phase === "in_season";
}

/** What an agent should use instead — shared by every MCP response that withholds the model. */
export const PRESEASON_PROJECTION_NOTE =
  "This site's season-long projection model is a PRESEASON product, built for arbitration and " +
  "auction valuation when no public projections exist. It is not updated during the season and is " +
  "known to be inaccurate, so it is withheld while games are being played. For trade, keep/cut, and " +
  "start/sit reasoning use, in order: this season's actual production (get_player season_stats, " +
  "get_earned_value), get_weekly_projections (Sleeper, per game), and public rest-of-season and " +
  "dynasty rankings and news.";
