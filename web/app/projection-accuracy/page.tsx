import { fetchBacktestData, fetchAvailableModels, fetchModelBacktestData } from "@/lib/analysis";
import { calculateMetricsByPosition } from "./metrics";
import { POSITIONS, BacktestPlayer, ProjectionModel } from "@/lib/types";
import ActiveModelCard from "@/components/ActiveModelCard";
import ProjectionAccuracyClient from "./ProjectionAccuracyClient";

export const revalidate = 3600;

const AVAILABLE_SEASONS = [2024, 2025];

interface Props {
  searchParams: Promise<{ season?: string; model?: string; compare?: string }>;
}

export default async function ProjectionAccuracyPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawSeason = Number(params.season);
  const targetSeason = AVAILABLE_SEASONS.includes(rawSeason)
    ? rawSeason
    : 2025;

  const selectedModelId = params.model || null;
  const compareModelId = params.compare || null;

  // Fetch available models (may be empty if migration hasn't been applied)
  let models: Awaited<ReturnType<typeof fetchAvailableModels>> = [];
  try {
    models = await fetchAvailableModels();
  } catch {
    // Table doesn't exist yet — fall back to legacy mode
  }

  // Fetch primary and compare data in parallel when applicable
  let players: BacktestPlayer[];
  let comparePlayers: BacktestPlayer[] | null = null;
  let compareModel: ProjectionModel | null = null;

  if (selectedModelId && models.length > 0) {
    const comparePromise = compareModelId
      ? fetchModelBacktestData(targetSeason, compareModelId)
      : null;

    const [primaryData, compareData] = await Promise.all([
      fetchModelBacktestData(targetSeason, selectedModelId),
      comparePromise,
    ]);
    players = primaryData;
    comparePlayers = compareData;
    compareModel = compareModelId
      ? (models.find((m) => m.id === compareModelId) ?? null)
      : null;
  } else {
    players = await fetchBacktestData(targetSeason);
  }

  const allMetrics = calculateMetricsByPosition(players, POSITIONS);
  const compareMetrics = comparePlayers
    ? calculateMetricsByPosition(comparePlayers, POSITIONS)
    : null;

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Projection Accuracy — {targetSeason}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Backtest of the active projection model — projections built from
            prior seasons are compared against actual {targetSeason} results.
            Pick a different model below to compare alternatives.
          </p>
        </header>

        {/* Active model — driven by projection_models.is_active */}
        <ActiveModelCard
          footer={
            <ul className="list-disc list-inside space-y-1 pt-1">
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
                <strong>R²</strong> — proportion of variance explained (higher
                is better)
              </li>
              <li>
                <strong>RMSE</strong> — root mean squared error (penalises large
                misses)
              </li>
            </ul>
          }
        />

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
            models={models}
            selectedModelId={selectedModelId}
            compareModelId={compareModelId}
            comparePlayers={comparePlayers}
            compareMetrics={compareMetrics}
            compareModel={compareModel}
          />
        )}
      </div>
    </main>
  );
}
