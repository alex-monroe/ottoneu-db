/**
 * The worm's league-independent options (src/worm.ts). The Ottoneu behaviour
 * itself is covered by web/__tests__/lib/score-worm.test.ts through the adapter.
 */

import { buildMinutesWorm, buildWorm, dayTicks, progressLabel, wormChart, type ScoreFrame } from "../src";

const FRAMES: ScoreFrame[] = [
  { at: "2026-09-13T17:30:00Z", left: 12, right: 4 },
  { at: "2026-09-11T00:30:00Z", left: 0, right: 6.5 },
  { at: "2026-09-15T01:00:00Z", left: 41, right: 33 },
];

describe("labels", () => {
  it("default to UTC and 'Start'", () => {
    const points = buildWorm(FRAMES);
    expect(points.map((p) => p.label)).toEqual(["Start", "Fri 12:30 AM", "Sun 5:30 PM", "Tue 1:00 AM"]);
    expect(dayTicks(points).map((t) => t.label)).toEqual(["Fri", "Sun", "Tue"]);
  });

  it("follow the league's time zone, locale and origin label", () => {
    const options = { timeZone: "Europe/London", locale: "en-GB", originLabel: "Kick-off" };
    const points = buildWorm(FRAMES, options);
    expect(points[0].label).toBe("Kick-off");
    expect(points[1].label).toBe("Fri 01:30");
    expect(dayTicks(points, options).map((t) => t.label)).toEqual(["Fri", "Sun", "Tue"]);
  });
});

describe("progressLabel", () => {
  it("reads '<1%' for a sliver, with a configurable suffix", () => {
    expect(progressLabel(48.4)).toBe("48% played");
    expect(progressLabel(0.4, "of innings")).toBe("<1% of innings");
  });

  it("is what the progress view uses unless told otherwise", () => {
    const frames = FRAMES.map((f, i) => ({ ...f, leftProgress: (i + 1) / 3, rightProgress: (i + 1) / 3 }));
    expect(buildMinutesWorm(frames)[1].label).toMatch(/% played$/);
    expect(buildMinutesWorm(frames, (pct) => `${pct}`)[1].label).toBe("33.33");
  });
});

describe("wormChart notes", () => {
  it("append the caller's sentence to each summary", () => {
    const chart = wormChart(FRAMES, "Alpha", "Beta", { notes: { clock: "Polled every 5 minutes." } })!;
    expect(chart.summary).toBe(
      "Lead changed hands 1 time · biggest leads: Alpha 8.00, Beta 6.50. Polled every 5 minutes.",
    );
    expect(wormChart(FRAMES, "Alpha", "Beta")!.summary).toBe(
      "Lead changed hands 1 time · biggest leads: Alpha 8.00, Beta 6.50.",
    );
  });
});

describe("settled final frame", () => {
  const played = (at: string, left: number, right: number, share: number, winProb: number): ScoreFrame => ({
    at, left, right, leftProgress: share, rightProgress: share, leftWinProb: winProb,
  });

  it("is kept even when it repeats the last score, so the win line ends at 0 or 100", () => {
    const points = buildWorm([
      played("2026-09-13T17:00:00Z", 10, 3, 0.5, 0.7),
      played("2026-09-13T18:00:00Z", 20, 3, 0.9, 0.95),
      played("2026-09-13T19:00:00Z", 20, 3, 1, 1),
    ]);
    expect(points.map((p) => p.winPct)).toEqual([null, 70, 95, 100]);
  });

  it("is still dropped as a repeat when it is not the last frame or not settled", () => {
    expect(
      buildWorm([
        played("2026-09-13T17:00:00Z", 10, 3, 0.5, 0.7),
        played("2026-09-13T18:00:00Z", 20, 3, 0.9, 0.95),
        played("2026-09-13T19:00:00Z", 20, 3, 0.95, 0.97),
      ]),
    ).toHaveLength(3);
  });
});
