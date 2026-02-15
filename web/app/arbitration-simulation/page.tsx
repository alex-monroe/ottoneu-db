import { fetchAndMergeData, SEASON } from "@/lib/analysis";
import SimulationControls from "./SimulationControls";

export const revalidate = 3600;

export default async function ArbitrationSimulationPage() {
  const allPlayers = await fetchAndMergeData();

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Arbitration Simulation ({SEASON})
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Monte Carlo simulation of how all 12 teams will allocate their arbitration budgets.
            Adjust parameters below to explore different scenarios.
          </p>
        </header>

        <SimulationControls initialPlayers={allPlayers} />
      </div>
    </main>
  );
}
