"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface Props {
  currentSeason: number;
  seasons: readonly number[];
}

export default function SeasonSelector({ currentSeason, seasons }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (season: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("season", String(season));
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="season-select" className="text-sm text-slate-500 dark:text-slate-400">
        Season:
      </label>
      <select
        id="season-select"
        value={currentSeason}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="px-3 py-1.5 rounded-md text-sm font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
