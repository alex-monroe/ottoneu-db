"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { POSITIONS } from "@/lib/config";

interface Props {
  currentWeek: number;
  weeks: readonly number[];
  currentPosition: string;
}

export default function WeekFilters({ currentWeek, weeks, currentPosition }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`);
  };

  const selectClass =
    "px-3 py-1.5 rounded-md text-sm font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <label htmlFor="week-select" className="text-sm text-slate-500 dark:text-slate-400">
          Week:
        </label>
        <select
          id="week-select"
          value={currentWeek}
          onChange={(e) => setParam("week", e.target.value)}
          className={selectClass}
        >
          {weeks.map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="position-select" className="text-sm text-slate-500 dark:text-slate-400">
          Position:
        </label>
        <select
          id="position-select"
          value={currentPosition}
          onChange={(e) => setParam("position", e.target.value)}
          className={selectClass}
        >
          <option value="">All</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
