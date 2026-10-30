/**
 * League-format fixtures: each JSON file is one head-to-head game in the
 * package's input shape (slots, real-game clocks, scoring events). Clocks are
 * stored compactly (start, wall-clock minutes, game length) and expanded here
 * into 13 evenly spaced samples — the parity script expands them the same way.
 */

import type { GameClock, RebuildInput, ScoringEvent, Slot } from "../src";
import nba from "./espn-nba-h2h-points-week.json";
import ottoneu from "./ottoneu-superflex-half-ppr.json";

interface FixtureFile {
  format: string;
  sd: number;
  games: Record<string, { start: string; wallMinutes: number; length: number }>;
  slots: Slot[];
  events: ScoringEvent[];
  close: { at: string; note: string };
}

export interface Fixture {
  name: string;
  format: string;
  input: RebuildInput;
}

// JSON gives `side` as a plain string, hence the `unknown` casts below.
const SAMPLES = 12;

const iso = (msSinceEpoch: number) => new Date(msSinceEpoch).toISOString().replace(".000Z", "Z");

function clock(start: string, wallMinutes: number, length: number): GameClock {
  const t0 = Date.parse(start);
  const steps = Array.from({ length: SAMPLES + 1 }, (_, i) => i);
  return {
    times: steps.map((i) => iso(t0 + (wallMinutes * 60_000 * i) / SAMPLES)),
    elapsed: steps.map((i) => (length * i) / SAMPLES),
    length,
  };
}

function load(name: string, file: FixtureFile): Fixture {
  const clocks = Object.fromEntries(
    Object.entries(file.games).map(([id, g]) => [id, clock(g.start, g.wallMinutes, g.length)]),
  );
  return {
    name,
    format: file.format,
    input: { slots: file.slots, clocks, events: file.events, sd: file.sd, close: file.close },
  };
}

export const OTTONEU_SUPERFLEX = load("ottoneu-superflex-half-ppr", ottoneu as unknown as FixtureFile);
export const NBA_H2H_POINTS = load("espn-nba-h2h-points-week", nba as unknown as FixtureFile);

export const FIXTURES = [OTTONEU_SUPERFLEX, NBA_H2H_POINTS];
