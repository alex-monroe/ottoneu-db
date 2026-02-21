"use client";

import Link from "next/link";

export type ValueMode = "raw" | "adjusted" | "projected";

interface ModeToggleProps {
  currentMode: ValueMode;
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
  const buildUrl = (mode: ValueMode) => {
    const params = new URLSearchParams(extraParams);
    if (mode !== "raw") params.set("mode", mode);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const btnClass = (mode: ValueMode) =>
    `px-3 py-1.5 transition-colors whitespace-nowrap ${currentMode === mode
      ? "bg-blue-600 text-white"
      : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
    }`;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-600 dark:text-slate-400">Values:</span>
      <div className="flex rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 text-sm font-medium">
        <Link href={buildUrl("raw")} className={btnClass("raw")}>
          Raw
        </Link>
        <Link
          href={buildUrl("adjusted")}
          className={`${btnClass("adjusted")} flex items-center gap-1.5`}
        >
          Adjusted
          {hasAdjustments && currentMode !== "adjusted" && (
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          )}
        </Link>
        <Link href={buildUrl("projected")} className={btnClass("projected")}>
          Projected
        </Link>
      </div>
    </div>
  );
}
