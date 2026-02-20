"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface Props {
  currentYear: number;
  years: readonly number[];
}

export default function ProjectionYearSelector({ currentYear, years }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleYearChange = (year: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(year));
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500 dark:text-slate-400">Year:</span>
      <div className="flex gap-1">
        {years.map((year) => (
          <button
            key={year}
            onClick={() => handleYearChange(year)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
              year === currentYear
                ? "bg-slate-700 text-white border-transparent dark:bg-slate-200 dark:text-slate-900"
                : "bg-transparent text-slate-500 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {year}
          </button>
        ))}
      </div>
    </div>
  );
}
