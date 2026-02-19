import { fetchBacktestData } from "@/lib/analysis";
import { calculateMetricsByPosition } from "./metrics";
import { POSITIONS } from "@/lib/types";
import ProjectionAccuracyClient from "./ProjectionAccuracyClient";

export const revalidate = 3600;

const AVAILABLE_SEASONS = [2024, 2025];

interface Props {
  searchParams: Promise<{ season?: string }>;
}

export default async function ProjectionAccuracyPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawSeason = Number(params.season);
  const targetSeason = AVAILABLE_SEASONS.includes(rawSeason)
    ? rawSeason
    : 2025;

  const players = await fetchBacktestData(targetSeason);
  const allMetrics = calculateMetricsByPosition(players, POSITIONS);

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Projection Accuracy — {targetSeason}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Backtesting the WeightedAveragePPG model: projections built from
            prior seasons compared to actual {targetSeason} results.
          </p>
        </header>

        {/* Methodology */}
        <section className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800 space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Methodology
          </h2>
          <p>
            For each target season, prior seasons are used as inputs to the{" "}
            <strong>WeightedAveragePPG</strong> model (recency weights 0.50 /
            0.30 / 0.20, games-scaled). The resulting projection is compared to
            the player&apos;s actual PPG in the target season.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Error</strong> = Actual PPG − Projected PPG (positive =
              outperformed)
            </li>
            <li>
              <strong>MAE</strong> — mean absolute error (lower is better)
            </li>
            <li>
              <strong>Bias</strong> — mean signed error (positive = model
              under-projects)
            </li>
            <li>
              <strong>R²</strong> — proportion of variance explained (higher is
              better, capped at 0)
            </li>
            <li>
              <strong>RMSE</strong> — root mean squared error (penalises large
              misses)
            </li>
          </ul>
        </section>

        {players.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">
            No backtest data available for {targetSeason}. Historical data prior
            to this season may not be loaded yet.
          </p>
        ) : (
          <ProjectionAccuracyClient
            players={players}
            allMetrics={allMetrics}
            targetSeason={targetSeason}
            availableSeasons={AVAILABLE_SEASONS}
          />
        )}
      </div>
    </main>
  );
}
