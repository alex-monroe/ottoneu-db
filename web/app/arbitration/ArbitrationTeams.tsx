"use client";

import { useState } from "react";
import DataTable, { Column } from "@/components/DataTable";

interface TeamPlayer {
  name: string;
  position: string;
  price: number;
  dollar_value: number;
  surplus: number;
  surplus_after_arb: number;
}

interface TeamGroup {
  team: string;
  suggested: number;
  players: TeamPlayer[];
}

const TEAM_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "surplus", label: "Surplus", format: "currency" },
  { key: "surplus_after_arb", label: "Surplus (Post-Arb)", format: "currency" },
];

export default function ArbitrationTeams({ teams }: { teams: TeamGroup[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
            className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
          >
            <button
              onClick={() => toggle(team)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
            >
              <span className="font-medium text-slate-900 dark:text-white">
                {team}{" "}
                <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                  ({players.length} target{players.length !== 1 ? "s" : ""})
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  Suggested: ${suggested}
                </span>
                <span className="text-slate-400">{isOpen ? "▲" : "▼"}</span>
              </span>
            </button>
            {isOpen && (
              <div className="p-4">
                <DataTable
                  columns={TEAM_COLUMNS}
                  data={players}
                  highlightRow={(row) => {
                    const s = row.surplus_after_arb as number;
                    if (s < 0)
                      return "bg-red-50 dark:bg-red-950/30 border-t border-slate-100 dark:border-slate-800";
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
