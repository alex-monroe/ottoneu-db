/**
 * The score worm (web/lib/score-worm.ts) — snapshots in, chart series out.
 */

import {
  biggestLeads,
  buildWorm,
  dayTicks,
  flipSnapshots,
  leadChanges,
  wormChart,
  wormSummary,
  type ScoreSnapshot,
} from "@/lib/score-worm";

// 2026-09-11 is a Friday in UTC at 00:30 — Thursday 8:30 PM in New York.
const snap = (scraped_at: string, home_points: number, away_points: number): ScoreSnapshot => ({
  scraped_at,
  home_points,
  away_points,
});

const WEEK: ScoreSnapshot[] = [
  snap("2026-09-13T17:30:00Z", 12, 4), // Sun 1:30 PM
  snap("2026-09-11T00:30:00Z", 0, 6.5), // Thu 8:30 PM (out of order on purpose)
  snap("2026-09-11T01:00:00Z", 0, 6.5), // nothing changed
  snap("2026-09-13T18:00:00Z", 20.25, 30.1),
  snap("2026-09-15T01:00:00Z", 41, 33), // Mon 9:00 PM
];

describe("buildWorm", () => {
  it("sorts, drops repeated scores, and starts from 0–0", () => {
    const points = buildWorm(WEEK);
    expect(points.map((p) => [p.left, p.right])).toEqual([
      [0, 0],
      [0, 6.5],
      [12, 4],
      [20.25, 30.1],
      [41, 33],
    ]);
    expect(points[0].at).toBeNull();
    expect(points[0].label).toBe("Start");
    expect(points[1].at).toBe("2026-09-11T00:30:00Z");
    expect(points[1].label).toBe("Thu 8:30 PM");
    expect(points[3].margin).toBeCloseTo(-9.85);
  });

  it("draws nothing from a single score", () => {
    expect(buildWorm([])).toEqual([]);
    expect(buildWorm([snap("2026-09-13T17:30:00Z", 10, 3)])).toEqual([]);
    expect(
      buildWorm([snap("2026-09-13T17:30:00Z", 10, 3), snap("2026-09-13T18:00:00Z", 10, 3)]),
    ).toEqual([]);
  });

  it("keeps a score that goes down — a stat correction is part of the story", () => {
    const points = buildWorm([snap("2026-09-13T17:30:00Z", 10, 3), snap("2026-09-13T18:00:00Z", 8, 3)]);
    expect(points.map((p) => p.left)).toEqual([0, 10, 8]);
  });
});

describe("leadChanges and biggestLeads", () => {
  it("counts each swap of the leader, ignoring ties", () => {
    const points = buildWorm(WEEK); // away leads, home leads, away leads, home leads
    expect(leadChanges(points)).toBe(3);
    expect(biggestLeads(points)).toEqual({ left: 8, right: 9.85 });
  });

  it("a tie in between is not a lead change", () => {
    const points = buildWorm([
      snap("2026-09-13T17:00:00Z", 5, 0),
      snap("2026-09-13T17:30:00Z", 5, 5),
      snap("2026-09-13T18:00:00Z", 9, 5),
    ]);
    expect(leadChanges(points)).toBe(0);
  });
});

describe("dayTicks", () => {
  it("marks the first snapshot of each league-time day", () => {
    expect(dayTicks(buildWorm(WEEK))).toEqual([
      { index: 1, label: "Thu" },
      { index: 2, label: "Sun" },
      { index: 4, label: "Mon" },
    ]);
  });
});

describe("flipSnapshots", () => {
  it("swaps the sides so the viewer can be drawn first", () => {
    expect(flipSnapshots([snap("t", 1, 2)])).toEqual([snap("t", 2, 1)]);
  });
});

describe("wormChart", () => {
  it("carries the latest score and a summary", () => {
    const chart = wormChart(WEEK, "Alpha", "Beta")!;
    expect(chart.left).toEqual({ name: "Alpha", score: 41 });
    expect(chart.right).toEqual({ name: "Beta", score: 33 });
    expect(chart.summary).toMatch(/^Lead changed hands 3 times · biggest leads: Alpha 8\.00, Beta 9\.85\./);
  });

  it("is null without enough history", () => {
    expect(wormChart([], "Alpha", "Beta")).toBeNull();
  });

  it("summarises a wire-to-wire game", () => {
    const points = buildWorm([snap("2026-09-13T17:00:00Z", 5, 0), snap("2026-09-13T18:00:00Z", 9, 2)]);
    expect(wormSummary(points, "Alpha", "Beta")).toMatch(
      /^The lead never changed hands · biggest lead: Alpha 7\.00\./,
    );
  });
});
