import {
  groupOutlooks,
  optionValue,
  outlookAsOf,
  probKeepable,
  readKeeper,
} from "@/lib/keeper-outlook";
import type { KeeperOutlook } from "@/lib/types";

function outlook(playerId: string, asOfWeek: number, quantiles: number[], season = 2026): KeeperOutlook {
  return {
    playerId, season, asOfWeek, valueSeason: season + 1, quantiles,
    mean: quantiles.reduce((s, q) => s + q, 0) / quantiles.length,
    p10: quantiles[2], p50: quantiles[10], p90: quantiles[17],
    ownWeight: 0.5, yearsInLeague: 2, draftBucket: "R1",
  };
}

// A young player's spread: most of the mass cheap, a long upside tail.
const longShot = [1, 1, 1, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 17, 20, 25, 32, 45, 60, 90];

describe("optionValue", () => {
  it("is the mean payoff max(0, V − salary) over the grid", () => {
    expect(optionValue([10, 20, 30, 40], 25)).toBe((0 + 0 + 5 + 15) / 4);
  });

  it("is positive for a long shot whose median is under the salary", () => {
    // Median ≈ $9 against a $20 salary: the point read says $0.
    expect(Math.max(0, longShot[10] - 20)).toBe(0);
    expect(optionValue(longShot, 20)).toBeCloseTo((5 + 12 + 25 + 40 + 70) / 20);
  });

  it("is never negative and falls as the salary rises", () => {
    expect(optionValue(longShot, 500)).toBe(0);
    expect(optionValue(longShot, 5)).toBeGreaterThan(optionValue(longShot, 15));
  });

  it("is zero for an empty grid", () => {
    expect(optionValue([], 5)).toBe(0);
  });
});

describe("probKeepable", () => {
  it("is the share of outcomes above the salary", () => {
    expect(probKeepable(longShot, 20)).toBe(5 / 20);
    // A $1 outcome against a $1 salary is not "worth keeping".
    expect(probKeepable([1, 1, 3, 5], 1)).toBe(0.5);
  });
});

describe("readKeeper", () => {
  it("carries the band and the snapshot it came from", () => {
    const r = readKeeper(outlook("x", 6, longShot), 20);
    expect(r).toMatchObject({ pKeepable: 0.25, p10: 1, p50: 10, p90: 45, asOfWeek: 6, season: 2026 });
    expect(r.optionValue).toBeCloseTo(7.6);
  });
});

describe("outlookAsOf", () => {
  const byPlayer = groupOutlooks([
    outlook("x", 6, longShot),
    outlook("x", 0, longShot),
    outlook("x", 3, longShot),
    outlook("y", 9, longShot),
  ]).get(2026)!;

  it("groups by season and player, oldest week first", () => {
    expect(byPlayer.get("x")!.map((o) => o.asOfWeek)).toEqual([0, 3, 6]);
  });

  it("takes the newest snapshot no later than the week", () => {
    expect(outlookAsOf(byPlayer.get("x"), 5)!.asOfWeek).toBe(3);
    expect(outlookAsOf(byPlayer.get("x"))!.asOfWeek).toBe(6);
  });

  it("is null when nothing was knowable that early", () => {
    expect(outlookAsOf(byPlayer.get("y"), 4)).toBeNull();
    expect(outlookAsOf(undefined, 4)).toBeNull();
  });
});
