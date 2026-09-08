"use client";

import Link from "next/link";
import * as HoverCard from "@radix-ui/react-hover-card";
import PositionBadge from "@/components/PositionBadge";
import type { SnapshotPlayer, TeamWeekSnapshot } from "@/lib/team-snapshot";

interface Props {
  teamName: string;
  week: number;
  /** Null when this week has no stored projections, or the team has no roster. */
  snapshot: TeamWeekSnapshot | null;
}

/** A projection, or a dash when the source has no row for this week. */
function points(p: SnapshotPlayer): string {
  return p.points == null ? "—" : p.points.toFixed(1);
}

/**
 * One player line. Deliberately not a table: nine starters and a bench of
 * fifteen in a card this narrow read better as rows than as a grid, and the
 * only thing being compared down the column is the number on the right.
 */
function PlayerLine({ player, slot }: { player: SnapshotPlayer | null; slot?: string }) {
  if (!player) {
    return (
      <div className="flex items-center gap-2 py-0.5 text-xs">
        {slot && (
          <span className="w-[4.75rem] shrink-0 text-[10px] font-semibold uppercase tracking-tight text-ink-subtle">
            {slot}
          </span>
        )}
        <span className="flex-1 italic text-ink-subtle">nobody eligible</span>
      </div>
    );
  }
  const out = player.points == null;
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      {slot && (
        <span className="w-[4.75rem] shrink-0 text-[10px] font-semibold uppercase tracking-tight text-ink-subtle">
          {slot}
        </span>
      )}
      {!slot && <PositionBadge position={player.position} size="sm" />}
      <span className={`min-w-0 flex-1 truncate ${out ? "text-ink-subtle" : "text-ink"}`}>
        {player.name}
      </span>
      <span className="shrink-0 text-ink-subtle">{player.opponent ?? "—"}</span>
      <span
        className={`w-10 shrink-0 text-right font-mono tabular-nums ${
          out ? "text-ink-subtle" : "font-medium text-ink-muted"
        }`}
        title={out ? "No projection for this week — bye or inactive" : undefined}
      >
        {points(player)}
      </span>
    </div>
  );
}

/**
 * The team name on a ballot row, with this week's optimal lineup behind it.
 *
 * The reason it is a hover rather than something always on screen: the ballot
 * is a list you reorder, and twelve nine-man lineups stacked into it would bury
 * the thing you are actually manipulating. But "wait, who do they even start at
 * running back" is the question that settles half of these arguments, so it
 * wants to be one gesture away rather than a tab away.
 *
 * The trigger is a `<button>`, not a link to /lineup, for a mechanical reason:
 * the row it sits in is `draggable`, and a link inside a draggable row means a
 * drag that starts on the team name either navigates or drags a URL. The link
 * to the full page lives at the foot of the card instead, where nothing is
 * being dragged.
 */
export default function TeamLineupHover({ teamName, week, snapshot }: Props) {
  return (
    <HoverCard.Root openDelay={150} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <button
          type="button"
          className="rounded font-semibold text-ink underline decoration-line-strong decoration-dotted underline-offset-4 hover:decoration-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {teamName}
        </button>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 max-h-[75vh] w-[23rem] overflow-y-auto rounded-lg border border-line bg-raised p-3 shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {snapshot ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-semibold text-ink">{teamName}</span>
                <span className="shrink-0 text-xs text-ink-subtle">
                  Week {week} ·{" "}
                  <span className="font-mono font-bold text-accent">
                    {snapshot.projectedPoints.toFixed(1)}
                  </span>
                </span>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                  Optimal lineup
                </p>
                <div className="divide-y divide-line/60">
                  {snapshot.starters.map((s) => (
                    <PlayerLine key={s.slot} slot={s.label} player={s.player} />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                  Bench ({snapshot.bench.length}
                  {snapshot.benchUnprojected > 0 ? `, ${snapshot.benchUnprojected} without a projection` : ""})
                </p>
                {snapshot.bench.length === 0 ? (
                  <p className="text-xs italic text-ink-subtle">Everyone is starting.</p>
                ) : (
                  <div className="divide-y divide-line/60">
                    {snapshot.bench.map((p) => (
                      <PlayerLine key={p.playerId} player={p} />
                    ))}
                  </div>
                )}
              </div>

              <Link
                href={`/lineup?team=${encodeURIComponent(teamName)}&week=${week}`}
                className="block pt-1 text-xs text-accent hover:underline"
              >
                Open in the lineup tool →
              </Link>
            </div>
          ) : (
            <p className="text-xs text-ink-subtle">
              No week {week} projections stored for {teamName} yet.
            </p>
          )}
          <HoverCard.Arrow className="fill-white dark:fill-slate-900" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
