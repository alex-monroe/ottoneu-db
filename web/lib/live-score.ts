/**
 * Which score a matchup shows: ESPN's or Ottoneu's.
 *
 * While NFL games are on, the live worm (`scripts/live_score_worm.py`) scores
 * every play from ESPN's play-by-play within a minute or so, well ahead of the
 * Ottoneu box score, which is re-scraped every 5 minutes and itself lags the
 * games. So during a live week the headline score is the worm's running total,
 * with Ottoneu's — the official number, the one the league is decided on —
 * shown small beside it. Once the matchup settles, Ottoneu's is the only score.
 *
 * Pure functions; the reads are in lib/matchup-lineups.ts.
 */

import type { ScoreHistory } from "./score-worm";
import type { LiveGame } from "./live-matchup";
import type { Matchup } from "./standings";

export interface TeamScores {
  home: number;
  away: number;
}

/** The worm's running total after its latest play. */
export interface LiveTotals extends TeamScores {
  /** The latest play's wall-clock time. */
  at: string;
}

export interface ShownScore extends TeamScores {
  /**
   * Ottoneu's current score when the headline numbers are ESPN's, so the page
   * can show both; null when the headline numbers are Ottoneu's own.
   */
  official: TeamScores | null;
  /** When the ESPN total last moved, for a headline from ESPN. */
  liveAt: string | null;
}

/**
 * The running total at the end of a game's worm, only while it is live (some
 * play came from ESPN). A worm rebuilt from nflverse ends on Ottoneu's final
 * already, so there is nothing to show beside it.
 */
export function liveTotalsOf(history: ScoreHistory): LiveTotals | null {
  if (history.source !== "live" || history.snapshots.length === 0) return null;
  const last = history.snapshots[history.snapshots.length - 1];
  return { home: last.home_points, away: last.away_points, at: last.scraped_at };
}

/**
 * Ottoneu's score for each side. The box score's starters are what Ottoneu
 * totals, so their sum is the score, and the box score is scraped more often
 * than the schedule; the schedule's stored team total is the fallback for a
 * side with no box score yet.
 */
export function officialScores(
  matchup: Pick<Matchup, "home_score" | "away_score">,
  game: LiveGame | null | undefined,
): TeamScores {
  const home = game?.home.totals;
  const away = game?.away.totals;
  return {
    home: home && home.starters > 0 ? home.actual : (matchup.home_score ?? 0),
    away: away && away.starters > 0 ? away.actual : (matchup.away_score ?? 0),
  };
}

/**
 * Whether Ottoneu has the last word on a matchup: it is final, or the latest
 * box score has every starter on both sides done (or on a bye). From then on
 * nothing ESPN adds is news, and Ottoneu's number is the score.
 */
export function isSettled(status: string, game: LiveGame | null | undefined): boolean {
  if (status === "final") return true;
  if (!game) return false;
  const sides = [game.home.totals, game.away.totals];
  return sides.every((t) => t.starters > 0 && t.playing + t.toPlay === 0);
}

/**
 * The score to put in the headline. ESPN's running total while it is current
 * — the live loop's heartbeat is fresh, so it is still moving — and the
 * matchup is unsettled; Ottoneu's otherwise. A stale ESPN total (the loop
 * stopped mid-afternoon) falls back to Ottoneu, which keeps scraping.
 */
export function shownScore({
  official,
  live,
  gamesAreLive,
  settled,
}: {
  official: TeamScores;
  live: LiveTotals | null | undefined;
  gamesAreLive: boolean;
  settled: boolean;
}): ShownScore {
  if (!live || !gamesAreLive || settled) {
    return { home: official.home, away: official.away, official: null, liveAt: null };
  }
  return { home: live.home, away: live.away, official, liveAt: live.at };
}
