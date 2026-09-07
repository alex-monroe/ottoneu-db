"use client";

import { useState } from "react";
import { PlayerHoverData } from "@/lib/types";
import PlayerName from "@/components/PlayerName";
import PositionBadge from "@/components/PositionBadge";
import StatValue from "@/components/StatValue";
import type { ArbPlannerPlayer } from "./types";

interface TeamRosterSectionProps<T extends ArbPlannerPlayer> {
  teamName: string;
  players: T[];
  allocations: Record<string, number>;
  teamAllocated: number;
  onAllocationChange: (playerId: string, amount: number) => void;
  /**
   * When true, render the Value/Surplus columns (authed planner). Players are
   * expected to carry `dollar_value`/`surplus` in that case. Defaults to false
   * (public, read-only view) so the columns stay hidden.
   */
  showSurplus?: boolean;
  /**
   * Optional adjusted-surplus map (player_id -> adjusted surplus). When present,
   * an "Adj. Surplus" column is rendered. Authed planner only.
   */
  adjustedSurplus?: Map<string, number>;
  /**
   * Optional per-player hover data. When present, player names render as rich
   * hover cards; otherwise they fall back to `nameMode`.
   */
  hoverDataMap?: Record<string, PlayerHoverData> | null;
  /** Player-name render mode when no hover data is supplied. Defaults to "plain". */
  nameMode?: "link" | "plain";
}

export default function TeamRosterSection<T extends ArbPlannerPlayer>({
  teamName,
  players,
  allocations,
  teamAllocated,
  onAllocationChange,
  showSurplus = false,
  adjustedSurplus,
  hoverDataMap,
  nameMode = "plain",
}: TeamRosterSectionProps<T>) {
  const [isOpen, setIsOpen] = useState(false);

  const allocatedCount = players.filter(
    (p) => (allocations[p.player_id] ?? 0) > 0
  ).length;

  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-sunken hover:bg-sunken transition-colors text-left"
      >
        <span className="font-medium text-ink">
          {teamName}{" "}
          <span className="text-sm font-normal text-ink-subtle">
            ({players.length} player{players.length !== 1 ? "s" : ""}
            {allocatedCount > 0 && `, ${allocatedCount} targeted`})
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span
            className={`text-sm font-medium ${teamAllocated > 8
                ? "text-negative"
                : teamAllocated >= 1 && teamAllocated <= 8
                  ? "text-positive"
                  : "text-ink-subtle"
              }`}
          >
            ${teamAllocated} / $8
          </span>
          <span className="text-ink-subtle">{isOpen ? "▲" : "▼"}</span>
        </span>
      </button>
      {isOpen && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-sunken/50">
                <th className="text-left px-3 py-2 font-medium text-ink-muted">
                  Player
                </th>
                <th className="text-left px-3 py-2 font-medium text-ink-muted">
                  Pos
                </th>
                <th className="text-left px-3 py-2 font-medium text-ink-muted">
                  Team
                </th>
                <th className="text-right px-3 py-2 font-medium text-ink-muted">
                  Salary
                </th>
                {showSurplus && (
                  <>
                    <th className="text-right px-3 py-2 font-medium text-ink-muted">
                      Value
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-ink-muted">
                      Surplus
                    </th>
                  </>
                )}
                <th className="text-right px-3 py-2 font-medium text-ink-muted">
                  PPG
                </th>
                <th className="text-right px-3 py-2 font-medium text-ink-muted">
                  GP
                </th>
                {adjustedSurplus && (
                  <th className="text-right px-3 py-2 font-medium text-ink-muted">
                    Adj. Surplus
                  </th>
                )}
                <th className="text-center px-3 py-2 font-medium text-ink-muted">
                  Allocation
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const alloc = allocations[p.player_id] ?? 0;
                const surplus = p.surplus ?? 0;
                const adjSurp = adjustedSurplus?.get(p.player_id);
                const hasAlloc = alloc > 0;
                const isNegSurplus = showSurplus && surplus < 0;

                let rowClass = "";
                if (hasAlloc) {
                  rowClass = "bg-blue-50 dark:bg-blue-950/20";
                } else if (isNegSurplus) {
                  rowClass = "bg-red-50/50 dark:bg-red-950/10";
                }

                return (
                  <tr
                    key={p.player_id}
                    className={`border-b border-line ${rowClass}`}
                  >
                    <td className="px-3 py-2">
                      <PlayerName
                        name={p.name}
                        ottoneuId={p.ottoneu_id}
                        mode={hoverDataMap ? "hover" : nameMode}
                        hoverData={hoverDataMap?.[p.player_id]}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <PositionBadge position={p.position} />
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {p.nfl_team}
                    </td>
                    <td className="px-3 py-2 text-right text-ink">
                      <StatValue value={p.price} format="currency" />
                    </td>
                    {showSurplus && (
                      <>
                        <td className="px-3 py-2 text-right text-ink">
                          <StatValue value={p.dollar_value ?? null} format="currency" />
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-medium ${surplus >= 0
                              ? "text-positive"
                              : "text-negative"
                            }`}
                        >
                          <StatValue value={p.surplus ?? null} format="currency" />
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 text-right text-ink">
                      <StatValue value={p.ppg} format="decimal" />
                    </td>
                    <td className="px-3 py-2 text-right text-ink-muted">
                      <StatValue value={p.games_played} format="number" />
                    </td>
                    {adjustedSurplus && (
                      <td
                        className={`px-3 py-2 text-right font-medium ${(adjSurp ?? surplus) >= 0
                            ? "text-positive"
                            : "text-negative"
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
                        className="w-14 text-center rounded border border-line-strong bg-white dark:bg-slate-800 text-ink px-1 py-1 text-sm"
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
