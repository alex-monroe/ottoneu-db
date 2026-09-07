import { LEAGUE_ID } from "@/lib/config";
import type { Matchup } from "@/lib/standings";
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
}: {
  name: string;
  score: number | null;
  showScore: boolean;
  won: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`truncate text-sm ${won ? "font-semibold" : ""}`}>
        <TeamName name={name} mine={won} />
      </span>
      <span
        className={`shrink-0 tabular-nums text-sm ${
          won
            ? "font-semibold text-slate-900 dark:text-white"
            : "text-slate-500 dark:text-slate-400"
        }`}
      >
        {showScore ? (score ?? 0).toFixed(2) : "—"}
      </span>
    </div>
  );
}

export default function ScoreboardCard({ matchup }: { matchup: Matchup }) {
  const played = matchup.status !== "scheduled";
  const home = matchup.home_score ?? 0;
  const away = matchup.away_score ?? 0;
  // A lead in a live game is not a win, so only a final game bolds a winner.
  const decided = matchup.status === "final";
  const typeLabel = TYPE_LABELS[matchup.game_type];

  return (
    // Not a single wrapping link any more: each team name leads to its own
    // page, so the game link moved onto the status badge.
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 transition-colors hover:border-blue-300 dark:hover:border-blue-800">
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
        <TeamRow
          name={matchup.home_team_name}
          score={matchup.home_score}
          showScore={played}
          won={decided && home > away}
        />
        <TeamRow
          name={matchup.away_team_name}
          score={matchup.away_score}
          showScore={played}
          won={decided && away > home}
        />
      </div>
    </div>
  );
}
