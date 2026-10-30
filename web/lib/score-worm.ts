/**
 * The score worm — both teams' running totals across a fantasy week.
 *
 * Named for cricket's "worm", which plots each side's cumulative runs over by
 * over so the ebb and flow of a match is visible at a glance. Here the "overs"
 * are either the scoring plays of a finished week (`matchup_score_plays`,
 * rebuilt from nflverse play-by-play by scripts/rebuild_score_worm.py) or,
 * until then, the live lineup scrapes (`matchup_score_snapshots`). Fetching
 * lives in lib/matchup-lineups.ts.
 *
 * The chart logic itself is league-agnostic and lives in the `fantasy-worm`
 * package (web/packages/fantasy-worm). This module is the Ottoneu adapter: it
 * maps stored home/away rows onto the package's left/right `ScoreFrame`s and
 * supplies the league's time zone and wording. See
 * docs/references/worm-productization.md.
 *
 * A rebuilt worm can also be drawn by **minutes played**: each team's score
 * against the share of its own lineup's game minutes that had elapsed
 * (`home_progress`/`away_progress`, 60 minutes per starter plus any overtime),
 * and by **win probability** (`home_win_prob`, the left side's chance after
 * each play, plus a pre-game value on a 0–0 "Kickoff" row).
 */

import {
  buildMinutesWorm as buildFramesMinutesWorm,
  buildWorm as buildFramesWorm,
  dayTicks as frameDayTicks,
  flipFrames,
  leadSummary,
  progressLabel,
  timeLabel,
  winSummary as frameWinSummary,
  wormChart as framesWormChart,
  type LabelOptions,
  type MinutesPoint,
  type ScoreFrame,
  type WormChart,
  type WormPoint,
  type WormReading,
} from "fantasy-worm";
import { LEAGUE_TZ } from "./nfl-week";

export { biggestLeads, leadChanges } from "fantasy-worm";
export type { MinutesPoint, WormChart, WormPoint, WormReading };

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
  /** Each side's projected points still to come after this play; absent for a scrape. */
  home_proj_remaining?: number | null;
  away_proj_remaining?: number | null;
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

const LABELS: LabelOptions = { timeZone: LEAGUE_TZ };

/** Stored rows → the package's frames, home on the left. */
export function toFrames(snapshots: ScoreSnapshot[]): ScoreFrame[] {
  return snapshots.map((s) => ({
    at: s.scraped_at,
    left: s.home_points,
    right: s.away_points,
    note: s.note,
    leftProgress: s.home_progress,
    rightProgress: s.away_progress,
    leftWinProb: s.home_win_prob,
    leftRemaining: s.home_proj_remaining,
    rightRemaining: s.away_proj_remaining,
  }));
}

/** Swap home and away, so the viewer's team can be drawn first on /matchup. */
export function flipSnapshots(snapshots: ScoreSnapshot[]): ScoreSnapshot[] {
  return flipFrames(toFrames(snapshots)).map((f) => ({
    scraped_at: f.at,
    home_points: f.left,
    away_points: f.right,
    note: f.note,
    home_progress: f.leftProgress,
    away_progress: f.rightProgress,
    home_win_prob: f.leftWinProb,
    home_proj_remaining: f.leftRemaining,
    away_proj_remaining: f.rightRemaining,
  }));
}

/** Snapshots → worm points (see `buildWorm` in fantasy-worm), labelled in league time. */
export function buildWorm(snapshots: ScoreSnapshot[]): WormPoint[] {
  return buildFramesWorm(toFrames(snapshots), LABELS);
}

/** "Sun 2:30 PM" in league time; "Start" for the origin. */
export function wormTimeLabel(at: string | null): string {
  return timeLabel(at, LABELS);
}

/** Axis ticks: the first point of each league-time day ("Thu", "Sun", "Mon"). */
export function dayTicks(points: WormPoint[]): { index: number; label: string }[] {
  return frameDayTicks(points, LABELS);
}

const SOURCE_NOTE: Record<WormSource, string> = {
  plays: "One point per scoring play, rebuilt from NFL play-by-play.",
  scrapes:
    "One point per score update, read during game windows; rebuilt play by play once the week's games are final.",
};

const MINUTES_NOTE =
  "Each team's score against the share of its own lineup's game minutes played — 60 per starter, plus any overtime.";

const WIN_NOTE =
  "Win probability blends each side's points so far with its starters' kickoff projections for their remaining minutes.";

/** "Lead changed hands 3 times · biggest leads: Alpha 21.40, Beta 8.10." plus where the points came from. */
export function wormSummary(
  points: Pick<WormReading, "margin">[],
  leftName: string,
  rightName: string,
  source: WormSource | "minutes" = "scrapes",
): string {
  const note = source === "minutes" ? MINUTES_NOTE : SOURCE_NOTE[source];
  return `${leadSummary(points, leftName, rightName)} ${note}`;
}

/** "48% of lineup minutes played". */
export function minutesLabel(pct: number): string {
  return progressLabel(pct, "of lineup minutes played");
}

/** Rows → the minutes-played view; [] for scrapes, which carry no game clock. */
export function buildMinutesWorm(snapshots: ScoreSnapshot[]): MinutesPoint[] {
  return buildFramesMinutesWorm(toFrames(snapshots), minutesLabel);
}

/** "Pre-game: Alpha 58%. Beta won after falling to 12% (Sun 4:30 PM)." plus how the model works. */
export function winSummary(points: WormPoint[], leftName: string, rightName: string): string {
  return `${frameWinSummary(points, leftName, rightName)} ${WIN_NOTE}`;
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
  return framesWormChart(toFrames(snapshots), leftName, rightName, {
    ...LABELS,
    progressLabel: minutesLabel,
    notes: { clock: SOURCE_NOTE[source], minutes: MINUTES_NOTE, win: WIN_NOTE },
  });
}
