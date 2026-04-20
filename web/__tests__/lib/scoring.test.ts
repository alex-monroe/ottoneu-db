/**
 * Unit tests for Ottoneu Half-PPR scoring formula.
 *
 * Each test isolates a single scoring rule so regressions to any one
 * coefficient surface as a named failure rather than a generic total mismatch.
 * Fixtures match the weights in config.json (the single source of truth).
 */
import { calculateFantasyPoints } from "@/lib/scoring";

describe("calculateFantasyPoints — per-rule fixtures", () => {
    test("empty stat line scores 0", () => {
        expect(calculateFantasyPoints({})).toBe(0);
    });

    test("passing yards at 0.04 per yard", () => {
        expect(calculateFantasyPoints({ passing_yards: 300 })).toBeCloseTo(12, 5);
    });

    test("passing touchdown at 4 points", () => {
        expect(calculateFantasyPoints({ passing_tds: 3 })).toBe(12);
    });

    test("interception at -2 points", () => {
        expect(calculateFantasyPoints({ interceptions: 2 })).toBe(-4);
    });

    test("rushing yards at 0.1 per yard", () => {
        expect(calculateFantasyPoints({ rushing_yards: 100 })).toBeCloseTo(10, 5);
    });

    test("rushing touchdown at 6 points", () => {
        expect(calculateFantasyPoints({ rushing_tds: 2 })).toBe(12);
    });

    test("receptions at 0.5 per catch (half PPR)", () => {
        expect(calculateFantasyPoints({ receptions: 7 })).toBeCloseTo(3.5, 5);
    });

    test("receiving yards at 0.1 per yard", () => {
        expect(calculateFantasyPoints({ receiving_yards: 150 })).toBeCloseTo(15, 5);
    });

    test("receiving touchdown at 6 points", () => {
        expect(calculateFantasyPoints({ receiving_tds: 2 })).toBe(12);
    });

    test("field goal 0–39 yds at 3 points", () => {
        expect(calculateFantasyPoints({ fg_made_0_39: 3 })).toBe(9);
    });

    test("field goal 40–49 yds at 4 points", () => {
        expect(calculateFantasyPoints({ fg_made_40_49: 2 })).toBe(8);
    });

    test("field goal 50+ yds at 5 points", () => {
        expect(calculateFantasyPoints({ fg_made_50_plus: 2 })).toBe(10);
    });

    test("PAT made at 1 point", () => {
        expect(calculateFantasyPoints({ pat_made: 4 })).toBe(4);
    });
});

describe("calculateFantasyPoints — combined stat lines", () => {
    test("realistic QB line (300 pass yds, 2 pass TD, 1 INT, 20 rush yds)", () => {
        const points = calculateFantasyPoints({
            passing_yards: 300,
            passing_tds: 2,
            interceptions: 1,
            rushing_yards: 20,
        });
        // 300*0.04 + 2*4 + 1*-2 + 20*0.1 = 12 + 8 - 2 + 2 = 20
        expect(points).toBeCloseTo(20, 5);
    });

    test("realistic RB line (100 rush yds, 1 rush TD, 4 catches, 30 rec yds)", () => {
        const points = calculateFantasyPoints({
            rushing_yards: 100,
            rushing_tds: 1,
            receptions: 4,
            receiving_yards: 30,
        });
        // 10 + 6 + 2 + 3 = 21
        expect(points).toBeCloseTo(21, 5);
    });

    test("realistic kicker line (2x 0-39, 1x 40-49, 1x 50+, 3 PATs)", () => {
        const points = calculateFantasyPoints({
            fg_made_0_39: 2,
            fg_made_40_49: 1,
            fg_made_50_plus: 1,
            pat_made: 3,
        });
        // 6 + 4 + 5 + 3 = 18
        expect(points).toBeCloseTo(18, 5);
    });

    test("missing fields treated as 0 (partial stat line)", () => {
        // Only specify some fields; others must not contribute NaN.
        const points = calculateFantasyPoints({ passing_tds: 1 });
        expect(points).toBe(4);
        expect(Number.isNaN(points)).toBe(false);
    });
});
