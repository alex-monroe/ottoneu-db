"use client";

import { useState, useEffect, useMemo } from "react";
import { ArbitrationPlan, ArbitrationPlanWithAllocations } from "@/lib/types";
import type { ArbPlannerPlayer } from "./types";

/**
 * Describes the single configurable metric column rendered between "Salary" and
 * the per-plan allocation columns. The authed planner shows colored surplus;
 * the public planner shows season PPG.
 */
export interface ComparisonMetricColumn<T extends ArbPlannerPlayer> {
  /** Column header label. */
  label: string;
  /** Extracts the displayed value from the player row. */
  getValue: (player: T) => number;
  /** Renders the cell content (e.g. `$${v}` vs `v.toFixed(2)`). */
  render: (value: number) => React.ReactNode;
  /**
   * Full className for the value cell. Receives the value so callers can apply
   * conditional coloring (e.g. green/red surplus). Should include any base
   * text-color classes since it is the complete className for the `<td>`.
   */
  cellClassName: (value: number) => string;
}

interface PlanComparisonProps<T extends ArbPlannerPlayer> {
  plans: ArbitrationPlan[];
  playerMap: Map<string, T>;
  metricColumn: ComparisonMetricColumn<T>;
  /**
   * Optional className applied to each body row. The public view adds a bottom
   * border; the authed view leaves rows borderless. Defaults to none.
   */
  bodyRowClassName?: string;
}

export default function PlanComparison<T extends ArbPlannerPlayer>({
  plans,
  playerMap,
  metricColumn,
  bodyRowClassName = "",
}: PlanComparisonProps<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadedPlans, setLoadedPlans] = useState<
    Map<string, ArbitrationPlanWithAllocations>
  >(new Map());

  const togglePlan = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Load plan data when selected
  useEffect(() => {
    for (const id of selectedIds) {
      if (loadedPlans.has(id)) continue;
      fetch(`/api/arbitration-plans/${id}`)
        .then((r) => r.json())
        .then((data) => {
          setLoadedPlans((prev) => new Map(prev).set(id, data));
        });
    }
  }, [selectedIds, loadedPlans]);

  const selectedPlans = useMemo(
    () =>
      [...selectedIds]
        .map((id) => loadedPlans.get(id))
        .filter((p): p is ArbitrationPlanWithAllocations => !!p),
    [selectedIds, loadedPlans]
  );

  // Collect all players with allocations in any selected plan
  const comparisonRows = useMemo(() => {
    const playerIds = new Set<string>();
    for (const plan of selectedPlans) {
      for (const [pid, amt] of Object.entries(plan.allocations)) {
        if (amt > 0) playerIds.add(pid);
      }
    }

    return [...playerIds]
      .map((pid) => {
        const player = playerMap.get(pid);
        if (!player) return null;
        return {
          player_id: pid,
          name: player.name,
          position: player.position,
          team_name: player.team_name ?? "",
          salary: player.price,
          metric: metricColumn.getValue(player),
          allocations: selectedPlans.map((plan) => plan.allocations[pid] ?? 0),
        };
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => {
        // Sort by team, then by total allocations descending
        if (a.team_name !== b.team_name) return a.team_name.localeCompare(b.team_name);
        const totalA = a.allocations.reduce((s, v) => s + v, 0);
        const totalB = b.allocations.reduce((s, v) => s + v, 0);
        return totalB - totalA;
      });
  }, [selectedPlans, playerMap, metricColumn]);

  // Per-team summary
  const teamSummaries = useMemo(() => {
    const teams = new Map<string, number[]>();
    for (const row of comparisonRows) {
      if (!teams.has(row.team_name)) {
        teams.set(row.team_name, new Array(selectedPlans.length).fill(0));
      }
      const totals = teams.get(row.team_name)!;
      for (let i = 0; i < row.allocations.length; i++) {
        totals[i] += row.allocations[i];
      }
    }
    return teams;
  }, [comparisonRows, selectedPlans.length]);

  if (plans.length < 2) {
    return (
      <div className="text-center py-12 text-ink-subtle">
        Create at least 2 plans to compare them.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Plan selection */}
      <div className="flex flex-wrap gap-2">
        {plans.map((p) => (
          <label
            key={p.id}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border text-sm cursor-pointer transition-colors ${
              selectedIds.has(p.id)
                ? "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                : "border-line-strong text-ink-muted hover:bg-sunken"
            }`}
          >
            <input
              type="checkbox"
              checked={selectedIds.has(p.id)}
              onChange={() => togglePlan(p.id)}
              className="rounded"
            />
            {p.name}
          </label>
        ))}
      </div>

      {/* Comparison Table */}
      {selectedPlans.length >= 2 && comparisonRows.length > 0 && (
        <div className="overflow-x-auto border border-line rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-sunken/50">
                <th className="text-left px-3 py-2 font-medium text-ink-muted">
                  Owner
                </th>
                <th className="text-left px-3 py-2 font-medium text-ink-muted">
                  Player
                </th>
                <th className="text-left px-3 py-2 font-medium text-ink-muted">
                  Pos
                </th>
                <th className="text-right px-3 py-2 font-medium text-ink-muted">
                  Salary
                </th>
                <th className="text-right px-3 py-2 font-medium text-ink-muted">
                  {metricColumn.label}
                </th>
                {selectedPlans.map((plan) => (
                  <th
                    key={plan.id}
                    className="text-center px-3 py-2 font-medium text-accent"
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row, idx) => {
                // Show team header row when team changes
                const prevTeam = idx > 0 ? comparisonRows[idx - 1].team_name : null;
                const showTeamHeader = row.team_name !== prevTeam;
                const teamTotals = teamSummaries.get(row.team_name);

                return (
                  <tr key={row.player_id} className={bodyRowClassName}>
                    {showTeamHeader ? (
                      <td
                        className="px-3 py-2 font-medium text-ink align-top"
                        rowSpan={comparisonRows.filter((r) => r.team_name === row.team_name).length}
                      >
                        <div>{row.team_name}</div>
                        {teamTotals && (
                          <div className="text-xs text-ink-subtle mt-1">
                            {teamTotals.map((t, i) => (
                              <span key={i}>
                                {i > 0 && " / "}${t}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    ) : null}
                    <td className="px-3 py-2 text-ink">
                      {row.name}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {row.position}
                    </td>
                    <td className="px-3 py-2 text-right text-ink">
                      ${row.salary}
                    </td>
                    <td className={metricColumn.cellClassName(row.metric)}>
                      {metricColumn.render(row.metric)}
                    </td>
                    {row.allocations.map((alloc, i) => {
                      const differs = row.allocations.some((a, j) => j !== i && a !== alloc);
                      return (
                        <td
                          key={i}
                          className={`px-3 py-2 text-center font-medium ${
                            alloc > 0 ? "text-ink" : "text-ink-subtle"
                          } ${differs && alloc > 0 ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}`}
                        >
                          {alloc > 0 ? `$${alloc}` : "-"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            {/* Totals footer */}
            <tfoot>
              <tr className="border-t-2 border-line-strong bg-sunken/50">
                <td colSpan={5} className="px-3 py-2 font-bold text-ink text-right">
                  Total
                </td>
                {selectedPlans.map((plan, i) => {
                  const total = comparisonRows.reduce((sum, r) => sum + r.allocations[i], 0);
                  return (
                    <td key={plan.id} className="px-3 py-2 text-center font-bold text-ink">
                      ${total}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {selectedPlans.length >= 2 && comparisonRows.length === 0 && (
        <div className="text-center py-8 text-ink-subtle">
          No allocations found in the selected plans.
        </div>
      )}

      {selectedPlans.length < 2 && selectedIds.size > 0 && (
        <div className="text-center py-8 text-ink-subtle">
          Select at least 2 plans to compare.
        </div>
      )}
    </div>
  );
}
