"use client";

import { useState } from "react";
import { POSITIONS, PROJECTION_YEARS } from "@/lib/analysis";
import PositionFilter from "@/components/PositionFilter";
import ProjectionYearSelector from "@/components/ProjectionYearSelector";
import { Position } from "@/lib/types";

export interface ProjectionRow {
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

type SortKey = keyof Omit<ProjectionRow, "[key: string]">;

interface Props {
  initialData: ProjectionRow[];
  projectionYear: number;
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

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false); // numeric columns default to desc
    }
  };

  const filteredData = initialData
    .filter((p) => selectedPositions.includes(p.position as Position))
    .sort((a, b) => {
      const av = a[sortKey as SortKey];
      const bv = b[sortKey as SortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortAsc ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      return sortAsc ? as.localeCompare(bs) : bs.localeCompare(as);
    });

  const thClass =
    "px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap hover:bg-slate-200 dark:hover:bg-slate-700";
  const tdClass = "px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap";

  const sortIndicator = (key: string) =>
    sortKey === key ? (
      <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>
    ) : null;

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

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800">
              <th className={thClass} onClick={() => handleSort("name")}>
                Player{sortIndicator("name")}
              </th>
              <th className={thClass} onClick={() => handleSort("position")}>
                Pos{sortIndicator("position")}
              </th>
              <th className={thClass} onClick={() => handleSort("nfl_team")}>
                Team{sortIndicator("nfl_team")}
              </th>
              <th className={thClass} onClick={() => handleSort("team_name")}>
                Owner{sortIndicator("team_name")}
              </th>
              <th className={thClass} onClick={() => handleSort("price")}>
                Salary{sortIndicator("price")}
              </th>
              <th className={thClass} onClick={() => handleSort("observed_ppg")}>
                Obs PPG{sortIndicator("observed_ppg")}
              </th>
              <th className={thClass} onClick={() => handleSort("projected_ppg")}>
                Proj PPG{sortIndicator("projected_ppg")}
              </th>
              <th className={thClass} onClick={() => handleSort("ppg_delta")}>
                Delta{sortIndicator("ppg_delta")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, i) => {
              const delta = row.ppg_delta;
              const isOutperform = typeof delta === "number" && delta >= 1.5;
              const isUnderperform = typeof delta === "number" && delta <= -1.5;
              const rowBg = isOutperform
                ? "bg-green-50 dark:bg-green-950"
                : isUnderperform
                ? "bg-red-50 dark:bg-red-950"
                : i % 2 === 0
                ? "bg-white dark:bg-slate-950"
                : "bg-slate-50 dark:bg-slate-900";

              const isRookie = row.projection_method === "rookie_trajectory";

              return (
                <tr
                  key={i}
                  className={`border-t border-slate-100 dark:border-slate-800 ${rowBg}`}
                >
                  <td className={tdClass}>
                    {row.name}
                    {isRookie && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        Rookie
                      </span>
                    )}
                  </td>
                  <td className={tdClass}>{row.position}</td>
                  <td className={tdClass}>{row.nfl_team}</td>
                  <td className={tdClass}>{row.team_name}</td>
                  <td className={tdClass}>${row.price}</td>
                  <td className={tdClass}>
                    {typeof row.observed_ppg === "number"
                      ? row.observed_ppg.toFixed(2)
                      : "—"}
                  </td>
                  <td className={tdClass}>
                    {typeof row.projected_ppg === "number"
                      ? row.projected_ppg.toFixed(2)
                      : "—"}
                  </td>
                  <td className={tdClass}>
                    {typeof row.ppg_delta === "number"
                      ? row.ppg_delta.toFixed(2)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
