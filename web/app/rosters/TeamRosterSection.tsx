"use client";

import { useState } from "react";
import DataTable, { Column } from "@/components/DataTable";
import { type TeamRoster } from "@/lib/roster-reconstruction";
import { MY_TEAM, CAP_PER_TEAM } from "@/lib/arb-logic";

const ROSTER_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "NFL Team" },
  { key: "salary", label: "Salary", format: "currency" },
  { key: "ppg", label: "PPG", format: "decimal" },
  { key: "pps", label: "PPS", format: "decimal" },
  { key: "games_played", label: "G" },
  { key: "acquired_date", label: "Acquired" },
];

interface TeamRosterSectionProps {
  roster: TeamRoster;
}

export default function TeamRosterSection({ roster }: TeamRosterSectionProps) {
  const [isOpen, setIsOpen] = useState(roster.team_name === MY_TEAM);

  const isOverCap = roster.total_salary > CAP_PER_TEAM;

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
      >
        <span className="font-medium text-slate-900 dark:text-white">
          {roster.team_name}{" "}
          <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
            ({roster.players.length} player
            {roster.players.length !== 1 ? "s" : ""})
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              ${roster.total_salary}
            </span>
            <span className="text-slate-400 dark:text-slate-500">
              /${CAP_PER_TEAM}
            </span>
          </span>
          <span
            className={`text-sm font-medium ${
              isOverCap
                ? "text-red-600 dark:text-red-400"
                : "text-green-600 dark:text-green-400"
            }`}
          >
            {isOverCap ? "-" : "+"}$
            {Math.abs(roster.cap_space)} cap
          </span>
          <span className="text-slate-400">{isOpen ? "▲" : "▼"}</span>
        </span>
      </button>
      {isOpen && (
        <div className="p-4">
          <DataTable columns={ROSTER_COLUMNS} data={roster.players} />
        </div>
      )}
    </div>
  );
}
