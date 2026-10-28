/**
 * The worm's hurricane cone (web/lib/worm-cone.ts) — 80% bands from any moment.
 */

import { buildMinutesWorm, buildWorm, flipSnapshots, type ScoreSnapshot } from "@/lib/score-worm";
import { CONE_Z, coneFrom, finalRanges, hasCone, minutesConePoints } from "@/lib/worm-cone";

// A rebuilt game: Kickoff row, then plays, each with both sides' projected
// points still to come and share of lineup minutes played.
const row = (
  at: string,
  home: number,
  away: number,
  homeRemaining: number,
  awayRemaining: number,
  homeProgress: number,
  awayProgress: number,
): ScoreSnapshot => ({
  scraped_at: at,
  home_points: home,
  away_points: away,
  home_proj_remaining: homeRemaining,
  away_proj_remaining: awayRemaining,
  home_progress: homeProgress,
  away_progress: awayProgress,
  home_win_prob: 0.5,
});

const GAME = buildWorm([
  row("2026-09-13T17:00:00Z", 0, 0, 100, 90, 0, 0), // Kickoff → the origin
  row("2026-09-13T19:00:00Z", 30, 10, 60, 80, 0.4, 0.1),
  row("2026-09-14T02:00:00Z", 55, 50, 40, 40, 0.75, 0.5),
  row("2026-09-15T03:00:00Z", 98, 92, 0, 0, 1, 1),
]);

const half = (sd: number, share: number) => CONE_Z * sd * Math.sqrt(share);
const r2 = (n: number) => Math.round(n * 100) / 100;

describe("hasCone", () => {
  it("needs projected-remaining and progress on every point", () => {
    expect(hasCone(GAME)).toBe(true);
    const scrapes = buildWorm([
      { scraped_at: "2026-09-13T19:00:00Z", home_points: 5, away_points: 0 },
      { scraped_at: "2026-09-13T20:00:00Z", home_points: 9, away_points: 3 },
    ]);
    expect(hasCone(scrapes)).toBe(false);
    expect(coneFrom(scrapes, 0)).toEqual([]);
    expect(finalRanges(scrapes, 0)).toBeNull();
  });
});

describe("coneFrom", () => {
  it("starts with no width at the hovered point and only looks forward", () => {
    const cone = coneFrom(GAME, 1, 20);
    expect(cone[0]).toEqual({ leftBand: null, rightBand: null });
    expect(cone[1]).toEqual({ leftBand: [30, 30], rightBand: [10, 10] });
  });

  it("centres on score now + projection that comes off the board, widening with minutes played", () => {
    const cone = coneFrom(GAME, 1, 20);
    // Left at point 2: 30 + (60 − 40) = 50, spread over 0.75 − 0.4 of the lineup.
    const h = half(20, 0.35);
    expect(cone[2].leftBand).toEqual([r2(50 - h), r2(50 + h)]);
    // Right at the end: 10 + 80 = 90, over 1 − 0.1 of the lineup.
    const hr = half(20, 0.9);
    expect(cone[3].rightBand).toEqual([r2(90 - hr), r2(90 + hr)]);
  });

  it("is narrower the later it is hovered", () => {
    const width = (b: [number, number] | null) => b![1] - b![0];
    expect(width(coneFrom(GAME, 0, 20)[3].leftBand)).toBeGreaterThan(width(coneFrom(GAME, 2, 20)[3].leftBand));
  });

  it("never goes below zero", () => {
    expect(coneFrom(GAME, 0, 200)[3].leftBand![0]).toBe(0);
  });
});

describe("finalRanges", () => {
  it("is the whole remaining projection ± the uncertainty of every minute left", () => {
    const h = half(20, 1 - 0.75);
    expect(finalRanges(GAME, 2, 20)!.left).toEqual([r2(55 + 40 - h), r2(55 + 40 + h)]);
    expect(finalRanges(GAME, 3, 20)).toEqual({ left: [98, 98], right: [92, 92] });
  });

  it("follows the flip, so /matchup puts the viewer's cone first", () => {
    const flipped = buildWorm(
      flipSnapshots([
        row("2026-09-13T17:00:00Z", 0, 0, 100, 90, 0, 0),
        row("2026-09-13T19:00:00Z", 30, 10, 60, 80, 0.4, 0.1),
        row("2026-09-15T03:00:00Z", 98, 92, 0, 0, 1, 1),
      ]),
    );
    expect(finalRanges(flipped, 1, 20)!.left).toEqual(finalRanges(GAME, 1, 20)!.right);
  });
});

describe("minutes-played cone", () => {
  // Home plays early, away late — each side's x is its own share of minutes.
  const rows = [
    row("2026-09-13T17:00:00Z", 0, 0, 100, 90, 0, 0), // Kickoff
    row("2026-09-13T19:00:00Z", 30, 0, 60, 90, 0.4, 0),
    row("2026-09-14T02:00:00Z", 30, 40, 60, 45, 0.4, 0.5),
    row("2026-09-15T03:00:00Z", 98, 92, 0, 0, 1, 1),
  ];
  const minutes = buildMinutesWorm(rows);
  const fields = minutesConePoints(minutes);

  it("carries each side's projected points still to come at its own share", () => {
    expect(minutes.map((p) => [p.pct, p.leftRemaining, p.rightRemaining])).toEqual([
      [0, 100, 90], // from the Kickoff row
      [40, 60, 90],
      [50, 60, 45],
      [100, 0, 0],
    ]);
    expect(fields.every((f) => f.leftProgress === f.rightProgress)).toBe(true);
    expect(hasCone(fields)).toBe(true);
  });

  it("widens with the share played since the hovered share", () => {
    const cone = coneFrom(fields, 1, 20); // hovered at 40%
    expect(cone[1].leftBand).toEqual([30, 30]);
    // Right at 50%: 0 + (90 − 45) = 45, spread over 10% of its minutes.
    const h = half(20, 0.1);
    expect(cone[2].rightBand).toEqual([r2(45 - h), r2(45 + h)]);
  });

  it("gives final ranges from the hovered share", () => {
    const h = half(20, 0.6);
    expect(finalRanges(fields, 1, 20)!.left).toEqual([r2(90 - h), r2(90 + h)]);
  });

  it("has no cone when the rows predate projected-remaining", () => {
    const old = buildMinutesWorm(rows.map(({ home_proj_remaining, away_proj_remaining, ...r }) => r));
    expect(hasCone(minutesConePoints(old))).toBe(false);
  });
});
