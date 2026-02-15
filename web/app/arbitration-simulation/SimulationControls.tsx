"use client";

import { useState, useEffect } from "react";
import {
  runArbitrationSimulation,
  MY_TEAM,
  SEASON,
  NUM_SIMULATIONS,
  VALUE_VARIATION,
  Player,
  SimulationResult,
} from "@/lib/analysis";
import DataTable, { Column, HighlightRule } from "@/components/DataTable";
import SimulationTeams from "./SimulationTeams";

interface SimulationControlsProps {
  initialPlayers: Player[];
}

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

const CUT_CANDIDATE_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "NFL" },
  { key: "team_name", label: "Owner" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "surplus", label: "Surplus", format: "currency" },
  { key: "mean_arb", label: "Expected Arb", format: "currency" },
  { key: "salary_after_arb", label: "After Arb", format: "currency" },
  { key: "surplus_after_arb", label: "Surplus (Post)", format: "currency" },
];

const VULNERABLE_RULES: HighlightRule[] = [
  { key: "surplus_after_arb", op: "gt", value: 15, className: "bg-green-50 dark:bg-green-950/30" },
];

const CUT_CANDIDATE_RULES: HighlightRule[] = [
  { key: "surplus_after_arb", op: "lt", value: -10, className: "bg-red-50 dark:bg-red-950/30" },
];

export default function SimulationControls({ initialPlayers }: SimulationControlsProps) {
  const [numSimulations, setNumSimulations] = useState(NUM_SIMULATIONS);
  const [valueVariation, setValueVariation] = useState(VALUE_VARIATION);
  const [simResults, setSimResults] = useState<SimulationResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Run simulation when parameters change
  useEffect(() => {
    setIsRunning(true);
    const results = runArbitrationSimulation(initialPlayers, numSimulations, valueVariation);
    setSimResults(results);
    setIsRunning(false);
  }, [initialPlayers, numSimulations, valueVariation]);

  const myRoster = simResults
    .filter((p) => p.team_name === MY_TEAM)
    .sort((a, b) => b.mean_arb - a.mean_arb);

  const opponents = simResults.filter(
    (p) => p.team_name !== MY_TEAM && p.team_name !== "FA" && p.team_name !== ""
  );

  const vulnerable = opponents
    .filter((p) => p.surplus > 5 && p.mean_arb < 10)
    .sort((a, b) => b.surplus - a.surplus);

  const allRosteredPlayers = simResults.filter(
    (p) => p.team_name !== "FA" && p.team_name !== ""
  );

  const cutCandidates = allRosteredPlayers
    .filter((p) => p.surplus_after_arb < 0)
    .sort((a, b) => a.surplus_after_arb - b.surplus_after_arb);

  const totalExpectedArb = myRoster.reduce((sum, p) => sum + p.mean_arb, 0);

  return (
    <div className="space-y-8">
      {/* Controls */}
      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Simulation Parameters
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Number of Simulations */}
          <div>
            <label htmlFor="numSims" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Number of Simulation Runs
            </label>
            <input
              id="numSims"
              type="number"
              min="10"
              max="1000"
              step="10"
              value={numSimulations}
              onChange={(e) => setNumSimulations(Math.max(10, Math.min(1000, parseInt(e.target.value) || 10)))}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Range: 10-1000 runs (more runs = more accurate, but slower)
            </p>
          </div>

          {/* Value Variation */}
          <div>
            <label htmlFor="valueVar" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Valuation Variance (±%)
            </label>
            <div className="flex items-center gap-3">
              <input
                id="valueVar"
                type="range"
                min="0"
                max="90"
                step="5"
                value={valueVariation * 100}
                onChange={(e) => setValueVariation(parseInt(e.target.value) / 100)}
                className="flex-1"
              />
              <span className="text-sm font-medium text-slate-900 dark:text-white w-16 text-right">
                ±{(valueVariation * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              How much teams&apos; valuations differ (0% = all agree, 90% = extreme variation)
            </p>
          </div>
        </div>
      </div>

      {/* Simulation Info */}
      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          How It Works
        </h2>
        <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2">
          <p>
            <strong>Important:</strong> In Ottoneu, teams can ONLY arbitrate opponents&apos; players, not their own.
          </p>
          <p>
            Each team independently allocates their $60 budget to opponent players, targeting high-surplus
            players to maximize disruption.
          </p>
          <p className="mt-3">
            Teams have different value estimates (±{(valueVariation * 100).toFixed(0)}% variation) representing
            different evaluation philosophies.
          </p>
          <p>
            Results show the expected arbitration raises your players will receive from opponent targeting
            across {numSimulations} simulation runs.
          </p>
        </div>
      </div>

      {isRunning && (
        <div className="text-center py-8">
          <p className="text-slate-600 dark:text-slate-400">Running simulation...</p>
        </div>
      )}

      {!isRunning && simResults.length > 0 && (
        <>
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

          {/* Cut Candidates */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Cut Candidates — Negative Surplus After Arbitration
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Players who will have negative surplus value after receiving expected arbitration.
              These players are likely to be cut, creating FA opportunities.
            </p>
            {cutCandidates.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">
                No cut candidates identified (all players have positive surplus after arb).
              </p>
            ) : (
              <DataTable
                columns={CUT_CANDIDATE_COLUMNS}
                data={cutCandidates.slice(0, 20)}
                highlightRules={CUT_CANDIDATE_RULES}
              />
            )}
          </section>

          {/* Per-Team Breakdown */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Full Roster Breakdown by Team
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Complete roster for each team showing expected arbitration raises.
            </p>
            <SimulationTeams results={simResults} />
          </section>
        </>
      )}
    </div>
  );
}
