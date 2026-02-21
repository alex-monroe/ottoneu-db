import {
  fetchAndMergeData,
  fetchAndMergeProjectedData,
  SEASON,
  LEAGUE_ID,
  DEFAULT_PROJECTION_YEAR,
} from "@/lib/analysis";
import { supabase } from "@/lib/supabase";
import SimulationControls from "./SimulationControls";
import ModeToggle, { ValueMode } from "@/components/ModeToggle";

interface Props {
  searchParams: Promise<{ mode?: string }>;
}

export default async function ArbitrationSimulationPage({ searchParams }: Props) {
  const params = await searchParams;
  const mode: ValueMode =
    params.mode === "adjusted"
      ? "adjusted"
      : params.mode === "projected"
        ? "projected"
        : "raw";
  const isAdjusted = mode === "adjusted";
  const isProjected = mode === "projected";

  const [rawPlayers, adjRes] = await Promise.all([
    isProjected
      ? fetchAndMergeProjectedData(DEFAULT_PROJECTION_YEAR)
      : fetchAndMergeData(),
    supabase
      .from("surplus_adjustments")
      .select("player_id, adjustment")
      .eq("league_id", LEAGUE_ID)
      .neq("adjustment", 0),
  ]);

  const hasAdjustments = (adjRes.data?.length ?? 0) > 0;

  let initialAdjustments: Record<string, number> | undefined;
  if (isAdjusted && adjRes.data && adjRes.data.length > 0) {
    initialAdjustments = Object.fromEntries(
      adjRes.data.map((r) => [String(r.player_id), Number(r.adjustment)])
    );
  }

  const label = isProjected ? DEFAULT_PROJECTION_YEAR : SEASON;

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Arbitration Simulation ({label})
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2">
                Monte Carlo simulation of how all 12 teams will allocate their arbitration budgets.
                {isProjected && (
                  <> Using <strong>projected PPG</strong> values.</>
                )}
                {!isProjected && (
                  <> Adjust parameters below to explore different scenarios.</>
                )}
              </p>
            </div>
            <ModeToggle
              currentMode={mode}
              basePath="/arbitration-simulation"
              hasAdjustments={hasAdjustments}
            />
          </div>
          {isAdjusted && hasAdjustments && (
            <div className="mt-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2 text-sm text-blue-800 dark:text-blue-300">
              Showing results with your manual surplus adjustments applied.
            </div>
          )}
        </header>

        <SimulationControls
          initialPlayers={rawPlayers}
          initialAdjustments={initialAdjustments}
        />
      </div>
    </main>
  );
}
