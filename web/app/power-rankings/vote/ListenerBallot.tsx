"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, GripVertical, Lock, Unlock } from "lucide-react";
import type { TeamRecord } from "@/lib/power-rankings";
import type { TeamWeekSnapshot } from "@/lib/team-snapshot";
import TeamLineupHover from "@/components/TeamLineupHover";

interface Props {
  season: number;
  week: number;
  teams: string[];
  records: Record<string, TeamRecord>;
  snapshots: Record<string, TeamWeekSnapshot>;
  snapshotsAvailable: boolean;
  initialOrder: string[];
  initiallySubmitted: boolean;
  /** Human-readable "closes at" line, or null while the hosts are holding the week. */
  closesLabel: string | null;
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
 * A listener's ballot: the host ballot's ordering and lock, without its notes.
 *
 * Same interaction model as the hosts' `BallotEditor` — drag or up/down buttons
 * over one `order` array, a debounced autosave as a draft, and "lock in" as the
 * one explicit action because it is the one that makes the vote count. The row
 * is draggable everywhere rather than from a held grip: the host editor arms
 * dragging from the grip only because its rows contain text boxes, and these
 * do not.
 */
export default function ListenerBallot({
  season,
  week,
  teams,
  records,
  snapshots,
  snapshotsAvailable,
  initialOrder,
  initiallySubmitted,
  closesLabel,
}: Props) {
  const router = useRouter();
  const [order, setOrder] = useState<string[]>(initialOrder);
  const [submitted, setSubmitted] = useState(initiallySubmitted);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dirty = useRef(false);

  const save = useCallback(
    async (nextSubmitted: boolean, nextOrder: string[]) => {
      setState("saving");
      setError("");
      try {
        const res = await fetch("/api/power-rankings/ballot", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ season, week, order: nextOrder, submit: nextSubmitted }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Couldn't save that. Try again in a moment.");
          setState("error");
          // Voting closed underneath the page — reload into the closed state.
          if (res.status === 409) router.refresh();
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
    [season, week, router],
  );

  // Autosave, keeping whatever lock state the ballot already has.
  useEffect(() => {
    if (!dirty.current) return;
    const id = setTimeout(() => {
      void save(submitted, order);
    }, 1200);
    return () => clearTimeout(id);
  }, [order, submitted, save]);

  const reorder = (from: number, to: number) => {
    const next = moved(order, from, to);
    if (next === order) return;
    dirty.current = true;
    setOrder(next);
  };

  const complete = order.length === teams.length && new Set(order).size === teams.length;

  const toggleLock = async () => {
    const next = !submitted;
    const ok = await save(next, order);
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
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-raised p-4">
        <p className="max-w-prose text-sm text-ink-muted">
          {submitted
            ? "Your ballot is locked in and counts towards the community ranking. You can reopen it until voting closes."
            : "Drafts save as you go but don't count — lock your ballot in once all the teams are in order."}{" "}
          {closesLabel
            ? `Voting closes ${closesLabel}, when the rankings go public.`
            : "Voting stays open until the hosts publish the rankings."}
        </p>
        <div className="flex items-center gap-3">
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

      {!snapshotsAvailable && (
        <p className="text-sm text-ink-subtle">
          No week {week} projections are stored yet, so the lineup previews are blank.
        </p>
      )}

      <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-raised">
        {order.map((team, i) => {
          const record = records[team];
          const snapshot = snapshots[team] ?? null;
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
              className={`flex items-center gap-3 px-3 py-2.5 sm:px-4 ${
                dragIndex === i ? "bg-accent-soft" : ""
              }`}
            >
              <span className="w-7 shrink-0 text-right text-lg font-bold tabular-nums text-ink">
                {i + 1}
              </span>
              <GripVertical
                size={16}
                aria-hidden="true"
                className="shrink-0 cursor-grab text-ink-subtle"
              />
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
                <TeamLineupHover teamName={team} week={week} snapshot={snapshot} />
                {record && (
                  <span className="text-xs text-ink-subtle">
                    {record.record} · {record.pointsFor.toFixed(1)} PF · #
                    {record.standingsRank} in standings
                  </span>
                )}
                {snapshot && (
                  <span className="inline-flex items-baseline gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                    <span className="font-mono font-semibold tabular-nums">
                      {snapshot.projectedPoints.toFixed(1)}
                    </span>
                    <span className="font-medium">proj wk {week}</span>
                  </span>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
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
    </div>
  );
}
