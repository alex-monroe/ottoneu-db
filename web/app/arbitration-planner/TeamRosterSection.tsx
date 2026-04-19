"use client";

import { useState } from "react";
import { ArbitrationTarget, PlayerHoverData } from "@/lib/types";
import PlayerName from "@/components/PlayerName";
import PositionBadge from "@/components/PositionBadge";
import StatValue from "@/components/StatValue";

interface TeamRosterSectionProps {
  teamName: string;
  players: ArbitrationTarget[];
  allocations: Record<string, number>;
  teamAllocated: number;
  onAllocationChange: (playerId: string, amount: number) => void;
  adjustedSurplus?: Map<string, number>;
  hoverDataMap?: Record<string, PlayerHoverData> | null;
}

export default function TeamRosterSection({
  teamName,
  players,
  allocations,
  teamAllocated,
  onAllocationChange,
  adjustedSurplus,
  hoverDataMap,
}: TeamRosterSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const allocatedCount = players.filter(
    (p) => (allocations[p.player_id] ?? 0) > 0
  ).length;

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
      >
        <span className="font-medium text-slate-900 dark:text-white">
          {teamName}{" "}
          <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
            ({players.length} player{players.length !== 1 ? "s" : ""}
            {allocatedCount > 0 && `, ${allocatedCount} targeted`})
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span
            className={`text-sm font-medium ${teamAllocated > 8
                ? "text-red-600 dark:text-red-400"
                : teamAllocated >= 1 && teamAllocated <= 8
                  ? "text-green-600 dark:text-green-400"
                  : "text-slate-500 dark:text-slate-400"
              }`}
          >
            ${teamAllocated} / $8
          </span>
          <span className="text-slate-400">{isOpen ? "▲" : "▼"}</span>
        </span>
      </button>
      {isOpen && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                  Player
                </th>
                <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                  Pos
                </th>
                <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                  Team
                </th>
                <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                  Salary
                </th>
                <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                  Value
                </th>
                <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                  Surplus
                </th>
                <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                  PPG
                </th>
                <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                  GP
                </th>
                {adjustedSurplus && (
                  <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                    Adj. Surplus
                  </th>
                )}
                <th className="text-center px-3 py-2 font-medium text-slate-600 dark:text-slate-400">
                  Allocation
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const alloc = allocations[p.player_id] ?? 0;
                const adjSurp = adjustedSurplus?.get(p.player_id);
                const hasAlloc = alloc > 0;
                const isNegSurplus = p.surplus < 0;

                let rowClass = "";
                if (hasAlloc) {
                  rowClass = "bg-blue-50 dark:bg-blue-950/20";
                } else if (isNegSurplus) {
                  rowClass = "bg-red-50/50 dark:bg-red-950/10";
                }

                return (
                  <tr
                    key={p.player_id}
                    className={`border-b border-slate-100 dark:border-slate-800 ${rowClass}`}
                  >
                    <td className="px-3 py-2">
                      <PlayerName
                        name={p.name}
                        ottoneuId={p.ottoneu_id}
                        mode={hoverDataMap ? "hover" : "link"}
                        hoverData={hoverDataMap?.[p.player_id]}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <PositionBadge position={p.position} />
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {p.nfl_team}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-900 dark:text-white">
                      <StatValue value={p.price} format="currency" />
                    </td>
                    <td className="px-3 py-2 text-right text-slate-900 dark:text-white">
                      <StatValue value={p.dollar_value} format="currency" />
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${p.surplus >= 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                        }`}
                    >
                      <StatValue value={p.surplus} format="currency" />
                    </td>
                    <td className="px-3 py-2 text-right text-slate-900 dark:text-white">
                      <StatValue value={p.ppg} format="decimal" />
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">
                      <StatValue value={p.games_played} format="number" />
                    </td>
                    {adjustedSurplus && (
                      <td
                        className={`px-3 py-2 text-right font-medium ${(adjSurp ?? p.surplus) >= 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                          }`}
                      >
                        {adjSurp !== undefined ? <StatValue value={adjSurp} format="currency" /> : "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        min={0}
                        max={4}
                        value={alloc}
                        onChange={(e) => {
                          const val = Math.min(
                            4,
                            Math.max(0, parseInt(e.target.value) || 0)
                          );
                          onAllocationChange(p.player_id, val);
                        }}
                        className="w-14 text-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-1 py-1 text-sm"
                        aria-label={`Allocation for ${p.name}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
