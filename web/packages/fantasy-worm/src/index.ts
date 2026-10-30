/**
 * fantasy-worm — score worm, win probability and "hurricane" cone for any
 * head-to-head fantasy game. See README.md for the data contract.
 */

export type { Band, ConeFields, MinutesPoint, ScoreFrame, Side, WormPoint, WormReading } from "./types";
export {
  biggestLeads,
  buildMinutesWorm,
  buildWorm,
  dayTicks,
  flipFrames,
  leadChanges,
  leadSummary,
  progressLabel,
  timeLabel,
  winSummary,
  wormChart,
  type LabelOptions,
  type WormChart,
  type WormChartOptions,
} from "./worm";
export { CONE_Z, coneFrom, finalRanges, hasCone, minutesConePoints } from "./cone";
export { leftWinProbability, normalCdf, winProbability, type SideState } from "./win-probability";
export {
  clockAt,
  rebuildFrames,
  sideProgress,
  sideRemaining,
  type GameClock,
  type RebuildInput,
  type ScoringEvent,
  type Slot,
} from "./rebuild";
