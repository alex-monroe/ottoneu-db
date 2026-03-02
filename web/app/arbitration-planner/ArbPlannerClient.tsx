"use client";

import { useState, useMemo, useCallback } from "react";
import {
  ArbitrationPlan,
  ArbitrationTarget,
  TeamAllocation,
} from "@/lib/types";
import { validatePlan } from "@/lib/arb-planner-validation";
import PlanManager from "./PlanManager";
import BudgetTracker from "./BudgetTracker";
import TeamRosterSection from "./TeamRosterSection";
import PlanComparison from "./PlanComparison";

interface ArbPlannerClientProps {
  targets: ArbitrationTarget[];
  suggestedAllocations: TeamAllocation[];
  initialPlans: ArbitrationPlan[];
  opponentTeams: string[];
  adjustedSurplusEntries: { player_id: string; adjustment: number }[];
}

export default function ArbPlannerClient({
  targets,
  suggestedAllocations,
  initialPlans,
  opponentTeams,
  adjustedSurplusEntries,
}: ArbPlannerClientProps) {
  const [tab, setTab] = useState<"plan" | "compare">("plan");
  const [plans, setPlans] = useState<ArbitrationPlan[]>(initialPlans);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [savedAllocations, setSavedAllocations] = useState<Record<string, number>>({});

  // Build lookup maps
  const playerTeamMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of targets) {
      map[t.player_id] = t.team_name ?? "";
    }
    return map;
  }, [targets]);

  const playerMap = useMemo(
    () => new Map(targets.map((t) => [t.player_id, t])),
    [targets]
  );

  // Group players by team
  const teamPlayers = useMemo(() => {
    const map = new Map<string, ArbitrationTarget[]>();
    for (const team of opponentTeams) {
      map.set(team, []);
    }
    for (const t of targets) {
      const team = t.team_name ?? "";
      const list = map.get(team);
      if (list) list.push(t);
    }
    // Sort players within each team by surplus descending
    for (const players of map.values()) {
      players.sort((a, b) => b.surplus - a.surplus);
    }
    return map;
  }, [targets, opponentTeams]);

  // Adjusted surplus map
  const adjustedSurplus = useMemo(() => {
    if (adjustedSurplusEntries.length === 0) return undefined;
    const map = new Map<string, number>();
    for (const entry of adjustedSurplusEntries) {
      const player = playerMap.get(entry.player_id);
      if (player) {
        map.set(entry.player_id, player.surplus + entry.adjustment);
      }
    }
    return map;
  }, [adjustedSurplusEntries, playerMap]);

  // Validation
  const validation = useMemo(
    () => validatePlan(allocations, playerTeamMap, opponentTeams),
    [allocations, playerTeamMap, opponentTeams]
  );

  const hasUnsavedChanges = useMemo(() => {
    if (!activePlanId) return false;
    const keys = new Set([
      ...Object.keys(allocations),
      ...Object.keys(savedAllocations),
    ]);
    for (const key of keys) {
      if ((allocations[key] ?? 0) !== (savedAllocations[key] ?? 0)) return true;
    }
    return false;
  }, [allocations, savedAllocations, activePlanId]);

  // Per-team allocated totals
  const teamAllocated = useMemo(() => {
    const map = new Map<string, number>();
    for (const team of opponentTeams) {
      map.set(team, 0);
    }
    for (const [pid, amt] of Object.entries(allocations)) {
      if (amt <= 0) continue;
      const team = playerTeamMap[pid];
      if (team) map.set(team, (map.get(team) ?? 0) + amt);
    }
    return map;
  }, [allocations, playerTeamMap, opponentTeams]);

  const handleAllocationChange = useCallback(
    (playerId: string, amount: number) => {
      setAllocations((prev) => ({ ...prev, [playerId]: amount }));
    },
    []
  );

  // Plan CRUD handlers
  const loadPlan = async (id: string) => {
    const res = await fetch(`/api/arbitration-plans/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setActivePlanId(id);
    setAllocations(data.allocations ?? {});
    setSavedAllocations(data.allocations ?? {});
  };

  const createPlan = async (name: string) => {
    const res = await fetch("/api/arbitration-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to create plan");
      return;
    }
    const plan = await res.json();
    setPlans((prev) => [plan, ...prev]);
    setActivePlanId(plan.id);
    setAllocations({});
    setSavedAllocations({});
  };

  const savePlan = async () => {
    if (!activePlanId) return;
    const res = await fetch(`/api/arbitration-plans/${activePlanId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocations }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to save plan");
      return;
    }
    setSavedAllocations({ ...allocations });
  };

  const saveAsPlan = async (name: string) => {
    const res = await fetch("/api/arbitration-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to create plan");
      return;
    }
    const plan = await res.json();

    // Save allocations to new plan
    const saveRes = await fetch(`/api/arbitration-plans/${plan.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocations }),
    });
    if (!saveRes.ok) {
      alert("Created plan but failed to save allocations");
      return;
    }

    setPlans((prev) => [plan, ...prev]);
    setActivePlanId(plan.id);
    setSavedAllocations({ ...allocations });
  };

  const deletePlan = async (id: string) => {
    const res = await fetch(`/api/arbitration-plans/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to delete plan");
      return;
    }
    setPlans((prev) => prev.filter((p) => p.id !== id));
    if (activePlanId === id) {
      setActivePlanId(null);
      setAllocations({});
      setSavedAllocations({});
    }
  };

  const duplicatePlan = async (id: string, name: string) => {
    const res = await fetch(`/api/arbitration-plans/${id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to duplicate plan");
      return;
    }
    const plan = await res.json();
    setPlans((prev) => [plan, ...prev]);
    // Load the duplicated plan
    loadPlan(plan.id);
  };

  const createFromSuggested = async () => {
    const name = `Suggested ${new Date().toLocaleDateString()}`;
    const res = await fetch("/api/arbitration-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to create plan");
      return;
    }
    const plan = await res.json();

    // Build allocations from suggested budget allocations
    const newAllocations: Record<string, number> = {};
    for (const team of suggestedAllocations) {
      // Distribute team budget among top players
      let remaining = team.suggested;
      for (const player of team.players) {
        if (remaining <= 0) break;
        const target = targets.find(
          (t) => t.name === player.name && t.team_name === team.team
        );
        if (!target) continue;
        const amount = Math.min(4, remaining);
        newAllocations[target.player_id] = amount;
        remaining -= amount;
      }
    }

    // Save allocations
    await fetch(`/api/arbitration-plans/${plan.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocations: newAllocations }),
    });

    setPlans((prev) => [plan, ...prev]);
    setActivePlanId(plan.id);
    setAllocations(newAllocations);
    setSavedAllocations(newAllocations);
  };

  // Stable alphabetical order — no re-sorting on allocation changes
  const sortedTeams = useMemo(() => {
    return [...opponentTeams].sort((a, b) => a.localeCompare(b));
  }, [opponentTeams]);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setTab("plan")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "plan"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          Plan
        </button>
        <button
          onClick={() => setTab("compare")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "compare"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          Compare
        </button>
      </div>

      {tab === "plan" ? (
        <>
          <PlanManager
            plans={plans}
            activePlanId={activePlanId}
            hasUnsavedChanges={hasUnsavedChanges}
            onSelectPlan={loadPlan}
            onCreatePlan={createPlan}
            onSavePlan={savePlan}
            onSaveAsPlan={saveAsPlan}
            onDeletePlan={deletePlan}
            onDuplicatePlan={duplicatePlan}
            onCreateFromSuggested={createFromSuggested}
          />

          <BudgetTracker validation={validation} />

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
              Opponent Rosters
            </h2>
            <div className="space-y-2">
              {sortedTeams.map((team) => (
                <TeamRosterSection
                  key={team}
                  teamName={team}
                  players={teamPlayers.get(team) ?? []}
                  allocations={allocations}
                  teamAllocated={teamAllocated.get(team) ?? 0}
                  onAllocationChange={handleAllocationChange}
                  adjustedSurplus={adjustedSurplus}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <PlanComparison
          plans={plans}
          playerMap={playerMap}
          playerTeamMap={playerTeamMap}
        />
      )}
    </div>
  );
}
