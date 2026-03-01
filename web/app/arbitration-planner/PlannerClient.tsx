"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import SummaryCard from "@/components/SummaryCard";
import {
  ARB_BUDGET_PER_TEAM,
  ARB_MIN_PER_TEAM,
  ARB_MAX_PER_TEAM,
  ARB_MAX_PER_PLAYER_PER_TEAM,
  NUM_TEAMS,
} from "@/lib/config";
import type { ArbitrationPlan, PlannerPlayer, PlannerTeam } from "@/lib/types";
import PlanComparison from "./PlanComparison";

interface Props {
  teams: PlannerTeam[];
}

type Tab = "plan" | "compare";

export default function PlannerClient({ teams }: Props) {
  const [plans, setPlans] = useState<ArbitrationPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newPlanName, setNewPlanName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("plan");
  const [comparePlanIds, setComparePlanIds] = useState<string[]>([]);

  const numOpponents = NUM_TEAMS - 1;

  // Load saved plans on mount
  useEffect(() => {
    fetch("/api/arbitration-plans")
      .then((r) => r.json())
      .then((data: ArbitrationPlan[]) => {
        setPlans(data);
        if (data.length > 0) {
          setActivePlanId(data[0].id);
          setAllocations(data[0].allocations);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Build per-team allocation totals
  const teamTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const team of teams) {
      let teamTotal = 0;
      for (const p of team.players) {
        teamTotal += allocations[p.player_id] ?? 0;
      }
      totals.set(team.team_name, teamTotal);
    }
    return totals;
  }, [allocations, teams]);

  const totalSpent = useMemo(
    () => Object.values(allocations).reduce((sum, v) => sum + v, 0),
    [allocations]
  );
  const remaining = ARB_BUDGET_PER_TEAM - totalSpent;

  // Validation: check per-team constraints
  const teamErrors = useMemo(() => {
    const errors = new Map<string, string>();
    for (const [team, total] of teamTotals.entries()) {
      if (total > ARB_MAX_PER_TEAM)
        errors.set(team, `Over max ($${total}/$${ARB_MAX_PER_TEAM})`);
    }
    return errors;
  }, [teamTotals]);

  // Count teams below minimum (only when budget is fully allocated)
  const teamsUnderMin = useMemo(() => {
    if (totalSpent < ARB_BUDGET_PER_TEAM) return [];
    return teams
      .filter((t) => (teamTotals.get(t.team_name) ?? 0) < ARB_MIN_PER_TEAM)
      .map((t) => t.team_name);
  }, [teamTotals, totalSpent, teams]);

  const setPlayerAllocation = useCallback(
    (playerId: string, amount: number) => {
      setAllocations((prev) => {
        const next = { ...prev };
        if (amount === 0) delete next[playerId];
        else next[playerId] = amount;
        return next;
      });
    },
    []
  );

  const toggle = (team: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });
  };

  // Plan management
  const createPlan = async () => {
    if (!newPlanName.trim()) return;
    const res = await fetch("/api/arbitration-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPlanName.trim() }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to create plan");
      return;
    }
    const plan: ArbitrationPlan = await res.json();
    setPlans((prev) => [plan, ...prev]);
    setActivePlanId(plan.id);
    setAllocations({});
    setNewPlanName("");
  };

  const selectPlan = (planId: string) => {
    const plan = plans.find((p) => p.id === planId);
    if (plan) {
      setActivePlanId(planId);
      setAllocations({ ...plan.allocations });
    }
  };

  const savePlan = async () => {
    if (!activePlanId) return;
    setSaving(true);
    const res = await fetch(`/api/arbitration-plans/${activePlanId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocations }),
    });
    if (res.ok) {
      setPlans((prev) =>
        prev.map((p) =>
          p.id === activePlanId
            ? { ...p, allocations: { ...allocations }, updated_at: new Date().toISOString() }
            : p
        )
      );
    }
    setSaving(false);
  };

  const deletePlan = async (planId: string) => {
    if (!confirm("Delete this plan?")) return;
    const res = await fetch(`/api/arbitration-plans/${planId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      if (activePlanId === planId) {
        setActivePlanId(null);
        setAllocations({});
      }
      setComparePlanIds((prev) => prev.filter((id) => id !== planId));
    }
  };

  const activePlan = plans.find((p) => p.id === activePlanId);
  const hasUnsavedChanges =
    activePlan &&
    JSON.stringify(allocations) !== JSON.stringify(activePlan.allocations);

  if (loading) {
    return (
      <div className="text-slate-500 dark:text-slate-400 py-12 text-center">
        Loading plans...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Arbitration Planner
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          Allocate your ${ARB_BUDGET_PER_TEAM} arbitration budget across
          opponent rosters. ${ARB_MIN_PER_TEAM}-${ARB_MAX_PER_TEAM} per team,
          up to ${ARB_MAX_PER_PLAYER_PER_TEAM} per player.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setTab("plan")}
          className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
            tab === "plan"
              ? "bg-blue-600 text-white"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          Plan
        </button>
        <button
          onClick={() => setTab("compare")}
          className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
            tab === "compare"
              ? "bg-blue-600 text-white"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          Compare Plans
        </button>
      </div>

      {tab === "plan" && (
        <>
          {/* Plan selector */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Active Plan
              </label>
              <select
                value={activePlanId ?? ""}
                onChange={(e) => selectPlan(e.target.value)}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              >
                <option value="" disabled>
                  {plans.length === 0
                    ? "No plans yet — create one below"
                    : "Select a plan"}
                </option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  New Plan
                </label>
                <input
                  type="text"
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createPlan()}
                  placeholder="Plan name..."
                  className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <button
                onClick={createPlan}
                disabled={!newPlanName.trim()}
                className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>

            {activePlanId && (
              <div className="flex gap-2">
                <button
                  onClick={savePlan}
                  disabled={saving || !hasUnsavedChanges}
                  className="px-4 py-2 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => deletePlan(activePlanId)}
                  className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {hasUnsavedChanges && (
            <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300">
              You have unsaved changes.
            </div>
          )}

          {/* Budget summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SummaryCard
              label="Budget"
              value={`$${totalSpent} / $${ARB_BUDGET_PER_TEAM}`}
            />
            <SummaryCard
              label="Remaining"
              value={remaining}
              variant={remaining < 0 ? "negative" : remaining === 0 ? "positive" : "default"}
            />
            <SummaryCard
              label="Players Targeted"
              value={`${Object.keys(allocations).length}`}
            />
            <SummaryCard
              label="Teams with Allocations"
              value={`${[...teamTotals.values()].filter((v) => v > 0).length} / ${numOpponents}`}
            />
          </div>

          {/* Budget errors */}
          {remaining < 0 && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 text-sm text-red-800 dark:text-red-300">
              Over budget by ${Math.abs(remaining)}.
            </div>
          )}
          {teamErrors.size > 0 && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 text-sm text-red-800 dark:text-red-300">
              Team limit exceeded:{" "}
              {[...teamErrors.entries()]
                .map(([team, msg]) => `${team}: ${msg}`)
                .join(", ")}
            </div>
          )}
          {teamsUnderMin.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300">
              Teams below ${ARB_MIN_PER_TEAM} minimum:{" "}
              {teamsUnderMin.join(", ")}
            </div>
          )}

          {/* Team sections */}
          {!activePlanId ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              Create or select a plan to start allocating.
            </div>
          ) : (
            <div className="space-y-2">
              {teams.map((team) => {
                const teamTotal = teamTotals.get(team.team_name) ?? 0;
                const isOpen = expanded.has(team.team_name);
                const error = teamErrors.get(team.team_name);
                const isValid =
                  teamTotal === 0 ||
                  (teamTotal >= ARB_MIN_PER_TEAM &&
                    teamTotal <= ARB_MAX_PER_TEAM);

                return (
                  <div
                    key={team.team_name}
                    className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => toggle(team.team_name)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <span className="font-medium text-slate-900 dark:text-white">
                        {team.team_name}{" "}
                        <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                          ({team.players.length} players, ${team.total_salary}{" "}
                          cap)
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span
                          className={`text-sm font-medium ${
                            error
                              ? "text-red-600 dark:text-red-400"
                              : teamTotal > 0
                                ? "text-green-600 dark:text-green-400"
                                : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          ${teamTotal} / ${ARB_MAX_PER_TEAM}
                          {!isValid && teamTotal > 0 && " ⚠"}
                        </span>
                        <span className="text-slate-400">
                          {isOpen ? "▲" : "▼"}
                        </span>
                      </span>
                    </button>
                    {isOpen && (
                      <TeamRosterTable
                        players={team.players}
                        allocations={allocations}
                        onAllocate={setPlayerAllocation}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "compare" && (
        <PlanComparison
          plans={plans}
          teams={teams}
          comparePlanIds={comparePlanIds}
          onComparePlanIdsChange={setComparePlanIds}
        />
      )}
    </div>
  );
}

// --- Team Roster Table ---

function TeamRosterTable({
  players,
  allocations,
  onAllocate,
}: {
  players: PlannerPlayer[];
  allocations: Record<string, number>;
  onAllocate: (playerId: string, amount: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
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
              NFL Team
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
              Salary
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
              Value
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
              Surplus
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
              Adj. Surplus
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
              Arb $
            </th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => {
            const amount = allocations[p.player_id] ?? 0;
            return (
              <tr
                key={p.player_id}
                className={`border-t border-slate-100 dark:border-slate-800 ${
                  amount > 0
                    ? "bg-blue-50 dark:bg-blue-950/30"
                    : i % 2 === 0
                      ? "bg-white dark:bg-slate-950"
                      : "bg-slate-50 dark:bg-slate-900"
                }`}
              >
                <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap font-medium">
                  {p.name}
                </td>
                <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                  {p.position}
                </td>
                <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                  {p.nfl_team}
                </td>
                <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                  ${p.price}
                </td>
                <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                  ${p.dollar_value}
                </td>
                <td
                  className={`px-3 py-2 whitespace-nowrap ${
                    p.surplus >= 0
                      ? "text-green-700 dark:text-green-400"
                      : "text-red-700 dark:text-red-400"
                  }`}
                >
                  ${p.surplus}
                </td>
                <td
                  className={`px-3 py-2 whitespace-nowrap ${
                    p.adjusted_surplus >= 0
                      ? "text-green-700 dark:text-green-400"
                      : "text-red-700 dark:text-red-400"
                  }`}
                >
                  ${p.adjusted_surplus}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <AllocationStepper
                    value={amount}
                    onChange={(v) => onAllocate(p.player_id, v)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Stepper input for $0-$4 ---

function AllocationStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value === 0}
        className="w-6 h-6 flex items-center justify-center rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold"
      >
        −
      </button>
      <span
        className={`w-6 text-center text-sm font-medium ${
          value > 0
            ? "text-blue-700 dark:text-blue-300"
            : "text-slate-400 dark:text-slate-600"
        }`}
      >
        {value}
      </span>
      <button
        onClick={() =>
          onChange(Math.min(ARB_MAX_PER_PLAYER_PER_TEAM, value + 1))
        }
        disabled={value >= ARB_MAX_PER_PLAYER_PER_TEAM}
        className="w-6 h-6 flex items-center justify-center rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold"
      >
        +
      </button>
    </div>
  );
}
