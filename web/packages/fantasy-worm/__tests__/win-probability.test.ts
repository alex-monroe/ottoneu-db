/**
 * The win-probability model (src/win-probability.ts), pinned to Python's
 * `statistics.NormalDist`, which scripts/rebuild_score_worm.py uses.
 */

import { leftWinProbability, normalCdf, winProbability } from "../src";

// statistics.NormalDist().cdf(z), Python 3.12.
const PYTHON_CDF: [number, number][] = [
  [-8, 6.106226635438361e-16],
  [-4.5, 3.3976731247387093e-6],
  [-3, 0.0013498980316301035],
  [-2.5, 0.006209665325776159],
  [-1.2816, 0.09999150009767516],
  [-0.5, 0.30853753872598694],
  [0, 0.5],
  [0.3, 0.6179114221889526],
  [1, 0.8413447460685429],
  [2.1, 0.9821355794371834],
  [4.2, 0.9999866542509841],
  [6, 0.9999999990134123],
];

describe("normalCdf", () => {
  it.each(PYTHON_CDF)("matches Python at z = %p", (z, expected) => {
    expect(Math.abs(normalCdf(z) - expected)).toBeLessThan(1e-13);
  });

  it("is symmetric", () => {
    for (const z of [0.1, 1.7, 2.9, 4.3, 7]) expect(normalCdf(z) + normalCdf(-z)).toBeCloseTo(1, 12);
  });
});

describe("winProbability", () => {
  it("is settled when nothing is left to play", () => {
    expect(winProbability(3, 0)).toBe(1);
    expect(winProbability(-3, 0)).toBe(0);
    expect(winProbability(0.004, 0)).toBe(0.5);
  });

  it("is a coin flip on a level expected margin", () => {
    expect(winProbability(0, 400)).toBe(0.5);
  });
});

describe("leftWinProbability", () => {
  it("blends points so far with projections, and shrinks the spread as the lineup plays", () => {
    const early = leftWinProbability(
      { points: 0, remaining: 110, progress: 0 },
      { points: 0, remaining: 100, progress: 0 },
      20,
    );
    const late = leftWinProbability(
      { points: 99, remaining: 11, progress: 0.9 },
      { points: 90, remaining: 10, progress: 0.9 },
      20,
    );
    // 10-point edge: σ = 20√2 before kickoff, 20√0.2 with a tenth left.
    expect(early).toBe(Math.round(normalCdf(10 / Math.sqrt(800)) * 10000) / 10000);
    expect(late).toBe(Math.round(normalCdf(10 / Math.sqrt(80)) * 10000) / 10000);
    expect(late).toBeGreaterThan(early);
  });

  it("adds no uncertainty for a side with unknown progress", () => {
    expect(
      leftWinProbability({ points: 10, remaining: 0, progress: null }, { points: 0, remaining: 0, progress: null }, 20),
    ).toBe(1);
  });
});
