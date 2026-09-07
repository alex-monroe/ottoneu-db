import { getSeasonContextNow } from "@/lib/season";
import { describeNextBoundary } from "@/lib/season-ui";
import type { Phase } from "@/lib/season";

/**
 * Tells a reader whether the tool they just opened is in its season.
 *
 * The site knew the phase and did nothing with it: `/arbitration` looked
 * identical in February and in December, and a manager landing on it out of
 * window got no hint that the thing they were planning was months away — or
 * already over. This says so, in the one place it matters.
 */

interface Props {
  /** Phases in which this tool is the live, in-window thing to be using. */
  activeIn: Phase[];
  /** What the tool is, for the sentence: "Arbitration is …". */
  label: string;
  /** Calendar key naming when the window opens, e.g. "arb_start". */
  opensOn?: string;
}

export default async function PhaseNote({ activeIn, label, opensOn }: Props) {
  const ctx = await getSeasonContextNow();
  if (activeIn.includes(ctx.phase)) return null;

  const boundary = describeNextBoundary(ctx);
  const opens = opensOn ? ctx.deadlines[opensOn] : null;

  return (
    <p className="rounded-lg border border-line bg-sunken px-4 py-2.5 text-sm text-ink-subtle">
      <span className="font-medium text-ink-muted">
        {label} is out of season right now.
      </span>{" "}
      Everything here still works and the numbers are live — it just is not the
      part of the year this tool is for.
      {opens && ` The window opens ${opens}.`}
      {!opens && boundary && boundary.daysUntil >= 0 && (
        <> Next up: {boundary.label} in {boundary.daysUntil} day{boundary.daysUntil === 1 ? "" : "s"}.</>
      )}
    </p>
  );
}
