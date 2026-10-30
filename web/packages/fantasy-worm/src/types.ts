/**
 * The data contract. Nothing here knows about a league, a platform or a sport:
 * a head-to-head fantasy game is two sides — `left` and `right`, in the order
 * the page draws them — whose running totals move over a scoring period.
 */

/**
 * One moment of a game: both sides' running totals, and optionally what the
 * win-probability and cone views need. This is the package's input.
 *
 * A frame where both totals are 0 is the **kickoff** frame: its win
 * probability and projections become the worm's origin.
 */
export interface ScoreFrame {
  /** When the totals were read (a poll) or made (a play), ISO 8601. */
  at: string;
  left: number;
  right: number;
  /** Who scored, e.g. "J. Chase +9.40"; absent for a poll. */
  note?: string | null;
  /** Share (0–1) of each side's lineup played so far. */
  leftProgress?: number | null;
  rightProgress?: number | null;
  /** The left side's chance of winning (0–1) at this moment. */
  leftWinProb?: number | null;
  /** Each side's projected points still to come at this moment. */
  leftRemaining?: number | null;
  rightRemaining?: number | null;
}

/** One point on the worm drawn against the clock. */
export interface WormPoint {
  /** Frame time (ISO); null for the 0–0 origin. */
  at: string | null;
  left: number;
  right: number;
  /** left − right. */
  margin: number;
  /** Display label, e.g. "Sun 2:30 PM", or the origin label. */
  label: string;
  note: string | null;
  /** The left side's win probability in percent (0–100); null when not given. */
  winPct: number | null;
  leftRemaining: number | null;
  rightRemaining: number | null;
  leftProgress: number | null;
  rightProgress: number | null;
}

/** What a tooltip reads off any point, whichever axis it is drawn on. */
export type WormReading = Pick<WormPoint, "left" | "right" | "margin" | "label" | "note"> &
  Partial<Pick<WormPoint, "winPct">>;

/**
 * One point of the progress ("minutes played") view: both sides' scores once
 * each had played `pct` percent of its own lineup.
 */
export interface MinutesPoint extends WormReading {
  /** 0–100. */
  pct: number;
  leftRemaining: number | null;
  rightRemaining: number | null;
}

/** A [low, high] score range. */
export type Band = [number, number];

/** What the hurricane cone needs from a point. */
export type ConeFields = Pick<
  WormPoint,
  "left" | "right" | "leftRemaining" | "rightRemaining" | "leftProgress" | "rightProgress"
>;

export type Side = "left" | "right";
