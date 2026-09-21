/**
 * Unit tests for the stat window — `web/lib/stat-window.ts`.
 *
 * The bug this whole module exists for: `player_stats` is keyed
 * `(player_id, season)` and holds season-to-date totals, so a row for a season in
 * progress is the same shape as one for a finished season. Since
 * `pull-player-stats.yml` started running every Tuesday during the season, the
 * code that said "the #12 WR averaged 13.4 PPG last year" says the same thing off
 * two Sundays, and nothing in the data objects.
 *
 * The guarantee worth guarding hardest is the no-op: a completed season must take
 * the `fraction === 1` path so the retrospective pages cannot change behaviour.
 */

import {
  buildStatWindow,
  completedWeeks,
  fullSeasonWindow,
  observedGames,
  type ScheduledWeek,
} from "@/lib/stat-window";
import { FULL_SEASON_GAMES } from "@/lib/config";

describe("observedGames", () => {
  it("reads the depth of a live season off the rows", () => {
    // Week 2: most of the league has two games, a few have one.
    const rows = [...Array(200).fill(2), ...Array(20).fill(1)];
    expect(observedGames(rows)).toBe(2);
  });

  it("reaches a full season once one has been played", () => {
    const rows = [
      ...Array(300).fill(17),
      ...Array(200).fill(15),
      ...Array(100).fill(6),
    ];
    expect(observedGames(rows)).toBe(FULL_SEASON_GAMES);
  });

  it("ignores players who have not played", () => {
    // College prospects and inactives carry 0 and must not drag the depth down.
    expect(observedGames([0, 0, 0, 0, 0, 0, 0, 0, 0, 3])).toBe(3);
  });

  it("is not moved by a single impossible row", () => {
    // One stale 17-game row in a two-game season must not claim a full season.
    const rows = [...Array(200).fill(2), 17];
    expect(observedGames(rows)).toBe(2);
  });

  it("never exceeds a full season", () => {
    expect(observedGames([40, 40, 40])).toBe(FULL_SEASON_GAMES);
  });

  it("returns null when nothing has been played", () => {
    // Kickoff has not happened, or the stats pull has not run. There is no
    // production to describe, and the caller should show its own empty state.
    expect(observedGames([])).toBeNull();
    expect(observedGames([0, 0, 0])).toBeNull();
  });
});

describe("completedWeeks", () => {
  function week(n: number, statuses: ScheduledWeek["status"][]): ScheduledWeek[] {
    return statuses.map((status) => ({ week: n, status, game_type: "regular" }));
  }

  it("counts only weeks whose games have all finished", () => {
    const matchups = [
      ...week(1, ["final", "final", "final"]),
      // Week 2 is being played: its production is partly missing from
      // player_stats, so counting it would overstate the window.
      ...week(2, ["final", "in_progress", "scheduled"]),
      ...week(3, ["scheduled", "scheduled", "scheduled"]),
    ];
    expect(completedWeeks(matchups)).toBe(1);
  });

  it("ignores playoff games, which are not part of the regular season", () => {
    const matchups: ScheduledWeek[] = [
      ...week(1, ["final", "final"]),
      { week: 15, status: "final", game_type: "playoff" },
      { week: 16, status: "final", game_type: "championship" },
    ];
    expect(completedWeeks(matchups)).toBe(1);
  });

  it("is zero before kickoff and on an empty schedule", () => {
    expect(completedWeeks(week(1, ["scheduled", "scheduled"]))).toBe(0);
    expect(completedWeeks([])).toBe(0);
  });
});

describe("buildStatWindow — the no-op guarantee", () => {
  it("pins a completed season to a full-season frame", () => {
    const w = buildStatWindow({ season: 2025, complete: true });
    expect(w.fraction).toBe(1);
    expect(w.games).toBe(FULL_SEASON_GAMES);
    expect(w.complete).toBe(true);
  });

  it("ignores the rows entirely when the season is complete", () => {
    // Even a table that only holds two games of a finished season must not put
    // the retrospective pages onto the prorated path — the calendar is the
    // authority on whether a season is over, not the row contents.
    const w = buildStatWindow({
      season: 2025,
      complete: true,
      gamesPlayed: [2, 2, 2],
    });
    expect(w.fraction).toBe(1);
    expect(w.games).toBe(FULL_SEASON_GAMES);
  });

  it("treats a live season that has run its full length as complete", () => {
    // Week 18: there is no partial-season caveat left to make.
    const w = buildStatWindow({
      season: 2026,
      complete: false,
      gamesPlayed: Array(300).fill(17),
      weeksPlayed: 18,
    });
    expect(w.complete).toBe(true);
    expect(w.fraction).toBe(1);
  });
});

describe("buildStatWindow — a season in progress", () => {
  const week2 = buildStatWindow({
    season: 2026,
    complete: false,
    gamesPlayed: Array(200).fill(2),
    weeksPlayed: 2,
  });

  it("scales to the football actually played", () => {
    expect(week2.games).toBe(2);
    expect(week2.fraction).toBeCloseTo(2 / FULL_SEASON_GAMES, 10);
    expect(week2.complete).toBe(false);
  });

  it("says which week it is through, for the label", () => {
    expect(week2.label).toBe("2026 through Week 2");
    expect(week2.shortLabel).toBe("2026 to date");
  });

  it("labels a finished season as the season", () => {
    expect(fullSeasonWindow(2025).label).toBe("2025 season");
    expect(fullSeasonWindow(2025).shortLabel).toBe("2025");
  });

  it("falls back to a week-free label when the schedule is unknown", () => {
    // league_matchups has no rows for the season yet — the window is still
    // correct, it just cannot name a week.
    const w = buildStatWindow({
      season: 2026,
      complete: false,
      gamesPlayed: [3, 3, 3],
      weeksPlayed: null,
    });
    expect(w.label).toBe("2026 to date");
    expect(w.games).toBe(3);
  });

  it("scales nothing when no football has been played", () => {
    // `fraction` 0 rather than 1: a caller that forgets to check gets zeroed
    // dollars, never a full season's money handed out over an empty table.
    const w = buildStatWindow({ season: 2026, complete: false, gamesPlayed: [] });
    expect(w.games).toBe(0);
    expect(w.fraction).toBe(0);
    expect(w.complete).toBe(false);
  });
});
