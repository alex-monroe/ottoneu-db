import {
  fetchProjectionBoard,
  getHistoricalSeasonsForYear,
} from "@/lib/analysis";
import { getStatsSeason, getProjectionSeason } from "@/lib/season";
import { getAuthenticatedUser } from "@/lib/auth";
import ActiveModelCard from "@/components/ActiveModelCard";
import ProjectionsClient from "./ProjectionsClient";

export const revalidate = 3600;

interface Props {
  searchParams: Promise<{ year?: string }>;
}

export default async function ProjectionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const [statsSeason, projectionSeason, user] = await Promise.all([
    getStatsSeason(),
    getProjectionSeason(),
    getAuthenticatedUser(),
  ]);
  const isAdmin = !!user?.isAdmin;

  // Selectable projection years: the just-completed season (backtest view) and
  // the upcoming projection season (forward-looking). Deduped when they coincide
  // (during the in-season phase, statsSeason === projectionSeason).
  const projectionYears = Array.from(
    new Set([statsSeason, projectionSeason])
  ).sort((a, b) => a - b);

  const rawYear = Number(params.year);
  const projectionYear = projectionYears.includes(rawYear)
    ? rawYear
    : projectionSeason;

  const rows = await fetchProjectionBoard(projectionYear, statsSeason);
  const historicalSeasons = getHistoricalSeasonsForYear(projectionYear);
  const isForward = projectionYear > statsSeason;

  if (rows.length === 0) {
    return (
      <main className="min-h-screen bg-white dark:bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            No projection data available.
          </h1>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white dark:bg-black p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            Season-Long Projections
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {projectionYear} Player Projections
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-3xl">
            {isForward ? (
              <>
                Projected points per game for every player, including rookies.
                Ranked overall and by position — use it for arbitration, keeper,
                and auction decisions. The Δ column compares the projection to{" "}
                {statsSeason} actual PPG.
              </>
            ) : (
              <>
                <strong>Backtest view:</strong> what the model would have
                projected for {projectionYear} from {historicalSeasons.join(", ")}{" "}
                history, vs. actual {projectionYear} results. Green = beat the
                projection; red = missed it.
              </>
            )}
          </p>
        </header>

        <ProjectionsClient
          initialData={rows}
          projectionYear={projectionYear}
          statsSeason={statsSeason}
          projectionYears={projectionYears}
          isForward={isForward}
        />

        {/* Methodology — admin-only */}
        {isAdmin && (
          <ActiveModelCard
            footer={
              <>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Built from {historicalSeasons.join(", ")} history. Players with
                  no NFL track record use a separate rookie fallback —{" "}
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Rookie
                  </span>{" "}
                  (drafted, by draft capital) or{" "}
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                    College
                  </span>{" "}
                  (prospect, position-average rookie PPG).
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                  <strong>{statsSeason} PPG</strong> — actual {statsSeason} stats
                  &nbsp;·&nbsp; <strong>Proj {projectionYear}</strong> — model
                  output &nbsp;·&nbsp; <strong>Δ</strong> — Proj minus{" "}
                  {statsSeason} PPG
                </p>
              </>
            }
          />
        )}
      </div>
    </main>
  );
}
