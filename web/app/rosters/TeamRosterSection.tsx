"use client";

import { useState } from "react";
import DataTable from "@/components/DataTable";
import { type TeamRoster } from "@/lib/roster-reconstruction";
import type { Column, PlayerHoverData } from "@/lib/types";
import { CAP_PER_TEAM } from "@/lib/arb-logic";
import TeamName from "@/components/TeamName";
import {
  playerNameCol,
  positionCol,
  nflTeamCol,
  gamesPlayedCol,
} from "@/components/columns";

function getRosterColumns(hoverDataMap: Record<string, PlayerHoverData> | null): Column[] {
  return [
    playerNameCol({ hoverDataMap }),
    positionCol(),
    nflTeamCol(),
    { key: "salary", label: "Salary", format: "currency" },
    { key: "ppg", label: "PPG", format: "decimal" },
    { key: "pps", label: "PPS", format: "decimal" },
    gamesPlayedCol("G"),
    { key: "acquired_date", label: "Acquired" },
  ];
}

interface TeamRosterSectionProps {
  roster: TeamRoster;
  /** The signed-in viewer's team, expanded by default. Null = all collapsed. */
  viewerTeam?: string | null;
  hoverDataMap?: Record<string, PlayerHoverData> | null;
}

export default function TeamRosterSection({ roster, hoverDataMap = null, viewerTeam = null }: TeamRosterSectionProps) {
  // The viewer's own roster opens by default; everyone else's starts collapsed.
  const [isOpen, setIsOpen] = useState(viewerTeam != null && roster.team_name === viewerTeam);

  const isOverCap = roster.total_salary > CAP_PER_TEAM;

  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 bg-sunken hover:bg-sunken transition-colors text-left"
      >
        <span className="font-medium text-ink">
          <TeamName name={roster.team_name} mine={viewerTeam === roster.team_name} />{" "}
          <span className="text-sm font-normal text-ink-subtle">
            ({roster.players.length} player
            {roster.players.length !== 1 ? "s" : ""})
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-sm">
            <span className="font-medium text-ink-muted">
              ${roster.total_salary}
            </span>
            <span className="text-ink-subtle">
              /{CAP_PER_TEAM}
            </span>
          </span>
          <span
            className={`text-sm font-medium ${
              isOverCap
                ? "text-negative"
                : "text-positive"
            }`}
          >
            {isOverCap ? "-" : "+"}$
            {Math.abs(roster.cap_space)} cap
          </span>
          <span className="text-ink-subtle">{isOpen ? "▲" : "▼"}</span>
        </span>
      </button>
      {isOpen && (
        <div className="p-4">
          <DataTable columns={getRosterColumns(hoverDataMap)} data={roster.players} />
        </div>
      )}
    </div>
  );
}
