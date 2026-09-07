import { getSeasonContextNow } from "@/lib/season";
import { PHASE_UI, describeNextBoundary } from "@/lib/season-ui";

/**
 * Thin season-cycle banner shown under the nav.
 *
 * It owns the phase, the blurb and the deadline countdown outright — the
 * homepage hero used to print all three again a few hundred pixels below.
 * Its colour is `--phase`, not amber: amber had come to mean the phase badge,
 * the featured-nav dot, the playoff cut line *and* "this data may be stale", so
 * the one genuinely urgent signal wore the same colour as the decoration.
 * Surfaces the current phase,
 * a one-line blurb, and a countdown to the next league deadline so the site
 * orients the user to where we are in the Ottoneu year.
 */
export default async function PhaseBanner() {
  const ctx = await getSeasonContextNow();
  const ui = PHASE_UI[ctx.phase];
  const next = describeNextBoundary(ctx);

  return (
    <div className="border-b border-line bg-sunken">
      <div className="px-4 sm:px-6 lg:px-8 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-phase">
          <span className="h-1.5 w-1.5 rounded-full bg-phase" aria-hidden="true" />
          {ui.label}
          <span className="font-normal text-ink-subtle">
            · {ctx.leagueSeason} season
          </span>
        </span>
        <span className="text-ink-subtle hidden sm:inline">
          {ui.blurb}
        </span>
        {next && (
          <span className="ml-auto text-ink-subtle whitespace-nowrap">
            Next: <span className="font-medium text-ink-muted">{next.label}</span>{" "}
            {next.daysUntil <= 0 ? "today" : `in ${next.daysUntil} day${next.daysUntil === 1 ? "" : "s"}`}
          </span>
        )}
      </div>
    </div>
  );
}
