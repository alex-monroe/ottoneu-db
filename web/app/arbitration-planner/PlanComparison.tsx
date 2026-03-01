"use client";

import { useMemo } from "react";
import SummaryCard from "@/components/SummaryCard";
import {
  ARB_BUDGET_PER_TEAM,
  ARB_MIN_PER_TEAM,
  ARB_MAX_PER_TEAM,
} from "@/lib/config";
import type { ArbitrationPlan, PlannerPlayer, PlannerTeam } from "@/lib/types";

interface Props {
  plans: ArbitrationPlan[];
  teams: PlannerTeam[];
  comparePlanIds: string[];
  onComparePlanIdsChange: (ids: string[]) => void;
}

export default function PlanComparison({
  plans,
  teams,
  comparePlanIds,
  onComparePlanIdsChange,
}: Props) {
  const selectedPlans = plans.filter((p) => comparePlanIds.includes(p.id));

  // Build player lookup from all teams
  const playerLookup = useMemo(() => {
    const map = new Map<string, PlannerPlayer>();
    for (const team of teams) {
      for (const p of team.players) {
        map.set(p.player_id, p);
      }
    }
    return map;
  }, [teams]);

  // Gather all player_ids that appear in any selected plan
  const allAllocatedPlayers = useMemo(() => {
    const playerIds = new Set<string>();
    for (const plan of selectedPlans) {
      for (const pid of Object.keys(plan.allocations)) {
        playerIds.add(pid);
      }
    }
    return playerIds;
  }, [selectedPlans]);

  // Group allocated players by team
  const teamGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const pid of allAllocatedPlayers) {
      const player = playerLookup.get(pid);
      if (!player) continue;
      const team = player.team_name;
      if (!groups.has(team)) groups.set(team, []);
      groups.get(team)!.push(pid);
    }
    // Sort teams alphabetically, sort players within each team by name
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([team, pids]) => ({
        team,
        playerIds: pids.sort((a, b) => {
          const pa = playerLookup.get(a);
          const pb = playerLookup.get(b);
          return (pa?.name ?? "").localeCompare(pb?.name ?? "");
        }),
      }));
  }, [allAllocatedPlayers, playerLookup]);

  // Per-plan team totals
  const planTeamTotals = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    for (const plan of selectedPlans) {
      const teamTotals = new Map<string, number>();
      for (const [pid, amount] of Object.entries(plan.allocations)) {
        const player = playerLookup.get(pid);
        if (!player) continue;
        teamTotals.set(
          player.team_name,
          (teamTotals.get(player.team_name) ?? 0) + amount
        );
      }
      result.set(plan.id, teamTotals);
    }
    return result;
  }, [selectedPlans, playerLookup]);

  const togglePlan = (planId: string) => {
    if (comparePlanIds.includes(planId)) {
      onComparePlanIdsChange(comparePlanIds.filter((id) => id !== planId));
    } else {
      onComparePlanIdsChange([...comparePlanIds, planId]);
    }
  };

  if (plans.length < 2) {
    return (
      <div className="text-center py-12 text-slate-500 dark:text-slate-400">
        Create at least 2 plans to compare them.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan selector */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
          Select Plans to Compare
        </h2>
        <div className="flex flex-wrap gap-3">
          {plans.map((plan) => (
            <label
              key={plan.id}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                comparePlanIds.includes(plan.id)
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900"
              }`}
            >
              <input
                type="checkbox"
                checked={comparePlanIds.includes(plan.id)}
                onChange={() => togglePlan(plan.id)}
                className="rounded"
              />
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {plan.name}
              </span>
            </label>
          ))}
        </div>
      </div>

      {selectedPlans.length < 2 ? (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          Select at least 2 plans to see the comparison.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {selectedPlans.map((plan) => {
              const total = Object.values(plan.allocations).reduce(
                (sum, v) => sum + v,
                0
              );
              const playerCount = Object.keys(plan.allocations).length;
              return (
                <SummaryCard
                  key={plan.id}
                  label={plan.name}
                  value={`$${total} / ${playerCount} players`}
                  variant={
                    total === ARB_BUDGET_PER_TEAM
                      ? "positive"
                      : total > ARB_BUDGET_PER_TEAM
                        ? "negative"
                        : "default"
                  }
                />
              );
            })}
          </div>

          {/* Per-team totals comparison */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
              Per-Team Allocation
            </h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800">
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      Team
                    </th>
                    {selectedPlans.map((plan) => (
                      <th
                        key={plan.id}
                        className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300"
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team, i) => (
                    <tr
                      key={team.team_name}
                      className={`border-t border-slate-100 dark:border-slate-800 ${
                        i % 2 === 0
                          ? "bg-white dark:bg-slate-950"
                          : "bg-slate-50 dark:bg-slate-900"
                      }`}
                    >
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-200 font-medium whitespace-nowrap">
                        {team.team_name}
                      </td>
                      {selectedPlans.map((plan) => {
                        const total =
                          planTeamTotals.get(plan.id)?.get(team.team_name) ?? 0;
                        const isValid =
                          total === 0 ||
                          (total >= ARB_MIN_PER_TEAM &&
                            total <= ARB_MAX_PER_TEAM);
                        return (
                          <td
                            key={plan.id}
                            className={`px-3 py-2 whitespace-nowrap ${
                              !isValid && total > 0
                                ? "text-red-700 dark:text-red-400 font-bold"
                                : total > 0
                                  ? "text-slate-800 dark:text-slate-200"
                                  : "text-slate-400 dark:text-slate-600"
                            }`}
                          >
                            ${total}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 font-bold">
                    <td className="px-3 py-2 text-slate-900 dark:text-white">
                      Total
                    </td>
                    {selectedPlans.map((plan) => {
                      const total = Object.values(plan.allocations).reduce(
                        (sum, v) => sum + v,
                        0
                      );
                      return (
                        <td
                          key={plan.id}
                          className={`px-3 py-2 ${
                            total === ARB_BUDGET_PER_TEAM
                              ? "text-green-700 dark:text-green-400"
                              : total > ARB_BUDGET_PER_TEAM
                                ? "text-red-700 dark:text-red-400"
                                : "text-slate-900 dark:text-white"
                          }`}
                        >
                          ${total}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Detailed player comparison */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
              Player-by-Player Comparison
            </h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800">
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      Player
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      Pos
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      Salary
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                      Surplus
                    </th>
                    {selectedPlans.map((plan) => (
                      <th
                        key={plan.id}
                        className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300"
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teamGroups.map((group) => (
                    <>
                      {/* Team header row */}
                      <tr
                        key={`header-${group.team}`}
                        className="bg-slate-200 dark:bg-slate-700"
                      >
                        <td
                          colSpan={4 + selectedPlans.length}
                          className="px-3 py-2 font-semibold text-slate-900 dark:text-white"
                        >
                          {group.team}
                        </td>
                      </tr>
                      {group.playerIds.map((pid, i) => {
                        const player = playerLookup.get(pid);
                        if (!player) return null;
                        const allSame =
                          selectedPlans.every(
                            (p) =>
                              (p.allocations[pid] ?? 0) ===
                              (selectedPlans[0].allocations[pid] ?? 0)
                          );
                        return (
                          <tr
                            key={pid}
                            className={`border-t border-slate-100 dark:border-slate-800 ${
                              !allSame
                                ? "bg-yellow-50 dark:bg-yellow-950/20"
                                : i % 2 === 0
                                  ? "bg-white dark:bg-slate-950"
                                  : "bg-slate-50 dark:bg-slate-900"
                            }`}
                          >
                            <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap font-medium">
                              {player.name}
                            </td>
                            <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {player.position}
                            </td>
                            <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              ${player.price}
                            </td>
                            <td
                              className={`px-3 py-2 whitespace-nowrap ${
                                player.surplus >= 0
                                  ? "text-green-700 dark:text-green-400"
                                  : "text-red-700 dark:text-red-400"
                              }`}
                            >
                              ${player.surplus}
                            </td>
                            {selectedPlans.map((plan) => {
                              const amount = plan.allocations[pid] ?? 0;
                              return (
                                <td
                                  key={plan.id}
                                  className={`px-3 py-2 whitespace-nowrap font-medium ${
                                    amount > 0
                                      ? "text-blue-700 dark:text-blue-300"
                                      : "text-slate-400 dark:text-slate-600"
                                  }`}
                                >
                                  {amount > 0 ? `$${amount}` : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
