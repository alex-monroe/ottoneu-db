import {
  fetchAndMergeData,
  runArbitrationSimulation,
  MY_TEAM,
  SEASON,
  NUM_SIMULATIONS,
  VALUE_VARIATION,
} from "@/lib/analysis";
import DataTable, { Column, HighlightRule } from "@/components/DataTable";
import SimulationTeams from "./SimulationTeams";

export const revalidate = 3600;

const MY_ROSTER_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "surplus", label: "Surplus", format: "currency" },
  { key: "mean_arb", label: "Expected Arb", format: "currency" },
  { key: "std_arb", label: "Std Dev", format: "currency" },
  { key: "salary_after_arb", label: "After Arb", format: "currency" },
  { key: "surplus_after_arb", label: "Surplus (Post)", format: "currency" },
];

const VULNERABLE_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "NFL" },
  { key: "team_name", label: "Owner" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "surplus", label: "Surplus", format: "currency" },
  { key: "mean_arb", label: "Expected Arb", format: "currency" },
  { key: "std_arb", label: "Std Dev", format: "currency" },
  { key: "surplus_after_arb", label: "Surplus (Post)", format: "currency" },
];

const PROTECTED_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "NFL" },
  { key: "team_name", label: "Owner" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "surplus", label: "Surplus", format: "currency" },
  { key: "mean_arb", label: "Expected Arb", format: "currency" },
  { key: "pct_protected", label: "Protected %", format: "percent" },
  { key: "salary_after_arb", label: "After Arb", format: "currency" },
];

const VULNERABLE_RULES: HighlightRule[] = [
  { key: "surplus_after_arb", op: "gt", value: 15, className: "bg-green-50 dark:bg-green-950/30" },
];

const PROTECTED_RULES: HighlightRule[] = [
  { key: "pct_protected", op: "gte", value: 0.5, className: "bg-red-50 dark:bg-red-950/30" },
];

export default async function ArbitrationSimulationPage() {
  const allPlayers = await fetchAndMergeData();
  const simResults = runArbitrationSimulation(allPlayers);

  if (simResults.length === 0) {
    return (
      <main className="min-h-screen bg-white dark:bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            No simulation results available.
          </h1>
        </div>
      </main>
    );
  }

  const myRoster = simResults
    .filter((p) => p.team_name === MY_TEAM)
    .sort((a, b) => b.mean_arb - a.mean_arb);

  const opponents = simResults.filter(
    (p) => p.team_name !== MY_TEAM && p.team_name !== "FA" && p.team_name !== ""
  );

  const vulnerable = opponents
    .filter((p) => p.surplus > 5 && p.mean_arb < 10)
    .sort((a, b) => b.surplus - a.surplus);

  const protectedPlayers = opponents
    .filter((p) => p.mean_arb > 20)
    .sort((a, b) => b.mean_arb - a.mean_arb);

  const totalExpectedArb = myRoster.reduce((sum, p) => sum + p.mean_arb, 0);

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Arbitration Simulation ({SEASON})
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Monte Carlo simulation of how all 12 teams will allocate their arbitration budgets.
            Based on {NUM_SIMULATIONS} runs with ±{VALUE_VARIATION * 100}% value variation per team.
          </p>
        </header>

        {/* Simulation Info */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            How It Works
          </h2>
          <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2">
            <p>
              Each team independently allocates their arbitration budget based on:
            </p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li><strong>Defensive spending (60%):</strong> Protect own high-value players</li>
              <li><strong>Offensive spending (40%):</strong> Attack opponents&apos; vulnerable assets</li>
            </ul>
            <p className="mt-3">
              Teams have different value estimates (±{VALUE_VARIATION * 100}% variation) representing
              different evaluation philosophies.
            </p>
          </div>
        </div>

        {/* My Roster */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            {MY_TEAM} — Expected Arbitration Raises
          </h2>
          {myRoster.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">No players found.</p>
          ) : (
            <>
              <DataTable
                columns={MY_ROSTER_COLUMNS}
                data={myRoster.slice(0, 15)}
              />
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-3">
                <strong>Total Expected Arbitration:</strong> ${totalExpectedArb.toFixed(0)}
              </p>
            </>
          )}
        </section>

        {/* Vulnerable Targets */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            Vulnerable Opponent Targets — Low Protection
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            High-value players receiving low arbitration protection. These are prime targets
            to maximize disruption.
          </p>
          {vulnerable.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">No vulnerable targets identified.</p>
          ) : (
            <DataTable
              columns={VULNERABLE_COLUMNS}
              data={vulnerable.slice(0, 20)}
              highlightRules={VULNERABLE_RULES}
            />
          )}
        </section>

        {/* Protected Players */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            Heavily Protected Players — Avoid
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            These players are likely to receive heavy arbitration raises. Avoid targeting
            unless strategic.
          </p>
          {protectedPlayers.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">No heavily protected players identified.</p>
          ) : (
            <DataTable
              columns={PROTECTED_COLUMNS}
              data={protectedPlayers.slice(0, 15)}
              highlightRules={PROTECTED_RULES}
            />
          )}
        </section>

        {/* Per-Team Breakdown */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            Strategic Recommendations by Opponent
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Detailed breakdown of vulnerable and protected players for each opponent team.
          </p>
          <SimulationTeams results={simResults} />
        </section>
      </div>
    </main>
  );
}
