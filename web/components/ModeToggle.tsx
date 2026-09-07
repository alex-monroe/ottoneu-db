"use client";

import Link from "next/link";
import Explain from "./Explain";

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
      : "bg-raised text-ink-muted hover:bg-sunken"
    }`;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink-muted">
        Values:
        {/* This toggle changes every number on the page and said nothing about
            what the three modes mean. */}
        <Explain term="value_mode" />
      </span>
      <div
        className="flex rounded-md overflow-hidden border border-line text-sm font-medium"
        role="group"
        aria-label="Value Modes"
      >
        <Link
          href={buildUrl("raw")}
          className={btnClass("raw")}
          aria-current={currentMode === "raw" ? "page" : undefined}
        >
          Raw
        </Link>
        <Link
          href={buildUrl("adjusted")}
          className={`${btnClass("adjusted")} flex items-center gap-1.5`}
          aria-current={currentMode === "adjusted" ? "page" : undefined}
        >
          Adjusted
          {hasAdjustments && currentMode !== "adjusted" && (
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" aria-hidden="true" />
          )}
        </Link>
        <Link
          href={buildUrl("projected")}
          className={btnClass("projected")}
          aria-current={currentMode === "projected" ? "page" : undefined}
        >
          Projected
        </Link>
      </div>
    </div>
  );
}
