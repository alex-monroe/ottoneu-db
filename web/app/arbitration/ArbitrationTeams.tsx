"use client";

import { useState } from "react";
import DataTable from "@/components/DataTable";
import type { Column, PlayerHoverData } from "@/lib/types";
import {
  playerNameCol,
  positionCol,
  salaryCol,
  valueCol,
  ownerCol,
} from "@/components/columns";

interface TeamPlayer {
  name: string;
  position: string;
  price: number;
  dollar_value: number;
  surplus: number;
  surplus_after_arb: number;
  observed_ppg?: number;
  ppg?: number;
  [key: string]: string | number | null | undefined;
}

interface TeamGroup {
  team: string;
  suggested: number;
  players: TeamPlayer[];
}

function getBaseColumns(hoverDataMap: Record<string, PlayerHoverData> | null): Column[] {
  return [
    playerNameCol({ hoverDataMap }),
    positionCol(),
    salaryCol(),
    valueCol(),
    { key: "surplus", label: "Surplus", format: "currency" },
    { key: "surplus_after_arb", label: "Surplus (Post-Arb)", format: "currency" },
  ];
}

function getProjectedColumns(hoverDataMap: Record<string, PlayerHoverData> | null): Column[] {
  return [
    playerNameCol({ hoverDataMap }),
    positionCol(),
    salaryCol(),
    { key: "observed_ppg", label: "Obs PPG", format: "decimal" },
    { key: "ppg", label: "Proj PPG", format: "decimal" },
    valueCol(),
    { key: "surplus", label: "Surplus", format: "currency" },
    { key: "surplus_after_arb", label: "Surplus (Post-Arb)", format: "currency" },
  ];
}

interface ArbitrationTeamsProps {
  teams: TeamGroup[];
  showProjectionColumns?: boolean;
  hoverDataMap?: Record<string, PlayerHoverData> | null;
}

export default function ArbitrationTeams({ teams, showProjectionColumns = false, hoverDataMap = null }: ArbitrationTeamsProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const columns = showProjectionColumns ? getProjectedColumns(hoverDataMap) : getBaseColumns(hoverDataMap);

  const toggle = (team: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {teams.map(({ team, suggested, players }) => {
        const isOpen = expanded.has(team);
        return (
          <div
            key={team}
            className="border border-line rounded-lg overflow-hidden"
          >
            <button
              onClick={() => toggle(team)}
              className="w-full flex items-center justify-between px-4 py-3 bg-sunken hover:bg-sunken transition-colors text-left"
            >
              <span className="font-medium text-ink">
                {team}{" "}
                <span className="text-sm font-normal text-ink-subtle">
                  ({players.length} target{players.length !== 1 ? "s" : ""})
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-sm font-medium text-accent">
                  Suggested: ${suggested}
                </span>
                <span className="text-ink-subtle">{isOpen ? "▲" : "▼"}</span>
              </span>
            </button>
            {isOpen && (
              <div className="p-4">
                <DataTable
                  columns={columns}
                  data={players}
                  highlightRow={(row) => {
                    const s = row.surplus_after_arb as number;
                    if (s < 0)
                      return "bg-red-50 dark:bg-red-950/30 border-t border-line";
                    return undefined;
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
