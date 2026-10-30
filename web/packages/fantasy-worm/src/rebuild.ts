/**
 * Rebuild a game's frames from lineup slots, real-game clocks and scoring
 * events — the platform- and sport-agnostic half of ottoneu-db's
 * scripts/rebuild_score_worm.py. The caller does the platform-specific part
 * (fetching lineups, scoring plays with its league's rules, matching players);
 * this turns the result into frames carrying progress, projected points still
 * to come and win probability.
 *
 * A **slot** is one player's appearance in one real game: an NFL starter is one
 * slot; an NBA starter with three games in the week is three.
 */

import type { ScoreFrame, Side } from "./types";
import { leftWinProbability, winProbability } from "./win-probability";

/** A real game's elapsed game time against wall-clock time. */
export interface GameClock {
  /** Wall-clock sample times, ISO 8601, ascending. */
  times: string[];
  /** Game time elapsed at each sample (any unit), non-decreasing. */
  elapsed: number[];
  /** The game's full length in the same unit, overtime included. */
  length: number;
}

export interface Slot {
  /** Key that scoring events credit. */
  id: string;
  side: Side;
  /** Pre-game projected points for this slot. */
  projected: number;
  /** Key into `clocks`; null for a bye or an unknown game (contributes no progress). */
  game: string | null;
  /** Shown in a frame's note, e.g. "J. Chase". Defaults to `id`. */
  name?: string;
}

export interface ScoringEvent {
  at: string;
  /** Slot id → fantasy points this event earned it (may be negative). */
  points: Record<string, number>;
}

export interface RebuildInput {
  slots: Slot[];
  clocks: Record<string, GameClock>;
  events: ScoringEvent[];
  /** Spread of a full lineup's actual total around its projection. */
  sd: number;
  /** Note on the 0–0 frame before the first score. Default "Kickoff". */
  kickoffNote?: string;
  /**
   * A last, settled frame once every game is over: progress 1, nothing
   * remaining, win probability 1/0/½. `totals` overrides the rebuilt totals
   * (e.g. to match the platform's official final after a stat correction).
   */
  close?: { at: string; note: string; totals?: { left: number; right: number } };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const ms = (iso: string) => Date.parse(iso);

/** Game time elapsed by `at`: 0 before the first sample, the full length from the last. */
export function clockAt(clock: GameClock, at: string): number {
  const when = ms(at);
  let index = -1;
  for (let i = 0; i < clock.times.length; i++) {
    if (ms(clock.times[i]) > when) break;
    index = i;
  }
  if (index < 0) return 0;
  if (index === clock.times.length - 1) return clock.length;
  return clock.elapsed[index];
}

/** Share (0–1, 4 dp) of a side's slots' game time played by `at`; null if none has a clock. */
export function sideProgress(slots: Slot[], clocks: Record<string, GameClock>, at: string): number | null {
  let played = 0;
  let total = 0;
  for (const slot of slots) {
    const clock = slot.game ? clocks[slot.game] : undefined;
    if (!clock) continue;
    played += clockAt(clock, at);
    total += clock.length;
  }
  return total > 0 ? round4(played / total) : null;
}

/** A side's projected points still to come at `at`: each slot's projection × the share of its game unplayed. */
export function sideRemaining(slots: Slot[], clocks: Record<string, GameClock>, at: string): number {
  let remaining = 0;
  for (const slot of slots) {
    const clock = slot.game ? clocks[slot.game] : undefined;
    if (clock) remaining += slot.projected * (1 - clockAt(clock, at) / clock.length);
  }
  return remaining;
}

/**
 * Events → frames: a 0–0 kickoff frame at the earliest game start, then one
 * frame per event that credits a slot in the game, then `close` if given.
 */
export function rebuildFrames(input: RebuildInput): ScoreFrame[] {
  const { slots, clocks, events, sd } = input;
  const bySide = { left: slots.filter((s) => s.side === "left"), right: slots.filter((s) => s.side === "right") };
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const totals = { left: 0, right: 0 };
  const frames: ScoreFrame[] = [];

  const emit = (at: string, note: string) => {
    const leftProgress = sideProgress(bySide.left, clocks, at);
    const rightProgress = sideProgress(bySide.right, clocks, at);
    const leftRemaining = sideRemaining(bySide.left, clocks, at);
    const rightRemaining = sideRemaining(bySide.right, clocks, at);
    frames.push({
      at,
      left: round2(totals.left),
      right: round2(totals.right),
      note,
      leftProgress,
      rightProgress,
      leftWinProb: leftWinProbability(
        { points: totals.left, remaining: leftRemaining, progress: leftProgress },
        { points: totals.right, remaining: rightRemaining, progress: rightProgress },
        sd,
      ),
      leftRemaining: round2(leftRemaining),
      rightRemaining: round2(rightRemaining),
    });
  };

  const sorted = [...events].sort((a, b) => ms(a.at) - ms(b.at));
  for (const event of sorted) {
    const credited = Object.entries(event.points)
      .filter(([id]) => slotById.has(id))
      .map(([id, pts]) => [slotById.get(id)!, pts] as const);
    if (credited.length === 0) continue;
    if (frames.length === 0) {
      const starts = slots
        .map((s) => (s.game ? clocks[s.game]?.times[0] : undefined))
        .filter((t): t is string => t !== undefined);
      const first = [...starts, event.at].reduce((a, b) => (ms(a) <= ms(b) ? a : b));
      emit(first, input.kickoffNote ?? "Kickoff");
    }
    for (const [slot, pts] of credited) totals[slot.side] += pts;
    emit(event.at, credited.map(([slot, pts]) => `${slot.name ?? slot.id} ${pts >= 0 ? "+" : ""}${pts.toFixed(2)}`).join(" · "));
  }

  if (input.close && frames.length > 0) {
    if (input.close.totals) Object.assign(totals, input.close.totals);
    frames.push({
      at: input.close.at,
      left: round2(totals.left),
      right: round2(totals.right),
      note: input.close.note,
      leftProgress: 1,
      rightProgress: 1,
      leftWinProb: winProbability(totals.left - totals.right, 0),
      leftRemaining: 0,
      rightRemaining: 0,
    });
  }
  return frames;
}
