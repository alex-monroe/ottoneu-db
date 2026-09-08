"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, RotateCcw, Undo2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ConsolidatedRow, TeamRecord } from "@/lib/power-rankings";
import { movementLabel } from "@/lib/power-rankings";

interface Props {
  week: number;
  weeks: number[];
  /** Consolidated order, best first. */
  rows: ConsolidatedRow[];
  voters: { userId: string; displayName: string }[];
  records: Record<string, TeamRecord>;
  unranked: string[];
  split: ConsolidatedRow | null;
}

/** Movement chip: climbed, fell, held, or brand new to the ranking. */
function Movement({ movement }: { movement: number | null }) {
  const label = movementLabel(movement);
  if (movement === null) {
    return (
      <span className="inline-flex items-center rounded bg-sunken px-2 py-0.5 text-xs font-medium text-ink-subtle">
        new
      </span>
    );
  }
  if (movement === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-sunken px-2 py-0.5 text-xs font-medium text-ink-subtle">
        <Minus size={12} aria-hidden="true" />
        held
      </span>
    );
  }
  const up = movement > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
        up
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
          : "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200"
      }`}
      title={`${up ? "Up" : "Down"} ${Math.abs(movement)} from last week`}
    >
      {up ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
      {label}
    </span>
  );
}

function Card({
  row,
  record,
  isLatest,
}: {
  row: ConsolidatedRow;
  record: TeamRecord | undefined;
  isLatest: boolean;
}) {
  return (
    <li
      className={`rounded-xl border p-4 transition-colors sm:p-5 ${
        isLatest ? "border-accent bg-accent-soft" : "border-line bg-raised"
      }`}
    >
      <div className="flex items-start gap-4">
        <span className="w-14 shrink-0 text-right text-4xl font-black tabular-nums leading-none text-ink sm:text-5xl">
          {row.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {row.teamName}
            </h3>
            <Movement movement={row.movement} />
            {row.spread >= 3 && (
              <span
                className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                title={`Ranked as high as ${row.bestRank} and as low as ${row.worstRank}`}
              >
                split {row.spread}
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-ink-muted">
            {record
              ? `${record.record} · ${record.pointsFor.toFixed(1)} PF · #${record.standingsRank} in the standings`
              : "No games played yet"}
            {" · "}
            <span className="text-ink-subtle">mean rank {row.meanRank.toFixed(1)}</span>
          </p>

          {/* Each host's own placement — the argument, in one line. */}
          <ul className="mt-3 flex flex-wrap gap-2">
            {row.votes.map((v) => (
              <li
                key={v.userId}
                className="rounded-md border border-line bg-page px-2.5 py-1 text-xs"
              >
                <span className="font-medium text-ink-muted">{v.displayName}</span>{" "}
                <span className="font-bold tabular-nums text-ink">#{v.rank}</span>
              </li>
            ))}
          </ul>

          {row.votes.some((v) => v.note) && (
            <ul className="mt-3 space-y-1.5 border-l-2 border-line pl-3">
              {row.votes
                .filter((v) => v.note)
                .map((v) => (
                  <li key={v.userId} className="text-sm text-ink-muted">
                    <span className="font-medium text-ink-subtle">{v.displayName}:</span>{" "}
                    {v.note}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * The live reveal.
 *
 * Runs bottom-up: the first click shows the worst team, the last shows the
 * best. Revealed cards stack with the newest on top, so the screen you are
 * talking over is always at eye level and — once the countdown finishes — the
 * page reads top to bottom as an ordinary 1-through-12 ranking, which is the
 * thing you screenshot afterwards.
 *
 * The state is deliberately local and unsaved. This is a thing two people click
 * through once while recording; persisting how far along they got would mean a
 * refresh mid-episode restores a stale position instead of just starting clean.
 */
export default function RevealClient({
  week,
  weeks,
  rows,
  voters,
  records,
  unranked,
  split,
}: Props) {
  const router = useRouter();
  /** How many slots are showing, counted from the bottom of the ranking. */
  const [revealed, setRevealed] = useState(0);
  const total = rows.length;

  const next = useCallback(() => setRevealed((n) => Math.min(n + 1, total)), [total]);
  const back = useCallback(() => setRevealed((n) => Math.max(n - 1, 0)), []);
  const reset = useCallback(() => setRevealed(0), []);

  // Keyboard control, because on air nobody wants to aim a mouse at a button.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === " " || e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
        e.preventDefault();
        back();
      } else if (e.key.toLowerCase() === "r") {
        reset();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, reset]);

  // `rows` is best-first, so the revealed slots are its tail — and taking that
  // tail as-is puts the newest reveal (the best rank so far) at the top of the
  // stack, which is both where you want to be looking and what makes the
  // finished page read straight down as 1-through-n.
  const shown = rows.slice(total - revealed);
  const nextRank = total - revealed;
  const done = revealed === total;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised/95 p-3 backdrop-blur sm:p-4">
        <button
          onClick={next}
          disabled={done}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowDown size={18} aria-hidden="true" />
          {done ? "All revealed" : `Reveal #${nextRank}`}
        </button>

        <button
          onClick={back}
          disabled={revealed === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-sunken disabled:opacity-40"
        >
          <Undo2 size={15} aria-hidden="true" />
          Back
        </button>
        <button
          onClick={reset}
          disabled={revealed === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-sunken disabled:opacity-40"
        >
          <RotateCcw size={15} aria-hidden="true" />
          Reset
        </button>

        <span className="ml-auto flex items-center gap-3 text-sm text-ink-subtle">
          <span aria-live="polite">
            {revealed} of {total} revealed
          </span>
          <span className="hidden sm:inline">
            <kbd className="rounded border border-line-strong px-1.5 py-0.5 text-xs">
              space
            </kbd>{" "}
            next ·{" "}
            <kbd className="rounded border border-line-strong px-1.5 py-0.5 text-xs">←</kbd>{" "}
            back
          </span>
          <select
            aria-label="Week"
            value={week}
            onChange={(e) =>
              router.push(`/podcast/power-rankings/reveal?week=${e.target.value}`)
            }
            className="rounded border border-line-strong bg-raised px-2 py-1 text-sm text-ink"
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </span>
      </div>

      {/* Still hidden */}
      {!done && (
        <div className="rounded-xl border border-dashed border-line-strong bg-sunken/50 p-6 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-ink-subtle">
            {nextRank} {nextRank === 1 ? "team" : "teams"} still hidden
          </p>
          <p className="mt-1 text-2xl font-bold text-ink-subtle">
            #1 – #{nextRank}
          </p>
        </div>
      )}

      {/* Revealed, newest on top */}
      {shown.length > 0 && (
        <ol className="space-y-3">
          {shown.map((row, i) => (
            <Card
              key={row.teamName}
              row={row}
              record={records[row.teamName]}
              isLatest={i === 0}
            />
          ))}
        </ol>
      )}

      {/* Post-show notes. Held back until the countdown is over so nothing here
          gives away a slot that has not been read out yet. */}
      {done && split && (
        <div className="rounded-xl border border-line bg-raised p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Biggest split
          </p>
          <p className="mt-1 text-ink">
            <strong>{split.teamName}</strong> — {split.spread} places apart (
            {split.votes.map((v) => `${v.displayName} #${v.rank}`).join(", ")}).
          </p>
        </div>
      )}

      <p className="text-sm text-ink-subtle">
        Ballots counted: {voters.map((v) => v.displayName).join(", ")}.
        {unranked.length > 0 && (
          <>
            {" "}
            Not on any locked ballot: {unranked.join(", ")}.
          </>
        )}
      </p>
    </div>
  );
}
