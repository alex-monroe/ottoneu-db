"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Week and season selection for the scoreboard. Mirrors /weekly's WeekFilters:
 * the page is a server component, so the picker only rewrites the query string
 * and lets the server re-render.
 */

interface Props {
  currentWeek: number;
  weeks: readonly number[];
  currentSeason: number;
  seasons: readonly number[];
}

const selectClass =
  "px-3 py-1.5 rounded-md text-sm font-medium border border-line-strong " +
  "bg-raised text-ink focus:outline-none focus:ring-2 focus:ring-accent";

export default function WeekPicker({
  currentWeek,
  weeks,
  currentSeason,
  seasons,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setParams = (entries: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <label htmlFor="week-select" className="text-sm text-ink-subtle">
          Week:
        </label>
        <select
          id="week-select"
          value={currentWeek}
          onChange={(e) => setParams({ week: e.target.value })}
          className={selectClass}
        >
          {weeks.map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>
      </div>

      {seasons.length > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor="season-select" className="text-sm text-ink-subtle">
            Season:
          </label>
          <select
            id="season-select"
            value={currentSeason}
            onChange={(e) => setParams({ season: e.target.value, week: null })}
            className={selectClass}
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
