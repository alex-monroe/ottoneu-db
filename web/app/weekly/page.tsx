import Link from "next/link";
import { requireProjectionsAccess } from "@/lib/auth";
import { fetchPlayerList } from "@/lib/data";
import { getDisplayWeeks } from "@/lib/nfl-week";
import {
  fetchAvailableWeeks,
  fetchWeeklyAsOf,
  fetchWeeklyBoard,
} from "@/lib/weekly-projections";
import PositionBadge from "@/components/PositionBadge";
import WeekFilters from "./WeekFilters";
import PageShell from "@/components/PageShell";
import DataFreshness from "@/components/DataFreshness";

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
    <PageShell width="wide" gap="none">
        <h1 className="text-3xl font-bold tracking-tight text-ink">
          Weekly Projections
        </h1>
        <p className="text-ink-subtle mt-4">{message}</p>
    </PageShell>
  );
}

export default async function WeeklyProjectionsPage({ searchParams }: Props) {
  // Gated in one place now (lib/access.ts + middleware); this guard keeps the
  // page failing closed if the route is ever dropped from that list.
  await requireProjectionsAccess("/weekly");

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
    <PageShell width="wide">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Weekly Projections
          </h1>
          <DataFreshness source="weekly" className="mt-1" />
          <p className="mt-2 max-w-prose text-ink-muted">
            Projected points for a <strong>single game</strong> in Week {week}, from{" "}
            {board[0]?.source ?? "a third-party source"}, re-scored under this
            league&apos;s rules. Distinct from{" "}
            <Link href="/projections" className="text-accent hover:underline">
              season-long projections
            </Link>
            , which come from this site&apos;s own model and are measured in points
            per game across a whole season.
          </p>
          {asOf && (
            <p className="text-xs text-ink-subtle mt-1">
              As of {new Date(asOf).toLocaleString()}
            </p>
          )}
        </div>

        <WeekFilters currentWeek={week} weeks={weeks} currentPosition={position} />

        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-sunken">
                <th className="px-3 py-2.5 text-left font-semibold text-ink-muted">#</th>
                <th className="px-3 py-2.5 text-left font-semibold text-ink-muted">Player</th>
                <th className="px-3 py-2.5 text-left font-semibold text-ink-muted">Pos</th>
                <th className="px-3 py-2.5 text-left font-semibold text-ink-muted">Team</th>
                <th className="px-3 py-2.5 text-left font-semibold text-ink-muted">Opp</th>
                <th className="px-3 py-2.5 text-right font-semibold text-ink-muted">Proj Pts</th>
                {isPlayed && (
                  <th className="px-3 py-2.5 text-right font-semibold text-ink-muted">Actual</th>
                )}
                <th className="px-3 py-2.5 text-right font-semibold text-ink-muted">Salary</th>
                <th className="px-3 py-2.5 text-left font-semibold text-ink-muted">Owner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const roster = rosterById.get(r.player_id);
                const isFA = !roster?.team_name || roster.team_name === "FA";
                return (
                  <tr
                    key={`${r.player_id}-${r.week}`}
                    className={`border-t border-line ${i % 2 === 0 ? "bg-raised" : "bg-sunken"}`}
                  >
                    <td className="px-3 py-2 font-mono text-ink-subtle">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-ink">
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
                    <td className="px-3 py-2 text-ink-muted">{r.nfl_team}</td>
                    <td className="px-3 py-2 text-ink-muted">{r.opponent ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                      {r.projected_points?.toFixed(1) ?? "—"}
                    </td>
                    {isPlayed && (
                      <td className="px-3 py-2 text-right font-mono text-ink-muted">
                        {r.actual_points?.toFixed(1) ?? "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-mono text-positive">
                      {isFA ? "—" : `$${roster?.price ?? 0}`}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {isFA ? "FA" : roster?.team_name}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-ink-subtle">
          A player missing from this board has no projection for the week — a bye
          or an inactive designation.
        </p>
    </PageShell>
  );
}
