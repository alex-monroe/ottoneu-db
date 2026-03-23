"use client";

import { useState, useEffect, useMemo } from "react";
import { ArbitrationPlan, ArbitrationPlanWithAllocations, PublicArbPlayer } from "@/lib/types";

interface PublicPlanComparisonProps {
    plans: ArbitrationPlan[];
    playerMap: Map<string, PublicArbPlayer>;
}

export default function PublicPlanComparison({
    plans,
    playerMap,
}: PublicPlanComparisonProps) {
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
                    ppg: player.ppg,
                    allocations: selectedPlans.map((plan) => plan.allocations[pid] ?? 0),
                };
            })
            .filter((r): r is NonNullable<typeof r> => !!r)
            .sort((a, b) => {
                if (a.team_name !== b.team_name)
                    return a.team_name.localeCompare(b.team_name);
                const totalA = a.allocations.reduce((s, v) => s + v, 0);
                const totalB = b.allocations.reduce((s, v) => s + v, 0);
                return totalB - totalA;
            });
    }, [selectedPlans, playerMap]);

    // Per-team summary
    const teamSummaries = useMemo(() => {
        const teams = new Map<string, { totals: number[]; count: number }>();
        for (const row of comparisonRows) {
            if (!teams.has(row.team_name)) {
                teams.set(row.team_name, { totals: new Array(selectedPlans.length).fill(0), count: 0 });
            }
            const data = teams.get(row.team_name)!;
            data.count += 1;
            for (let i = 0; i < row.allocations.length; i++) {
                data.totals[i] += row.allocations[i];
            }
        }
        return teams;
    }, [comparisonRows, selectedPlans.length]);

    if (plans.length < 2) {
        return (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
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
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border text-sm cursor-pointer transition-colors ${selectedIds.has(p.id)
                                ? "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                                : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
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
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                                    Owner
                                </th>
                                <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                                    Player
                                </th>
                                <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                                    Pos
                                </th>
                                <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                                    Salary
                                </th>
                                <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                                    2025 PPG
                                </th>
                                {selectedPlans.map((plan) => (
                                    <th
                                        key={plan.id}
                                        className="text-center px-3 py-2 font-medium text-blue-600 dark:text-blue-400"
                                    >
                                        {plan.name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {comparisonRows.map((row, idx) => {
                                const prevTeam =
                                    idx > 0 ? comparisonRows[idx - 1].team_name : null;
                                const showTeamHeader = row.team_name !== prevTeam;
                                const teamData = teamSummaries.get(row.team_name);

                                return (
                                    <tr
                                        key={row.player_id}
                                        className="border-b border-slate-100 dark:border-slate-800"
                                    >
                                        {showTeamHeader ? (
                                            <td
                                                className="px-3 py-2 font-medium text-slate-900 dark:text-white align-top"
                                                // ⚡ Bolt: Replaced O(N^2) inline .filter() with O(1) pre-calculated Map lookup for row spans.
                                                rowSpan={teamData?.count || 1}
                                            >
                                                <div>{row.team_name}</div>
                                                {teamData && (
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                        {teamData.totals.map((t, i) => (
                                                            <span key={i}>
                                                                {i > 0 && " / "}${t}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                        ) : null}
                                        <td className="px-3 py-2 text-slate-900 dark:text-white">
                                            {row.name}
                                        </td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                                            {row.position}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-900 dark:text-white">
                                            ${row.salary}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-900 dark:text-white">
                                            {row.ppg.toFixed(2)}
                                        </td>
                                        {row.allocations.map((alloc, i) => {
                                            const differs = row.allocations.some(
                                                (a, j) => j !== i && a !== alloc
                                            );
                                            return (
                                                <td
                                                    key={i}
                                                    className={`px-3 py-2 text-center font-medium ${alloc > 0
                                                            ? "text-slate-900 dark:text-white"
                                                            : "text-slate-400 dark:text-slate-600"
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
                            <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50">
                                <td
                                    colSpan={5}
                                    className="px-3 py-2 font-bold text-slate-900 dark:text-white text-right"
                                >
                                    Total
                                </td>
                                {selectedPlans.map((plan, i) => {
                                    const total = comparisonRows.reduce(
                                        (sum, r) => sum + r.allocations[i],
                                        0
                                    );
                                    return (
                                        <td
                                            key={plan.id}
                                            className="px-3 py-2 text-center font-bold text-slate-900 dark:text-white"
                                        >
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
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    No allocations found in the selected plans.
                </div>
            )}

            {selectedPlans.length < 2 && selectedIds.size > 0 && (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    Select at least 2 plans to compare.
                </div>
            )}
        </div>
    );
}
