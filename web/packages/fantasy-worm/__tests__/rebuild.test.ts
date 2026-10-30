/**
 * Frames from slots, clocks and events (src/rebuild.ts) — checked against the
 * Python model ottoneu-db runs in production.
 */

import { clockAt, rebuildFrames, sideProgress, type GameClock } from "../src";
import { NBA_H2H_POINTS, OTTONEU_SUPERFLEX } from "../fixtures";
import python from "../fixtures/ottoneu-superflex-half-ppr.python.json";

const CLOCK: GameClock = {
  times: ["2026-09-20T17:00:00Z", "2026-09-20T18:00:00Z", "2026-09-20T20:00:00Z"],
  elapsed: [0, 1500, 3700],
  length: 3700,
};

describe("clockAt", () => {
  it("is 0 before kickoff, steps with the samples, and is the full length from the last", () => {
    expect(clockAt(CLOCK, "2026-09-20T16:00:00Z")).toBe(0);
    expect(clockAt(CLOCK, "2026-09-20T17:59:59Z")).toBe(0);
    expect(clockAt(CLOCK, "2026-09-20T18:30:00Z")).toBe(1500);
    expect(clockAt(CLOCK, "2026-09-21T00:00:00Z")).toBe(3700);
  });
});

describe("sideProgress", () => {
  it("skips slots without a game, and is null when none has one", () => {
    const at = "2026-09-20T18:30:00Z";
    expect(sideProgress([{ id: "a", side: "left", projected: 10, game: "g" }], { g: CLOCK }, at)).toBe(0.4054);
    expect(
      sideProgress(
        [
          { id: "a", side: "left", projected: 10, game: "g" },
          { id: "bye", side: "left", projected: 8, game: null },
        ],
        { g: CLOCK },
        at,
      ),
    ).toBe(0.4054);
    expect(sideProgress([{ id: "bye", side: "left", projected: 8, game: null }], { g: CLOCK }, at)).toBeNull();
  });
});

describe("rebuildFrames — parity with scripts/rebuild_score_worm.py", () => {
  const frames = rebuildFrames({ ...OTTONEU_SUPERFLEX.input, close: undefined });

  it("emits the same frames as the Python model", () => {
    expect(frames).toHaveLength(python.frames.length);
    frames.forEach((f, i) => {
      const p = python.frames[i];
      expect(Date.parse(f.at)).toBe(Date.parse(p.at));
      expect(f.note).toBe(p.note);
      expect([f.left, f.right]).toEqual([p.left, p.right]);
      expect([f.leftRemaining, f.rightRemaining]).toEqual([p.leftRemaining, p.rightRemaining]);
      expect([f.leftProgress, f.rightProgress]).toEqual([p.leftProgress, p.rightProgress]);
      // Python's round() and Math.round can differ in the last place on a tie.
      expect(Math.abs(f.leftWinProb! - p.leftWinProb)).toBeLessThanOrEqual(0.0001);
    });
  });
});

describe("rebuildFrames", () => {
  it("starts with a 0–0 kickoff frame at the first game's start", () => {
    const [kickoff] = rebuildFrames(NBA_H2H_POINTS.input);
    expect(kickoff).toMatchObject({ at: "2026-11-02T00:30:00Z", left: 0, right: 0, note: "Kickoff" });
    expect(kickoff.leftRemaining).toBe(220);
    expect(kickoff.rightRemaining).toBe(194);
  });

  it("ignores events that credit nobody in the game", () => {
    const input = { ...NBA_H2H_POINTS.input, events: [{ at: "2026-11-02T01:00:00Z", points: { someone_else: 40 } }] };
    expect(rebuildFrames(input)).toEqual([]);
  });

  it("closes with a settled frame, optionally at the platform's official totals", () => {
    const frames = rebuildFrames({
      ...NBA_H2H_POINTS.input,
      close: { at: "2026-11-09T02:00:00Z", note: "Stat correction", totals: { left: 300, right: 300 } },
    });
    expect(frames[frames.length - 1]).toMatchObject({
      left: 300,
      right: 300,
      leftProgress: 1,
      rightProgress: 1,
      leftRemaining: 0,
      rightRemaining: 0,
      leftWinProb: 0.5,
    });
  });

  it("writes a negative play with its sign", () => {
    const frames = rebuildFrames({ ...OTTONEU_SUPERFLEX.input, close: undefined });
    expect(frames.find((f) => f.note?.includes("J. Allen -2.00"))?.note).toBe("P. Mahomes +7.00 · J. Allen -2.00");
  });
});
