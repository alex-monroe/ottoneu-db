import { FULL_SEASON_GAMES } from "@/lib/config";
import type { StatWindow } from "@/lib/stat-window";

/**
 * Says out loud how much football is behind the numbers below it.
 *
 * Every production figure on this site used to describe a finished season, so
 * none of them needed a caveat. `player_stats` now carries a row for the season
 * being played, which means the same headings can sit above two Sundays of
 * football — and a two-game sample looks exactly like a seventeen-game one once
 * it has been averaged into a PPG.
 *
 * So the pages that read production render this, and they render it from the same
 * {@link StatWindow} their arithmetic is scaled by. One object feeds the sentence
 * and the maths, which is what makes it impossible for the two to disagree.
 *
 * A finished season renders nothing: there is no caveat to make, and the
 * retrospective pages should look exactly as they did.
 */
export default function StatWindowNote({
  window: w,
  /** What the numbers below are, for the sentence: "These <what> cover …". */
  what = "numbers",
  className = "",
}: {
  window: StatWindow;
  what?: string;
  className?: string;
}) {
  if (w.complete) return null;

  const pct = Math.round(w.fraction * 100);
  const weeks = w.weeksPlayed;

  return (
    <div
      className={`rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/40 ${className}`}
      role="note"
    >
      <p className="font-medium text-ink">
        {w.season} is still being played — {pct}% of the season is in these
        numbers.
      </p>
      <p className="mt-1 text-ink-muted">
        These {what} cover {w.games === 1 ? "one game" : `${w.games} games`} of a{" "}
        {FULL_SEASON_GAMES}-game season
        {weeks ? `, through Week ${weeks}` : ""}. A rate built on{" "}
        {w.games === 1 ? "one game" : `${w.games} games`} moves a long way on one
        good Sunday, so read the ranks as a snapshot rather than a verdict — and
        expect a lot of them to be noise.
        {w.games < 4 && (
          <>
            {" "}
            This early, a single big performance can carry a player from
            replacement level to the top of his position.
          </>
        )}
      </p>
    </div>
  );
}
