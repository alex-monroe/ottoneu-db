"use client";

import { useState } from "react";
import { SimulationResult, MY_TEAM, ARB_MAX_PER_TEAM, ARB_MIN_PER_TEAM } from "@/lib/analysis";
import DataTable, { Column } from "@/components/DataTable";

interface SimulationTeamsProps {
  results: SimulationResult[];
}

const TEAM_PLAYER_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "surplus", label: "Surplus", format: "currency" },
  { key: "mean_arb", label: "Expected Arb", format: "currency" },
  { key: "salary_after_arb", label: "After Arb", format: "currency" },
  { key: "surplus_after_arb", label: "Surplus (Post)", format: "currency" },
];

export default function SimulationTeams({ results }: SimulationTeamsProps) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  // Get all opponent teams
  const opponentTeams = Array.from(
    new Set(
      results
        .filter((p) => p.team_name !== MY_TEAM && p.team_name !== "FA" && p.team_name)
        .map((p) => p.team_name!)
    )
  ).sort();

  return (
    <div className="space-y-4">
      {opponentTeams.map((team) => {
        const teamPlayers = results
          .filter((p) => p.team_name === team)
          .sort((a, b) => b.mean_arb - a.mean_arb);

        const totalArb = teamPlayers.reduce((sum, p) => sum + p.mean_arb, 0);
        const avgArb = teamPlayers.length > 0 ? totalArb / teamPlayers.length : 0;

        const isExpanded = expandedTeam === team;

        return (
          <div
            key={team}
            className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
          >
            <button
              onClick={() => setExpandedTeam(isExpanded ? null : team)}
              className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {team}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {teamPlayers.length} player{teamPlayers.length !== 1 ? "s" : ""} •{" "}
                    ${totalArb.toFixed(0)} total expected arb
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Avg per player
                  </p>
                  <p className="font-bold text-slate-900 dark:text-white text-lg">
                    ${avgArb.toFixed(1)}
                  </p>
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="p-5 bg-white dark:bg-black">
                {teamPlayers.length > 0 ? (
                  <>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                      Full Roster (sorted by expected arbitration)
                    </h4>
                    <DataTable
                      columns={TEAM_PLAYER_COLUMNS}
                      data={teamPlayers}
                    />
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
                      <strong>Total Expected Arb:</strong> ${totalArb.toFixed(0)} |{" "}
                      <strong>Avg per Player:</strong> ${avgArb.toFixed(1)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No players found.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
