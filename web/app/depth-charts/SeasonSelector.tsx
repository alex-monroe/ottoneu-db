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
      <label htmlFor="season-select" className="text-sm text-ink-subtle">
        Season:
      </label>
      <select
        id="season-select"
        value={currentSeason}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="px-3 py-1.5 rounded-md text-sm font-medium border border-line-strong bg-raised text-ink focus:outline-none focus:ring-2 focus:ring-accent"
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
