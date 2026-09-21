"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Picks which season's production a value page reads.
 *
 * The season the site shows is normally resolved for you — from the league
 * calendar, clamped back to whatever `player_stats` can actually answer for
 * (web/lib/stats-season.ts). That is the right default and this does not change
 * it. What it adds is the one comparison the default cannot express: in October,
 * "what has happened so far this year" and "what happened over all of last year"
 * are different questions, and a manager wants both.
 *
 * Rendered as links rather than a control with an `onChange`, so the choice
 * survives in the URL and a page can be shared or reloaded in the state it was
 * read in. Every other search param is preserved, so switching seasons never
 * kicks you out of the tab you were on.
 */
interface Props {
  seasons: readonly number[];
  current: number;
  /** Season → button label, e.g. { 2026: "2026 to date", 2025: "2025" }. */
  labels: Record<number, string>;
}

function Picker({ seasons, current, labels }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const href = (season: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("season", String(season));
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink-subtle">Production:</span>
      <div
        className="flex overflow-hidden rounded-md border border-line text-sm font-medium"
        role="group"
        aria-label="Which season's production to show"
      >
        {seasons.map((season) => (
          <Link
            key={season}
            href={href(season)}
            aria-current={season === current ? "page" : undefined}
            className={`whitespace-nowrap px-3 py-1.5 transition-colors ${
              season === current
                ? "bg-blue-600 text-white"
                : "bg-raised text-ink-muted hover:bg-sunken"
            }`}
          >
            {labels[season] ?? season}
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * `useSearchParams` suspends during a static render, so the control is wrapped —
 * the same reason `Tabs` wraps `TabBar`. The fallback is the group's own outline,
 * so the header does not reflow when the buttons arrive.
 */
export default function StatWindowPicker(props: Props) {
  return (
    <Suspense fallback={<div className="h-[34px]" aria-hidden="true" />}>
      <Picker {...props} />
    </Suspense>
  );
}
