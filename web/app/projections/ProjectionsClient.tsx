"use client";

import { useState } from "react";
import DataTable, { Column } from "@/components/DataTable";
import { POSITIONS } from "@/lib/analysis";
import PositionFilter from "@/components/PositionFilter";
import { Position } from "@/lib/types";

interface ProjectionRow {
  name: string;
  position: string;
  nfl_team: string;
  team_name: string;
  price: number;
  observed_ppg: number;
  projected_ppg: number;
  ppg_delta: number;
  [key: string]: string | number | null | undefined;
}

const TABLE_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "Team" },
  { key: "team_name", label: "Owner" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "observed_ppg", label: "Obs PPG", format: "decimal" },
  { key: "projected_ppg", label: "Proj PPG", format: "decimal" },
  { key: "ppg_delta", label: "Delta", format: "decimal" },
];

interface Props {
  initialData: ProjectionRow[];
}

export default function ProjectionsClient({ initialData }: Props) {
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([
    ...POSITIONS,
  ]);

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

  const filteredData = initialData.filter((p) =>
    selectedPositions.includes(p.position as Position)
  );

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          All Players
        </h2>
        <PositionFilter
          positions={POSITIONS}
          selectedPositions={selectedPositions}
          onToggle={togglePosition}
          showAll
          onToggleAll={toggleAll}
        />
      </div>
      <DataTable
        columns={TABLE_COLUMNS}
        data={filteredData}
        highlightRules={[
          { key: "ppg_delta", op: "gte", value: 1.5, className: "bg-green-50 dark:bg-green-950" },
          { key: "ppg_delta", op: "lte", value: -1.5, className: "bg-red-50 dark:bg-red-950" },
        ]}
      />
    </section>
  );
}
