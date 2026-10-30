/**
 * Every view on two different league formats — NFL superflex half PPR
 * (Ottoneu, one game per starter, a bye, overtime) and NBA weekly H2H points
 * (several games per player, 48-minute games) — through the public API only.
 */

import {
  coneFrom,
  finalRanges,
  flipFrames,
  hasCone,
  leadChanges,
  minutesConePoints,
  rebuildFrames,
  wormChart,
} from "../src";
import { FIXTURES, NBA_H2H_POINTS, OTTONEU_SUPERFLEX, type Fixture } from "../fixtures";

const chart = (f: Fixture) => wormChart(rebuildFrames(f.input), "Alpha", "Beta")!;

describe.each(FIXTURES)("$name", (fixture) => {
  const frames = rebuildFrames(fixture.input);
  const worm = chart(fixture);

  it("draws all three views", () => {
    expect(worm).not.toBeNull();
    expect(worm.minutes).not.toBeNull();
    expect(worm.win).not.toBeNull();
    expect(hasCone(worm.points)).toBe(true);
    expect(hasCone(minutesConePoints(worm.minutes!.points))).toBe(true);
  });

  it("only moves forward: progress rises to 1, projections fall to 0", () => {
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].leftProgress!).toBeGreaterThanOrEqual(frames[i - 1].leftProgress!);
      expect(frames[i].rightProgress!).toBeGreaterThanOrEqual(frames[i - 1].rightProgress!);
      expect(frames[i].leftRemaining!).toBeLessThanOrEqual(frames[i - 1].leftRemaining!);
      expect(frames[i].rightRemaining!).toBeLessThanOrEqual(frames[i - 1].rightRemaining!);
    }
    const last = frames[frames.length - 1];
    expect([last.leftProgress, last.rightProgress, last.leftRemaining, last.rightRemaining]).toEqual([1, 1, 0, 0]);
  });

  it("keeps win probability in [0, 100] and the minutes view ending at 100%", () => {
    for (const p of worm.points) {
      expect(p.winPct!).toBeGreaterThanOrEqual(0);
      expect(p.winPct!).toBeLessThanOrEqual(100);
    }
    expect(worm.minutes!.points[worm.minutes!.points.length - 1].pct).toBe(100);
  });

  it("narrows the final-score ranges as the week is played, to the final itself", () => {
    const width = (i: number) => {
      const r = finalRanges(worm.points, i, fixture.input.sd)!;
      return [r.left[1] - r.left[0], r.right[1] - r.right[0]];
    };
    for (let i = 1; i < worm.points.length; i++) {
      expect(width(i)[0]).toBeLessThanOrEqual(width(i - 1)[0] + 0.01);
      expect(width(i)[1]).toBeLessThanOrEqual(width(i - 1)[1] + 0.01);
    }
    const last = finalRanges(worm.points, worm.points.length - 1, fixture.input.sd)!;
    expect(last).toEqual({ left: [worm.left.score, worm.left.score], right: [worm.right.score, worm.right.score] });
  });

  it("closes the cone around each point it is hovered from", () => {
    worm.points.forEach((p, i) => {
      const cone = coneFrom(worm.points, i, fixture.input.sd);
      expect(cone[i].leftBand).toEqual([p.left, p.left].map((n) => Math.max(0, n)));
      expect(cone[i].rightBand).toEqual([p.right, p.right].map((n) => Math.max(0, n)));
      if (i > 0) expect(cone[i - 1].leftBand).toBeNull();
    });
  });

  it("mirrors exactly when the sides are flipped", () => {
    const flipped = wormChart(flipFrames(frames), "Beta", "Alpha")!;
    expect(flipped.points.map((p) => [p.right, p.left])).toEqual(worm.points.map((p) => [p.left, p.right]));
    // Percentages are kept to 0.1, so the two sides can sum to 100 ± 0.1.
    flipped.points.forEach((p, i) => expect(Math.abs(p.winPct! + worm.points[i].winPct! - 100)).toBeLessThan(0.11));
    expect(leadChanges(flipped.points)).toBe(leadChanges(worm.points));
  });
});

describe("format-specific behaviour", () => {
  it("NFL: a starter on bye adds no minutes and no projection", () => {
    const [kickoff] = rebuildFrames(OTTONEU_SUPERFLEX.input);
    // 22.1 + 19.4 + 18.0 + 16.2 + 15.0 + 10.5, without the bye kicker's 8.0.
    expect(kickoff.leftRemaining).toBe(101.2);
  });

  it("NFL: tells the story of the week", () => {
    expect(wormChart(rebuildFrames(OTTONEU_SUPERFLEX.input), "Alpha", "Beta", { timeZone: "America/New_York" })!.win!
      .summary).toBe("Pre-game: Alpha 60%. Beta won after falling to 34% (Mon 9:00 PM).");
  });

  it("NBA: a player's later games keep projecting after his first is over", () => {
    const frames = rebuildFrames(NBA_H2H_POINTS.input);
    const afterMonday = frames.find((f) => f.at === "2026-11-02T02:45:00Z")!;
    // A twelfth of Tatum's Monday game is left, then his Thursday game; Jokic has played neither of his.
    expect(afterMonday.leftRemaining).toBe(48 / 12 + 48 + 62 + 62);
    expect(afterMonday.leftProgress).toBeLessThan(0.3);
  });

  it("NBA: a one-point weekly win settles at 100%", () => {
    const worm = chart(NBA_H2H_POINTS);
    expect([worm.left.score, worm.right.score]).toEqual([218, 217.5]);
    expect(worm.points[worm.points.length - 1].winPct).toBe(100);
    expect(worm.win!.summary).toBe("Pre-game: Alpha 72%. Alpha was favoured throughout.");
  });
});
