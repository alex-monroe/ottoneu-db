"use client";

import { useState } from "react";
import { POSITIONS, PROJECTION_YEARS, SEASON } from "@/lib/analysis";
import PositionFilter from "@/components/PositionFilter";
import ProjectionYearSelector from "@/components/ProjectionYearSelector";
import DataTable from "@/components/DataTable";
import PlayerName from "@/components/PlayerName";
import PositionBadge from "@/components/PositionBadge";
import type { Column, Position } from "@/lib/types";

export interface ProjectionRow {
  player_id: string;
  ottoneu_id?: number;
  name: string;
  position: string;
  nfl_team: string;
  team_name: string;
  price: number;
  observed_ppg: number;
  projected_ppg: number;
  ppg_delta: number;
  projection_method: string;
  [key: string]: string | number | null | undefined;
}

interface Props {
  initialData: ProjectionRow[];
  projectionYear: number;
}

/** Rookie/College badge components for the player name cell. */
function ProjectionBadges({ method }: { method: string }) {
  if (method === "rookie_trajectory") {
    return (
      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        Rookie
      </span>
    );
  }
  if (method === "college_prospect") {
    return (
      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
        College
      </span>
    );
  }
  return null;
}

function getProjectionColumns(projectionYear: number): Column<ProjectionRow>[] {
  return [
    {
      key: "name",
      label: "Player",
      renderCell: (value: unknown, row: ProjectionRow) => (
        <PlayerName
          name={String(value ?? "—")}
          ottoneuId={row.ottoneu_id}
          mode={row.ottoneu_id ? "link" : "plain"}
          badges={<ProjectionBadges method={row.projection_method} />}
        />
      ),
    },
    {
      key: "position",
      label: "Pos",
      renderCell: (value: unknown) => (
        <PositionBadge position={String(value ?? "")} />
      ),
    },
    { key: "nfl_team", label: "Team" },
    { key: "team_name", label: "Owner" },
    { key: "price", label: "Salary", format: "currency" },
    { key: "observed_ppg", label: `${SEASON} PPG`, format: "decimal" },
    { key: "projected_ppg", label: `Proj ${projectionYear}`, format: "decimal" },
    { key: "ppg_delta", label: `Δ ${projectionYear} vs ${SEASON}`, format: "decimal" },
  ];
}

export default function ProjectionsClient({ initialData, projectionYear }: Props) {
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([
    ...POSITIONS,
  ]);
  const [sortKey, setSortKey] = useState<string>("projected_ppg");
  const [sortAsc, setSortAsc] = useState(false);

  const togglePosition = (pos: Position) => {
    setSelectedPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const toggleAll = () => {
    setSelectedPositions(
      selectedPositions.length === POSITIONS.length ? [] : [...POSITIONS]
    );
  };

  const filteredData = initialData
    .filter((p) => selectedPositions.includes(p.position as Position));

  const columns = getProjectionColumns(projectionYear);

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          All Players
        </h2>
        <ProjectionYearSelector currentYear={projectionYear} years={PROJECTION_YEARS} />
        <PositionFilter
          positions={POSITIONS}
          selectedPositions={selectedPositions}
          onToggle={togglePosition}
          showAll
          onToggleAll={toggleAll}
        />
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        highlightRow={(row) => {
          const delta = row.ppg_delta;
          if (typeof delta === "number" && delta >= 1.5)
            return "bg-green-50 dark:bg-green-950";
          if (typeof delta === "number" && delta <= -1.5)
            return "bg-red-50 dark:bg-red-950";
          return undefined;
        }}
      />
    </section>
  );
}
