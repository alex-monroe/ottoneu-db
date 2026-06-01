import { getSeasonContextNow } from "@/lib/season";
import { PHASE_UI, describeNextBoundary } from "@/lib/season-ui";

/**
 * Thin season-cycle banner shown under the nav. Surfaces the current phase,
 * a one-line blurb, and a countdown to the next league deadline so the site
 * orients the user to where we are in the Ottoneu year.
 */
export default async function PhaseBanner() {
  const ctx = await getSeasonContextNow();
  const ui = PHASE_UI[ctx.phase];
  const next = describeNextBoundary(ctx);

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
      <div className="px-4 sm:px-6 lg:px-8 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          {ui.label}
          <span className="text-slate-400 dark:text-slate-500 font-normal">
            · {ctx.leagueSeason} season
          </span>
        </span>
        <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
          {ui.blurb}
        </span>
        {next && (
          <span className="ml-auto text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Next: <span className="font-medium text-slate-700 dark:text-slate-300">{next.label}</span>{" "}
            {next.daysUntil <= 0 ? "today" : `in ${next.daysUntil} day${next.daysUntil === 1 ? "" : "s"}`}
          </span>
        )}
      </div>
    </div>
  );
}
