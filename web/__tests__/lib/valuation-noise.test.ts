/**
 * The private-valuation primitives shared by both draft tools.
 *
 * The avalanche test here is the important one: plain FNV-1a barely mixes its
 * last byte, so structured player ids ("WR1", "WR2", …) all hashed to nearly
 * the same number and every manager ended up with the same opinion of every
 * player — the noise slider looked wired up and did nothing.
 */
import {
  hash32,
  MAX_VALUATION_SPREAD,
  NO_VALUATION_NOISE,
  randomValuationSeed,
  valuationMultiplier,
} from "@/lib/valuation-noise";

describe("hash32", () => {
  it("avalanches on keys that differ only in the last character", () => {
    const keys = Array.from({ length: 60 }, (_, i) => `7|Team 3|WR${i}`);
    const us = keys.map((k) => hash32(k) / 2 ** 32);
    // a well-mixed hash spreads these across the unit interval; the unfixed
    // one packed them into a window about 0.004 wide
    expect(Math.max(...us) - Math.min(...us)).toBeGreaterThan(0.8);
    // …and it should not be monotone in the trailing digit either
    const ascending = us.every((u, i) => i === 0 || u >= us[i - 1]);
    expect(ascending).toBe(false);
  });

  it("is stable and unsigned", () => {
    expect(hash32("abc")).toBe(hash32("abc"));
    expect(hash32("abc")).not.toBe(hash32("abd"));
    for (const k of ["", "a", "a longer key with spaces"]) {
      expect(hash32(k)).toBeGreaterThanOrEqual(0);
      expect(hash32(k)).toBeLessThan(2 ** 32);
    }
  });
});

describe("valuationMultiplier", () => {
  it("is exactly 1 when the noise is off", () => {
    expect(valuationMultiplier("Team 3", "WR1", NO_VALUATION_NOISE)).toBe(1);
    expect(valuationMultiplier("Team 3", "WR1", { spread: 0, seed: 42 })).toBe(1);
  });

  it("stays inside the spread, and clamps a spread beyond the maximum", () => {
    for (let i = 0; i < 200; i++) {
      const m = valuationMultiplier(`Team ${i}`, `WR${i}`, { spread: 5, seed: 1 });
      expect(m).toBeGreaterThanOrEqual(1 - MAX_VALUATION_SPREAD);
      expect(m).toBeLessThanOrEqual(1 + MAX_VALUATION_SPREAD);
    }
  });

  it("covers the spread rather than clustering", () => {
    const ms = Array.from({ length: 200 }, (_, i) =>
      valuationMultiplier("Team 3", `WR${i}`, { spread: 0.5, seed: 9 }),
    );
    const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
    expect(mean).toBeCloseTo(1, 1);
    expect(Math.min(...ms)).toBeLessThan(0.6);
    expect(Math.max(...ms)).toBeGreaterThan(1.4);
  });

  it("is stable per (seed, team, player) and independent across each", () => {
    const m = valuationMultiplier("Team 3", "WR1", { spread: 0.5, seed: 9 });
    expect(valuationMultiplier("Team 3", "WR1", { spread: 0.5, seed: 9 })).toBe(m);
    expect(valuationMultiplier("Team 4", "WR1", { spread: 0.5, seed: 9 })).not.toBe(m);
    expect(valuationMultiplier("Team 3", "WR2", { spread: 0.5, seed: 9 })).not.toBe(m);
    expect(valuationMultiplier("Team 3", "WR1", { spread: 0.5, seed: 10 })).not.toBe(m);
  });
});

describe("randomValuationSeed", () => {
  it("draws a fresh non-negative integer", () => {
    const seeds = new Set(Array.from({ length: 50 }, randomValuationSeed));
    expect(seeds.size).toBeGreaterThan(40);
    for (const s of seeds) expect(Number.isInteger(s) && s >= 0).toBe(true);
  });
});
