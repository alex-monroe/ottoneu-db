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
  { key: "surplus", label: "Surplus", format: "currency" },
  { key: "mean_arb", label: "Expected Arb", format: "currency" },
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
        const teamPlayers = results.filter((p) => p.team_name === team);

        const vulnerable = teamPlayers
          .filter((p) => p.surplus > 5 && p.mean_arb < 15)
          .sort((a, b) => b.surplus - a.surplus);

        const protectedPlayers = teamPlayers
          .filter((p) => p.mean_arb > 15)
          .sort((a, b) => b.mean_arb - a.mean_arb);

        const suggestedAllocation = Math.min(
          ARB_MAX_PER_TEAM,
          ARB_MIN_PER_TEAM + Math.min(vulnerable.length * 2, ARB_MAX_PER_TEAM - ARB_MIN_PER_TEAM)
        );

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
                    {vulnerable.length} vulnerable target{vulnerable.length !== 1 ? "s" : ""} •{" "}
                    {protectedPlayers.length} protected player{protectedPlayers.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Suggested allocation
                  </p>
                  <p className="font-bold text-slate-900 dark:text-white text-lg">
                    ${suggestedAllocation}
                  </p>
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="p-5 bg-white dark:bg-black space-y-6">
                {vulnerable.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                      Vulnerable Targets ({vulnerable.length})
                    </h4>
                    <DataTable
                      columns={TEAM_PLAYER_COLUMNS}
                      data={vulnerable.slice(0, 5)}
                    />
                  </div>
                )}

                {protectedPlayers.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                      Protected Players ({protectedPlayers.length}) — Avoid
                    </h4>
                    <DataTable
                      columns={TEAM_PLAYER_COLUMNS}
                      data={protectedPlayers.slice(0, 3)}
                    />
                  </div>
                )}

                {vulnerable.length === 0 && protectedPlayers.length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No notable targets or protected players.
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
