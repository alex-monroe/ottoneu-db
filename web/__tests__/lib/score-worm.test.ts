/**
 * The score worm (web/lib/score-worm.ts) — snapshots in, chart series out.
 */

import {
  biggestLeads,
  buildMinutesWorm,
  buildWorm,
  minutesLabel,
  winSummary,
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
    expect(flipSnapshots([snap("t", 1, 2)])).toEqual([
      {
        ...snap("t", 2, 1),
        note: undefined,
        home_progress: undefined,
        away_progress: undefined,
        home_win_prob: undefined,
        home_proj_remaining: undefined,
        away_proj_remaining: undefined,
      },
    ]);
  });

  it("keeps a rebuilt play's note", () => {
    expect(flipSnapshots([{ ...snap("t", 1, 2), note: "J. Chase +9.40" }])[0].note).toBe("J. Chase +9.40");
  });
});

describe("notes", () => {
  it("carry onto worm points; scrapes and the origin have none", () => {
    const points = buildWorm([
      { ...snap("2026-09-13T17:00:00Z", 6.4, 0), note: "C. McCaffrey +6.40" },
      snap("2026-09-13T18:00:00Z", 9, 2),
    ]);
    expect(points.map((p) => p.note)).toEqual([null, "C. McCaffrey +6.40", null]);
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

  it("says where the points came from", () => {
    expect(wormChart(WEEK, "Alpha", "Beta")!.summary).toMatch(/read during game windows/);
    expect(wormChart(WEEK, "Alpha", "Beta", "plays")!.summary).toMatch(
      /One point per scoring play, rebuilt from NFL play-by-play\.$/,
    );
  });

  it("summarises a wire-to-wire game", () => {
    const points = buildWorm([snap("2026-09-13T17:00:00Z", 5, 0), snap("2026-09-13T18:00:00Z", 9, 2)]);
    expect(wormSummary(points, "Alpha", "Beta")).toMatch(
      /^The lead never changed hands · biggest lead: Alpha 7\.00\./,
    );
  });
});

// A rebuilt play: totals plus each side's share (0–1) of lineup minutes played.
const play = (
  at: string,
  home_points: number,
  away_points: number,
  home_progress: number,
  away_progress: number,
): ScoreSnapshot => ({ scraped_at: at, home_points, away_points, home_progress, away_progress });

// Home plays early (1pm games), away late: on the clock away trails all
// afternoon, but at equal shares of their lineups it was level, then ahead.
const LOPSIDED: ScoreSnapshot[] = [
  play("2026-09-13T17:30:00Z", 10, 0, 0.2, 0),
  play("2026-09-13T19:00:00Z", 30, 0, 0.5, 0),
  play("2026-09-14T01:00:00Z", 30, 10, 0.5, 0.2),
  play("2026-09-14T02:00:00Z", 30, 40, 0.5, 0.5),
  play("2026-09-15T02:00:00Z", 50, 40, 1, 0.9),
];

describe("buildMinutesWorm", () => {
  it("reads both sides at the same share of their own lineup minutes", () => {
    const points = buildMinutesWorm(LOPSIDED);
    expect(points.map(({ pct, left, right }) => [pct, left, right])).toEqual([
      [0, 0, 0],
      [20, 10, 10],
      [50, 30, 40], // the 90% read repeats this score, so it is dropped
      [100, 50, 40],
    ]);
    expect(points[2].label).toBe("50% of lineup minutes played");
    expect(points[2].margin).toBe(-10);
  });

  it("is empty for scrapes, which carry no game clock", () => {
    expect(buildMinutesWorm(WEEK)).toEqual([]);
    expect(buildMinutesWorm([])).toEqual([]);
  });

  it("follows the flip, so /matchup draws the viewer first", () => {
    const flipped = buildMinutesWorm(flipSnapshots(LOPSIDED));
    expect(flipped.at(-1)).toMatchObject({ pct: 100, left: 40, right: 50 });
  });

  it("labels a sliver of minutes as under 1%", () => {
    expect(minutesLabel(0.4)).toBe("<1% of lineup minutes played");
    expect(minutesLabel(0)).toBe("0% of lineup minutes played");
  });
});

describe("wormChart minutes view", () => {
  it("is offered for rebuilt plays, with its own summary", () => {
    const chart = wormChart(LOPSIDED, "Alpha", "Beta", "plays")!;
    expect(chart.minutes!.points).toHaveLength(4);
    expect(chart.minutes!.summary).toMatch(/^Lead changed hands 1 time · .*60 per starter, plus any overtime\.$/);
  });

  it("is null for scrapes", () => {
    expect(wormChart(WEEK, "Alpha", "Beta")!.minutes).toBeNull();
  });
});

// Rebuilt plays with win probabilities, behind a 0–0 Kickoff row.
const wp = (at: string, home: number, away: number, p: number, note?: string): ScoreSnapshot => ({
  scraped_at: at,
  home_points: home,
  away_points: away,
  home_win_prob: p,
  note,
});

const COMEBACK: ScoreSnapshot[] = [
  wp("2026-09-13T17:00:00Z", 0, 0, 0.6, "Kickoff"),
  wp("2026-09-13T18:00:00Z", 6, 20, 0.2),
  wp("2026-09-13T21:00:00Z", 10, 40, 0.05),
  wp("2026-09-15T03:00:00Z", 45, 40, 1),
];

describe("win probability", () => {
  it("puts the Kickoff row's pre-game value on the origin and drops the row", () => {
    const points = buildWorm(COMEBACK);
    expect(points.map((p) => p.winPct)).toEqual([60, 20, 5, 100]);
    expect(points[0].label).toBe("Start");
  });

  it("flips with the sides", () => {
    expect(buildWorm(flipSnapshots(COMEBACK)).map((p) => p.winPct)).toEqual([40, 80, 95, 0]);
  });

  it("summarises the pre-game odds and the winner's low point", () => {
    const points = buildWorm(COMEBACK);
    expect(winSummary(points, "Alpha", "Beta")).toMatch(
      /^Pre-game: Alpha 60%\. Alpha won after falling to 5% \(Sun 5:00 PM\)\. Win probability blends/,
    );
    expect(winSummary(buildWorm(flipSnapshots(COMEBACK)), "Beta", "Alpha")).toMatch(
      /^Pre-game: Alpha 60%\. Alpha won after falling to 5%/,
    );
  });

  it("says when the winner was favoured throughout", () => {
    const points = buildWorm([
      wp("2026-09-13T17:00:00Z", 0, 0, 0.7),
      wp("2026-09-13T18:00:00Z", 20, 6, 0.9),
      wp("2026-09-15T03:00:00Z", 45, 40, 1),
    ]);
    expect(winSummary(points, "Alpha", "Beta")).toMatch(/^Pre-game: Alpha 70%\. Alpha was favoured throughout\./);
  });

  it("is offered only when every point has a win probability", () => {
    expect(wormChart(COMEBACK, "Alpha", "Beta", "plays")!.win).not.toBeNull();
    expect(wormChart(WEEK, "Alpha", "Beta")!.win).toBeNull();
  });
});
