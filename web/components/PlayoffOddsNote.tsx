import type { PlayoffOdds } from "@/lib/types";

/** "Dec 1" for a YYYY-MM-DD date. */
export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The fine print under a standings table that carries playoff odds. */
export default function PlayoffOddsNote({ odds }: { odds: PlayoffOdds }) {
  return (
    <p className="mt-2 text-xs text-ink-subtle">
      Playoff and #1-seed odds come from {odds.simulations.toLocaleString()} simulations of
      the {odds.games_remaining} regular-season games left. Each team&apos;s weekly score is
      drawn around its optimal-lineup projection
      {odds.projection_week != null ? ` (Week ${odds.projection_week} projections)` : ""}, or
      its points per game where there is none, with the spread of its own weekly scores.
      {odds.signal_active && odds.trade_deadline && (
        <>
          {" "}
          Deadline (trades close {shortDate(odds.trade_deadline)}): <strong>buyer</strong> when
          a {odds.boost_ppg}-point-per-game upgrade would lift the team&apos;s odds meaningfully,{" "}
          <strong>seller</strong> when even that upgrade leaves it a long shot,{" "}
          <strong>hold</strong> otherwise.
        </>
      )}
    </p>
  );
}
