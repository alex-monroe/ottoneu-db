/**
 * The headline score is ESPN's live total while games are on and the matchup
 * is unsettled, with Ottoneu's beside it; Ottoneu's alone otherwise.
 */
import { isSettled, liveTotalsOf, officialScores, shownScore } from "@/lib/live-score";
import type { LiveGame, SideTotals } from "@/lib/live-matchup";
import type { ScoreSnapshot } from "@/lib/score-worm";

const totals = (over: Partial<SideTotals> = {}): SideTotals => ({
  actual: 50,
  pregame: 100,
  live: 110,
  starters: 9,
  finished: 3,
  playing: 2,
  toPlay: 4,
  unprojected: 0,
  ...over,
});

const game = (home: Partial<SideTotals>, away: Partial<SideTotals>): LiveGame => ({
  game_id: 7,
  home: { team_name: "Alpha", entries: [], totals: totals(home) },
  away: { team_name: "Beta", entries: [], totals: totals(away) },
  scrapedAt: null,
});

const snap = (at: string, home: number, away: number): ScoreSnapshot => ({
  scraped_at: at,
  home_points: home,
  away_points: away,
});

describe("liveTotalsOf", () => {
  const snapshots = [snap("2026-11-01T17:00:00Z", 0, 0), snap("2026-11-01T18:05:00Z", 21.5, 9.2)];

  it("is the end of a live worm", () => {
    expect(liveTotalsOf({ source: "live", snapshots })).toEqual({
      home: 21.5,
      away: 9.2,
      at: "2026-11-01T18:05:00Z",
    });
  });

  it("is nothing for a worm rebuilt from nflverse, or from scrapes", () => {
    expect(liveTotalsOf({ source: "plays", snapshots })).toBeNull();
    expect(liveTotalsOf({ source: "scrapes", snapshots })).toBeNull();
    expect(liveTotalsOf({ source: "live", snapshots: [] })).toBeNull();
  });
});

describe("officialScores", () => {
  it("sums the box score's starters", () => {
    expect(officialScores({ home_score: 40, away_score: 30 }, game({ actual: 51.2 }, { actual: 33 }))).toEqual({
      home: 51.2,
      away: 33,
    });
  });

  it("falls back to the schedule's score without a box score", () => {
    expect(officialScores({ home_score: 40, away_score: null }, null)).toEqual({ home: 40, away: 0 });
    expect(officialScores({ home_score: 40, away_score: 30 }, game({ starters: 0 }, {}))).toEqual({
      home: 40,
      away: 50,
    });
  });
});

describe("isSettled", () => {
  it("is settled once final", () => {
    expect(isSettled("final", null)).toBe(true);
  });

  it("is settled once every starter on both sides is done", () => {
    const done = { playing: 0, toPlay: 0, finished: 9 };
    expect(isSettled("in_progress", game(done, done))).toBe(true);
    expect(isSettled("in_progress", game(done, { playing: 1 }))).toBe(false);
  });

  it("is not settled without a box score, or with an empty lineup", () => {
    expect(isSettled("in_progress", null)).toBe(false);
    const empty = { starters: 0, playing: 0, toPlay: 0, finished: 0 };
    expect(isSettled("in_progress", game(empty, empty))).toBe(false);
  });
});

describe("shownScore", () => {
  const official = { home: 44.6, away: 99.88 };
  const live = { home: 51.6, away: 104.46, at: "2026-11-01T21:21:55Z" };

  it("leads with ESPN's total, Ottoneu's beside it, while games are on", () => {
    expect(shownScore({ official, live, gamesAreLive: true, settled: false })).toEqual({
      home: 51.6,
      away: 104.46,
      official,
      liveAt: live.at,
    });
  });

  it("is Ottoneu's alone once settled, when the loop has stopped, or with no live total", () => {
    const ottoneu = { ...official, official: null, liveAt: null };
    expect(shownScore({ official, live, gamesAreLive: true, settled: true })).toEqual(ottoneu);
    expect(shownScore({ official, live, gamesAreLive: false, settled: false })).toEqual(ottoneu);
    expect(shownScore({ official, live: null, gamesAreLive: true, settled: false })).toEqual(ottoneu);
  });
});
