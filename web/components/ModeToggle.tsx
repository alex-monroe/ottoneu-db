"use client";

import Link from "next/link";

interface ModeToggleProps {
  currentMode: "raw" | "adjusted";
  basePath: string;
  hasAdjustments: boolean;
  /** Any extra search params to preserve in the URL (e.g. year=2026) */
  extraParams?: Record<string, string>;
}

export default function ModeToggle({
  currentMode,
  basePath,
  hasAdjustments,
  extraParams = {},
}: ModeToggleProps) {
  const buildUrl = (mode: "raw" | "adjusted") => {
    const params = new URLSearchParams(extraParams);
    if (mode === "adjusted") params.set("mode", "adjusted");
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-600 dark:text-slate-400">Surplus:</span>
      <div className="flex rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 text-sm font-medium">
        <Link
          href={buildUrl("raw")}
          className={`px-3 py-1.5 transition-colors whitespace-nowrap ${
            currentMode === "raw"
              ? "bg-blue-600 text-white"
              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          Raw
        </Link>
        <Link
          href={buildUrl("adjusted")}
          className={`px-3 py-1.5 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            currentMode === "adjusted"
              ? "bg-blue-600 text-white"
              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          Adjusted
          {hasAdjustments && currentMode === "raw" && (
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          )}
        </Link>
      </div>
    </div>
  );
}
