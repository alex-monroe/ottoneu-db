"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, GripVertical, Lock, Unlock } from "lucide-react";
import type { TeamRecord } from "@/lib/power-rankings";
import { MAX_NOTE_LENGTH } from "@/lib/schemas/power-ranking";

interface Props {
  season: number;
  week: number;
  weeks: number[];
  teams: string[];
  records: Record<string, TeamRecord>;
  initialOrder: string[];
  initialNotes: Record<string, string>;
  initiallySubmitted: boolean;
  otherHosts: { displayName: string; submitted: boolean }[];
  submittedCount: number;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** Move `from` to `to` in a copy of `list`. */
function moved(list: string[], from: number, to: number): string[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * One host's ballot.
 *
 * Reordering is offered twice on purpose. Dragging is what a person reaches for
 * with a mouse; the up/down buttons are what works with a keyboard, a screen
 * reader and a phone, where HTML5 drag events are unreliable to non-existent.
 * Both drive the same `order` array, so neither is a second source of truth.
 *
 * Saving is a debounced autosave rather than a Save button: a ballot gets built
 * over a few days in odd moments, and losing a half-finished one to a closed tab
 * is the failure that would actually happen. Locking in is the only explicit
 * action, because that is the one with a consequence — it makes the ballot
 * visible to consolidation and therefore to the other host.
 */
export default function BallotEditor({
  season,
  week,
  weeks,
  teams,
  records,
  initialOrder,
  initialNotes,
  initiallySubmitted,
  otherHosts,
  submittedCount,
}: Props) {
  const router = useRouter();
  const [order, setOrder] = useState<string[]>(initialOrder);
  const [notes, setNotes] = useState<Record<string, string>>(initialNotes);
  const [submitted, setSubmitted] = useState(initiallySubmitted);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Skips the autosave that would otherwise fire for the initial render.
  const dirty = useRef(false);

  const save = useCallback(
    async (nextSubmitted: boolean, nextOrder: string[], nextNotes: Record<string, string>) => {
      setState("saving");
      setError("");
      try {
        const res = await fetch("/api/podcast/power-rankings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            season,
            week,
            order: nextOrder,
            notes: nextNotes,
            submit: nextSubmitted,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Couldn't save that. Try again in a moment.");
          setState("error");
          return false;
        }
        setState("saved");
        return true;
      } catch {
        setError("Couldn't reach the server. Your changes aren't saved yet.");
        setState("error");
        return false;
      }
    },
    [season, week],
  );

  // Autosave. Keeps whatever lock state the ballot already has, so editing a
  // locked ballot does not silently un-submit it.
  useEffect(() => {
    if (!dirty.current) return;
    const id = setTimeout(() => {
      void save(submitted, order, notes);
    }, 1200);
    return () => clearTimeout(id);
  }, [order, notes, submitted, save]);

  const reorder = (from: number, to: number) => {
    const next = moved(order, from, to);
    if (next === order) return;
    dirty.current = true;
    setOrder(next);
  };

  const setNote = (team: string, value: string) => {
    dirty.current = true;
    setNotes((prev) => {
      const next = { ...prev };
      if (value.trim()) next[team] = value;
      else delete next[team];
      return next;
    });
  };

  const complete = order.length === teams.length && new Set(order).size === teams.length;

  const toggleLock = async () => {
    const next = !submitted;
    const ok = await save(next, order, notes);
    if (!ok) return;
    dirty.current = false;
    setSubmitted(next);
    router.refresh();
  };

  const status =
    state === "saving"
      ? "Saving…"
      : state === "error"
        ? "Not saved"
        : state === "saved"
          ? "Saved"
          : submitted
            ? "Locked in"
            : "Draft";

  return (
    <div className="space-y-6">
      {/* Week switcher + lock state */}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-line bg-raised p-4">
        <div>
          <label htmlFor="week" className="block text-xs font-medium uppercase tracking-wide text-ink-subtle">
            Ranking ahead of
          </label>
          <select
            id="week"
            value={week}
            onChange={(e) => router.push(`/podcast/power-rankings?week=${e.target.value}`)}
            className="mt-1 rounded border border-line-strong bg-raised px-2 py-1.5 text-sm text-ink"
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`text-sm ${state === "error" ? "text-negative" : "text-ink-subtle"}`}
            role={state === "error" ? "alert" : undefined}
          >
            {status}
          </span>
          <button
            onClick={toggleLock}
            disabled={state === "saving" || (!submitted && !complete)}
            className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              submitted
                ? "border border-line-strong text-ink-muted hover:bg-sunken"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {submitted ? <Unlock size={15} /> : <Lock size={15} />}
            {submitted ? "Reopen as draft" : "Lock ballot in"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      {/* The ballot */}
      <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-raised">
        {order.map((team, i) => {
          const record = records[team];
          return (
            <li
              key={team}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) reorder(dragIndex, i);
                setDragIndex(null);
              }}
              className={`flex items-start gap-3 px-3 py-3 sm:px-4 ${
                dragIndex === i ? "bg-accent-soft" : ""
              }`}
            >
              <span className="mt-1 w-7 shrink-0 text-right text-lg font-bold tabular-nums text-ink">
                {i + 1}
              </span>
              <GripVertical
                size={16}
                aria-hidden="true"
                className="mt-1.5 shrink-0 cursor-grab text-ink-subtle"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-ink">{team}</span>
                  {record && (
                    <span className="text-xs text-ink-subtle">
                      {record.record} · {record.pointsFor.toFixed(1)} PF · #
                      {record.standingsRank} in standings
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={notes[team] ?? ""}
                  maxLength={MAX_NOTE_LENGTH}
                  onChange={(e) => setNote(team, e.target.value)}
                  placeholder="Note to read out when this slot is revealed (optional)"
                  aria-label={`Note for ${team}`}
                  className="mt-1.5 w-full rounded border border-line bg-page px-2 py-1 text-sm text-ink placeholder:text-ink-subtle focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="mt-0.5 flex shrink-0 flex-col gap-1">
                <button
                  onClick={() => reorder(i, i - 1)}
                  disabled={i === 0}
                  aria-label={`Move ${team} up`}
                  className="rounded p-1 text-ink-subtle transition-colors hover:bg-sunken hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={() => reorder(i, i + 1)}
                  disabled={i === order.length - 1}
                  aria-label={`Move ${team} down`}
                  className="rounded p-1 text-ink-subtle transition-colors hover:bg-sunken hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Who else is in */}
      <div className="rounded-lg border border-line bg-raised p-4 text-sm">
        <p className="font-medium text-ink">Other hosts</p>
        {otherHosts.length === 0 ? (
          <p className="mt-1 text-ink-subtle">
            Nobody else has started a Week {week} ballot.
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-ink-muted">
            {otherHosts.map((h) => (
              <li key={h.displayName}>
                {h.displayName} — {h.submitted ? "locked in" : "still drafting"}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-ink-subtle">
          {submittedCount} ballot{submittedCount === 1 ? "" : "s"} counting towards the
          Week {week} reveal. Nobody sees your order until you lock it in.
        </p>
      </div>
    </div>
  );
}
