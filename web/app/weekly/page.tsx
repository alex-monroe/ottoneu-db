import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/auth";
import { fetchPlayerList } from "@/lib/data";
import { getDisplayWeeks } from "@/lib/nfl-week";
import {
  fetchAvailableWeeks,
  fetchWeeklyAsOf,
  fetchWeeklyBoard,
} from "@/lib/weekly-projections";
import PositionBadge from "@/components/PositionBadge";
import WeekFilters from "./WeekFilters";

/**
 * The full weekly board: every player with a per-game projection for one NFL
 * week, ranked by projected points.
 *
 * These are a third party's per-game forecasts, NOT this site's season-long
 * model. The page says so in its subtitle, and the column is labelled "Proj Pts"
 * rather than "Proj PPG" — the /projections page owns that number and this one
 * must never be mistaken for it.
 */

// Weekly projections are re-ingested daily during the season; an hour of cache
// is plenty and keeps the board from re-querying on every load.
export const revalidate = 3600;

interface Props {
  searchParams: Promise<{ week?: string; position?: string }>;
}

function Empty({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Weekly Projections
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-4">{message}</p>
      </div>
    </main>
  );
}

export default async function WeeklyProjectionsPage({ searchParams }: Props) {
  const user = await getAuthenticatedUser();
  if (!user?.hasProjectionsAccess) {
    return <Empty message="You need projections access to view weekly projections." />;
  }

  const params = await searchParams;
  const display = await getDisplayWeeks();
  if (display.season == null) {
    return <Empty message="No NFL season resolved yet." />;
  }

  const weeks = await fetchAvailableWeeks(display.season);
  if (weeks.length === 0) {
    return (
      <Empty
        message={`No weekly projections stored for ${display.season} yet. They are ingested during the NFL season by \`just weekly-projections\`.`}
      />
    );
  }

  const requested = Number(params.week);
  const week = weeks.includes(requested)
    ? requested
    : weeks.includes(display.upcoming ?? -1)
      ? display.upcoming!
      : weeks[0];
  const position = params.position ?? "";

  const [board, asOf, players] = await Promise.all([
    fetchWeeklyBoard(display.season, week),
    fetchWeeklyAsOf(display.season, week),
    fetchPlayerList(),
  ]);

  const rosterById = new Map(players.map((p) => [p.id, p]));
  const rows = board.filter((r) => !position || r.position === position);
  const isPlayed = rows.some((r) => r.actual_points != null);

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Weekly Projections
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-3xl">
            Projected points for a <strong>single game</strong> in Week {week}, from{" "}
            {board[0]?.source ?? "a third-party source"}, re-scored under this
            league&apos;s rules. Distinct from{" "}
            <Link href="/projections" className="text-blue-600 dark:text-blue-400 hover:underline">
              season-long projections
            </Link>
            , which come from this site&apos;s own model and are measured in points
            per game across a whole season.
          </p>
          {asOf && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              As of {new Date(asOf).toLocaleString()}
            </p>
          )}
        </div>

        <WeekFilters currentWeek={week} weeks={weeks} currentPosition={position} />

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800">
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">#</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Player</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Pos</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Team</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Opp</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">Proj Pts</th>
                {isPlayed && (
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">Actual</th>
                )}
                <th className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">Salary</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Owner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const roster = rosterById.get(r.player_id);
                const isFA = !roster?.team_name || roster.team_name === "FA";
                return (
                  <tr
                    key={`${r.player_id}-${r.week}`}
                    className={`border-t border-slate-100 dark:border-slate-800 ${i % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50 dark:bg-slate-900"}`}
                  >
                    <td className="px-3 py-2 font-mono text-slate-400 dark:text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                      {roster ? (
                        <Link href={`/players/${roster.ottoneu_id}`} className="hover:underline">
                          {r.name}
                        </Link>
                      ) : (
                        r.name
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.position && <PositionBadge position={r.position} />}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{r.nfl_team}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{r.opponent ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                      {r.projected_points?.toFixed(1) ?? "—"}
                    </td>
                    {isPlayed && (
                      <td className="px-3 py-2 text-right font-mono text-slate-800 dark:text-slate-200">
                        {r.actual_points?.toFixed(1) ?? "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {isFA ? "—" : `$${roster?.price ?? 0}`}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {isFA ? "FA" : roster?.team_name}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          A player missing from this board has no projection for the week — a bye
          or an inactive designation.
        </p>
      </div>
    </main>
  );
}
