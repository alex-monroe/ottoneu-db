import Link from "next/link";
import { LEAGUE_ID } from "@/lib/config";
import type { Matchup } from "@/lib/standings";
import type { ScoreboardProjection } from "@/lib/live-matchup";
import TeamName from "./TeamName";

/**
 * One head-to-head game: both teams, both scores, and how far along it is.
 *
 * The score is only shown once there is something to show — before kickoff both
 * sides read 0.00 in Ottoneu's own export, and printing "0.00 – 0.00" makes a
 * scheduled game look like a blowout that has already started.
 */

const STATUS_STYLES: Record<string, string> = {
  final: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  in_progress: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  scheduled: "bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400",
};

const TYPE_LABELS: Record<string, string> = {
  championship: "Championship",
  third_place: "Third place",
  playoff: "Playoff",
  consolation: "Consolation",
};

function TeamRow({
  name,
  score,
  showScore,
  won,
  projected,
}: {
  name: string;
  score: number | null;
  showScore: boolean;
  won: boolean;
  projected: number | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`truncate text-sm ${won ? "font-semibold" : ""}`}>
        <TeamName name={name} mine={won} />
      </span>
      <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
        {projected != null && (
          <span className="text-xs text-ink-subtle" title="Live projection">
            {projected.toFixed(1)}
          </span>
        )}
        <span
          className={`w-14 text-right text-sm ${
            won
              ? "font-semibold text-ink"
              : "text-ink-subtle"
          }`}
        >
          {showScore ? (score ?? 0).toFixed(2) : "—"}
        </span>
      </span>
    </div>
  );
}

export default function ScoreboardCard({
  matchup,
  projection = null,
}: {
  matchup: Matchup;
  projection?: ScoreboardProjection | null;
}) {
  const played = matchup.status !== "scheduled";
  const home = matchup.home_score ?? 0;
  const away = matchup.away_score ?? 0;
  // A lead in a live game is not a win, so only a final game bolds a winner.
  const decided = matchup.status === "final";
  const typeLabel = TYPE_LABELS[matchup.game_type];
  // Once a game is final the projection has converged on the score; showing
  // both would just print every number twice.
  const showProjection = projection != null && !decided;

  return (
    // Not a single wrapping link any more: each team name leads to its own
    // page, so the game link moved onto the status badge.
    <div className="rounded-lg border border-line bg-raised p-3 transition-colors hover:border-accent">
      <div className="mb-2 flex items-center justify-between gap-2">
        <a
          href={`https://ottoneu.fangraphs.com/football/${LEAGUE_ID}/game/${matchup.game_id}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open this game on Ottoneu"
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium hover:underline ${
            STATUS_STYLES[matchup.status] ?? STATUS_STYLES.scheduled
          }`}
        >
          {matchup.status === "in_progress" && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
          )}
          {matchup.status_label ?? (matchup.status === "final" ? "Final" : "Scheduled")}
        </a>
        {typeLabel && (
          <span className="text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
            {typeLabel}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {showProjection && (
          <div className="flex justify-end gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
            <span>Proj</span>
            <span className="w-14 text-right">Score</span>
          </div>
        )}
        <TeamRow
          name={matchup.home_team_name}
          score={matchup.home_score}
          showScore={played}
          won={decided && home > away}
          projected={showProjection ? projection.home : null}
        />
        <TeamRow
          name={matchup.away_team_name}
          score={matchup.away_score}
          showScore={played}
          won={decided && away > home}
          projected={showProjection ? projection.away : null}
        />
      </div>
      <Link
        href={`/scoreboard/${matchup.game_id}`}
        className="mt-2 inline-block text-xs text-accent hover:underline"
      >
        Lineups{projection != null ? " & live projection" : ""} →
      </Link>
    </div>
  );
}
