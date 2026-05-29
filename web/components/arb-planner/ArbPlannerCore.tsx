"use client";

import { useState, useMemo, useCallback } from "react";
import { ArbitrationPlan, PlayerHoverData } from "@/lib/types";
import { validatePlan } from "@/lib/arb-planner-validation";
import PlanManager from "@/app/arbitration-planner/PlanManager";
import BudgetTracker from "@/app/arbitration-planner/BudgetTracker";
import TeamRosterSection from "./TeamRosterSection";
import PlanComparison, { ComparisonMetricColumn } from "./PlanComparison";
import type { ArbPlannerPlayer } from "./types";

interface ArbPlannerCoreProps<T extends ArbPlannerPlayer> {
  /** Rostered players to display, grouped/sorted by team internally. */
  players: T[];
  initialPlans: ArbitrationPlan[];
  opponentTeams: string[];
  /** Comparator for ordering players within a team section. */
  sortPlayers: (a: T, b: T) => number;
  /** Metric column config for the Compare tab. */
  metricColumn: ComparisonMetricColumn<T>;

  // --- Roster feature flags (default to the read-only/public behavior) ---
  /** Show Value/Surplus columns in roster tables (authed planner). */
  showSurplus?: boolean;
  /** Adjusted-surplus map; when present, adds an "Adj. Surplus" column. */
  adjustedSurplus?: Map<string, number>;
  /** Per-player hover data; when present, names render as hover cards. */
  hoverDataMap?: Record<string, PlayerHoverData> | null;
  /** Player-name fallback render mode when no hover data is supplied. */
  nameMode?: "link" | "plain";

  // --- Comparison styling ---
  /** Optional className applied to comparison body rows. */
  comparisonBodyRowClassName?: string;

  // --- Plan-manager features ---
  /** Hide the "Create from Suggested" action (public planner). */
  hideCreateFromSuggested?: boolean;
  /**
   * Builds suggested allocations for a fresh plan. Called by "Create from
   * Suggested" when not hidden. Returns a player_id -> amount map.
   */
  buildSuggestedAllocations?: () => Record<string, number>;
}

export default function ArbPlannerCore<T extends ArbPlannerPlayer>({
  players,
  initialPlans,
  opponentTeams,
  sortPlayers,
  metricColumn,
  showSurplus = false,
  adjustedSurplus,
  hoverDataMap,
  nameMode = "plain",
  comparisonBodyRowClassName = "",
  hideCreateFromSuggested = false,
  buildSuggestedAllocations,
}: ArbPlannerCoreProps<T>) {
  const [tab, setTab] = useState<"plan" | "compare">("plan");
  const [plans, setPlans] = useState<ArbitrationPlan[]>(initialPlans);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [savedAllocations, setSavedAllocations] = useState<Record<string, number>>({});

  // Build lookup maps
  const playerTeamMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of players) {
      map[p.player_id] = p.team_name ?? "";
    }
    return map;
  }, [players]);

  const playerMap = useMemo(
    () => new Map(players.map((p) => [p.player_id, p])),
    [players]
  );

  // Group players by team
  const teamPlayers = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const team of opponentTeams) {
      map.set(team, []);
    }
    for (const p of players) {
      const team = p.team_name ?? "";
      const list = map.get(team);
      if (list) list.push(p);
    }
    for (const list of map.values()) {
      list.sort(sortPlayers);
    }
    return map;
  }, [players, opponentTeams, sortPlayers]);

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
    if (!buildSuggestedAllocations) return;
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

    const newAllocations = buildSuggestedAllocations();

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
  const sortedTeams = useMemo(
    () => [...opponentTeams].sort((a, b) => a.localeCompare(b)),
    [opponentTeams]
  );

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
            hideCreateFromSuggested={hideCreateFromSuggested}
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
                  showSurplus={showSurplus}
                  adjustedSurplus={adjustedSurplus}
                  hoverDataMap={hoverDataMap}
                  nameMode={nameMode}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <PlanComparison
          plans={plans}
          playerMap={playerMap}
          metricColumn={metricColumn}
          bodyRowClassName={comparisonBodyRowClassName}
        />
      )}
    </div>
  );
}
