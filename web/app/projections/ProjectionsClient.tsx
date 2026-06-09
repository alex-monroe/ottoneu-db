"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { POSITIONS, rookieSourceLabel } from "@/lib/analysis";
import type { ProjectionBoardRow } from "@/lib/analysis";
import ProjectionYearSelector from "@/components/ProjectionYearSelector";
import DataTable from "@/components/DataTable";
import PlayerName from "@/components/PlayerName";
import PositionBadge from "@/components/PositionBadge";
import type { Column, Position } from "@/lib/types";

interface Props {
  initialData: ProjectionBoardRow[];
  projectionYear: number;
  statsSeason: number;
  projectionYears: readonly number[];
  isForward: boolean;
}

type Tab = "ALL" | Position;
const TABS: Tab[] = ["ALL", ...POSITIONS];

/** Rookie / college source badge for players with no NFL track record. */
function SourceBadge({ row }: { row: ProjectionBoardRow }) {
  const label = rookieSourceLabel(row.projection_method);
  if (!label) return null;
  const color =
    label === "Rookie"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300";
  return (
    <span
      className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${color}`}
    >
      {label}
    </span>
  );
}

function buildColumns(
  projectionYear: number,
  statsSeason: number,
  isForward: boolean
): Column<ProjectionBoardRow>[] {
  const cols: Column<ProjectionBoardRow>[] = [
    { key: "overall_rank", label: "Rk", format: "number" },
    { key: "position_rank", label: "Pos Rk", format: "number" },
    {
      key: "name",
      label: "Player",
      renderCell: (value: unknown, row: ProjectionBoardRow) => (
        <PlayerName
          name={String(value ?? "—")}
          ottoneuId={row.ottoneu_id}
          mode={row.ottoneu_id ? "link" : "plain"}
          badges={<SourceBadge row={row} />}
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
    { key: "age", label: "Age", format: "number" },
    { key: "team_name", label: "Owner" },
    { key: "price", label: "Salary", format: "currency" },
    {
      key: "observed_ppg",
      label: `${statsSeason} PPG`,
      format: "decimal",
    },
    { key: "projected_ppg", label: `Proj ${projectionYear}`, format: "decimal" },
    {
      key: "ppg_delta",
      label: isForward ? `Δ vs ${statsSeason}` : `Δ vs actual`,
      format: "decimal",
    },
  ];
  return cols;
}

export default function ProjectionsClient({
  initialData,
  projectionYear,
  statsSeason,
  projectionYears,
  isForward,
}: Props) {
  const [tab, setTab] = useState<Tab>("ALL");
  const [query, setQuery] = useState("");
  const [rookiesOnly, setRookiesOnly] = useState(false);

  // Per-position counts for tab badges (rookie filter applied).
  const counts = useMemo(() => {
    const base = rookiesOnly
      ? initialData.filter((r) => r.is_rookie)
      : initialData;
    const c: Record<string, number> = { ALL: base.length };
    for (const pos of POSITIONS) {
      c[pos] = base.filter((r) => r.position === pos).length;
    }
    return c;
  }, [initialData, rookiesOnly]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialData.filter((r) => {
      if (rookiesOnly && !r.is_rookie) return false;
      if (tab !== "ALL" && r.position !== tab) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [initialData, tab, query, rookiesOnly]);

  const columns = useMemo(
    () => buildColumns(projectionYear, statsSeason, isForward),
    [projectionYear, statsSeason, isForward]
  );

  return (
    <section className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <ProjectionYearSelector
          currentYear={projectionYear}
          years={projectionYears}
        />
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players…"
            className="w-48 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 pl-8 pr-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rookiesOnly}
            onChange={(e) => setRookiesOnly(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
          />
          Rookies only
        </label>
      </div>

      {/* Position tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              {t}
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                  active
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {counts[t] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        highlightRow={(row) => {
          const delta = row.ppg_delta;
          if (typeof delta !== "number") return undefined;
          if (delta >= 1.5) return "bg-green-50 dark:bg-green-950";
          if (delta <= -1.5) return "bg-red-50 dark:bg-red-950";
          return undefined;
        }}
      />
    </section>
  );
}
