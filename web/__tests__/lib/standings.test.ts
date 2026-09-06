/**
 * Standings, seeding and scoreboard-week derivation (web/lib/standings.ts).
 *
 * These are the calculations that replace a scraped standings table, so the
 * first suite pins them to the league's real 2025 final standings: if this
 * math and Ottoneu's ever disagree, the site is showing a table nobody else
 * sees.
 */

import {
  computePlayoffPicture,
  computeStandings,
  currentScoreboardWeek,
  formatRecord,
  formatStreak,
  weeksIn,
  type Matchup,
} from "@/lib/standings";

let nextGameId = 1;

function game(
  week: number,
  home: string,
  homeScore: number | null,
  away: string,
  awayScore: number | null,
  overrides: Partial<Matchup> = {},
): Matchup {
  const ids: Record<string, number> = {};
  const idFor = (name: string) => {
    ids[name] ??= name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return ids[name];
  };
  return {
    game_id: nextGameId++,
    season: 2026,
    week,
    home_team_id: idFor(home),
    home_team_name: home,
    home_score: homeScore,
    away_team_id: idFor(away),
    away_team_name: away,
    away_score: awayScore,
    status: homeScore == null ? "scheduled" : "final",
    game_type: "regular",
    starts_on: null,
    ends_on: null,
    status_label: null,
    ...overrides,
  };
}

describe("computeStandings", () => {
  it("records a win, a loss and a tie", () => {
    const rows = computeStandings([
      game(1, "A", 100, "B", 90),
      game(2, "A", 80, "B", 95),
      game(3, "A", 70, "B", 70),
    ]);
    const a = rows.find((r) => r.team_name === "A")!;
    expect([a.wins, a.losses, a.ties]).toEqual([1, 1, 1]);
    expect(a.points_for).toBeCloseTo(250);
    expect(a.points_against).toBeCloseTo(255);
  });

  it("breaks a tie on points for, as the league does", () => {
    const rows = computeStandings([
      game(1, "Low", 100, "X", 50),
      game(1, "High", 200, "Y", 50),
    ]);
    expect(rows.map((r) => r.team_name)).toEqual(["High", "Low", "X", "Y"]);
    expect(rows[0].rank).toBe(1);
  });

  it("ignores playoff and consolation games", () => {
    const rows = computeStandings([
      game(1, "A", 100, "B", 90),
      game(15, "A", 10, "B", 200, { game_type: "playoff" }),
      game(16, "A", 10, "B", 200, { game_type: "consolation" }),
      game(17, "A", 10, "B", 200, { game_type: "championship" }),
    ]);
    const a = rows.find((r) => r.team_name === "A")!;
    expect([a.wins, a.losses]).toEqual([1, 0]);
    expect(a.points_for).toBeCloseTo(100);
  });

  it("does not count an in-progress game", () => {
    const rows = computeStandings([
      game(1, "A", 60, "B", 40, { status: "in_progress" }),
    ]);
    const a = rows.find((r) => r.team_name === "A")!;
    expect([a.wins, a.losses, a.points_for]).toEqual([0, 0, 0]);
    expect(a.games_remaining).toBe(1);
  });

  it("lists every scheduled team before a ball is snapped", () => {
    const rows = computeStandings([game(1, "A", null, "B", null)]);
    expect(rows.map((r) => r.team_name).sort()).toEqual(["A", "B"]);
    expect(rows[0].games_remaining).toBe(1);
  });

  it("reads a streak from the most recent games", () => {
    const rows = computeStandings([
      game(1, "A", 100, "B", 90),
      game(2, "A", 50, "B", 90),
      game(3, "A", 50, "B", 90),
    ]);
    expect(rows.find((r) => r.team_name === "A")!.streak).toBe(-2);
    expect(rows.find((r) => r.team_name === "B")!.streak).toBe(2);
  });

  it("reproduces the league's own 2025 final standings", () => {
    // Records and points from https://ottoneu.fangraphs.com/football/309/standings/2025.
    // Reconstructed as one synthetic game per team-week: the ordering, not the
    // schedule, is what is being pinned.
    const finals: [string, number, number, number][] = [
      ["The Roseman Empire", 10, 4, 1772.32],
      ["Marin County Mountain Runners", 9, 5, 1551.32],
      ["The Triple Helix", 8, 6, 1614.16],
      ["The Golden Gouda", 8, 6, 1613.84],
      ["Irish Invasion", 8, 6, 1562.76],
      ["Ball So Hard University", 8, 6, 1476.8],
      ["The Royal Dynasty", 7, 7, 1597.4],
      ["Tinseltown Little Gold Men", 7, 7, 1504.98],
      ["The Trigeminal Thunderclaps", 7, 7, 1449.4],
      ["The Hard Eight", 5, 9, 1438.42],
      ["Pacific Punt Masters", 4, 10, 1454.72],
      ["The Witchcraft", 3, 11, 1251.4],
    ];
    const matchups: Matchup[] = [];
    let week = 1;
    for (const [team, wins, losses, pointsFor] of finals) {
      const per = pointsFor / (wins + losses);
      for (let i = 0; i < wins; i++) {
        matchups.push(game(week++, team, per, `${team} sparring partner`, 0));
      }
      for (let i = 0; i < losses; i++) {
        matchups.push(game(week++, team, per, `${team} sparring partner`, 9999));
      }
    }
    const ranked = computeStandings(matchups)
      .filter((r) => !r.team_name.includes("sparring"))
      .map((r) => r.team_name);
    expect(ranked).toEqual(finals.map(([name]) => name));
  });
});

describe("computePlayoffPicture", () => {
  /** n teams, the first `winners` of them 1-0 and the rest 0-1, with `left` to play. */
  function league(winners: number, teams: number, left: number) {
    const matchups: Matchup[] = [];
    for (let i = 0; i < teams; i += 2) {
      const a = `T${i}`;
      const b = `T${i + 1}`;
      const aWins = i / 2 < winners;
      matchups.push(game(1, a, aWins ? 100 : 50, b, aWins ? 50 : 100));
      for (let w = 0; w < left; w++) matchups.push(game(2 + w, a, null, b, null));
    }
    return computeStandings(matchups);
  }

  it("seeds the field and leaves everyone else out", () => {
    const picture = computePlayoffPicture(league(2, 4, 0), 2);
    expect(picture.seeds.filter((s) => s.in_field).map((s) => s.seed)).toEqual([1, 2]);
    expect(picture.seeds[2].seed).toBeNull();
  });

  it("calls nothing before the first game is final", () => {
    const standings = computeStandings([game(1, "A", null, "B", null)]);
    const picture = computePlayoffPicture(standings, 1);
    expect(picture.started).toBe(false);
    expect(picture.seeds.every((s) => !s.clinched && !s.eliminated)).toBe(true);
  });

  it("seeds nobody before a game is final", () => {
    // Every team is 0-0, so the sort falls through to the alphabetical last
    // resort — "seed 1" would only mean "first name in the alphabet".
    const standings = computeStandings([
      game(1, "Aardvarks", null, "Zebras", null),
    ]);
    const picture = computePlayoffPicture(standings, 1);
    expect(picture.seeds.map((s) => s.seed)).toEqual([null, null]);
    expect(picture.seeds.every((s) => !s.in_field)).toBe(true);
    expect(picture.seeds.every((s) => s.games_back === 0)).toBe(true);
  });

  it("eliminates a team that can no longer reach the field", () => {
    // Two slots, four teams, no games left: the 0-1 teams are out for good.
    const picture = computePlayoffPicture(league(2, 4, 0), 2);
    const out = picture.seeds.filter((s) => s.eliminated).map((s) => s.team_name);
    expect(out.length).toBe(2);
    expect(picture.seeds.filter((s) => s.in_field).every((s) => !s.eliminated)).toBe(true);
  });

  it("stays silent while a chasing team can still catch up", () => {
    const picture = computePlayoffPicture(league(2, 4, 5), 2);
    expect(picture.seeds.some((s) => s.eliminated)).toBe(false);
    expect(picture.seeds.some((s) => s.clinched)).toBe(false);
  });

  it("reports games back for teams outside the field", () => {
    const standings = computeStandings([
      game(1, "A", 100, "B", 50),
      game(2, "A", 100, "B", 50),
    ]);
    const picture = computePlayoffPicture(standings, 1);
    expect(picture.seeds[0].games_back).toBe(0);
    expect(picture.seeds[1].games_back).toBe(2);
  });
});

describe("currentScoreboardWeek", () => {
  const dated = (week: number, starts: string, ends: string, status: Matchup["status"]) =>
    game(week, `H${week}`, null, `A${week}`, null, {
      starts_on: starts,
      ends_on: ends,
      status,
    });

  it("picks the week whose window contains today", () => {
    const matchups = [
      dated(1, "2026-09-09", "2026-09-15", "final"),
      dated(2, "2026-09-16", "2026-09-22", "scheduled"),
      dated(3, "2026-09-23", "2026-09-29", "scheduled"),
    ];
    expect(currentScoreboardWeek(matchups, "2026-09-18")).toBe(2);
  });

  it("falls back to the earliest unfinished week between windows", () => {
    const matchups = [
      dated(1, "2026-09-09", "2026-09-15", "final"),
      dated(2, "2026-09-16", "2026-09-22", "scheduled"),
    ];
    expect(currentScoreboardWeek(matchups, "2026-08-01")).toBe(2);
  });

  it("settles on the last week once everything is final", () => {
    const matchups = [
      dated(1, "2026-09-09", "2026-09-15", "final"),
      dated(2, "2026-09-16", "2026-09-22", "final"),
    ];
    expect(currentScoreboardWeek(matchups, "2027-02-01")).toBe(2);
  });

  it("returns null with no games", () => {
    expect(currentScoreboardWeek([], "2026-09-18")).toBeNull();
  });
});

describe("formatting helpers", () => {
  it("omits ties when there are none", () => {
    expect(formatRecord({ wins: 8, losses: 6, ties: 0 })).toBe("8-6");
    expect(formatRecord({ wins: 8, losses: 5, ties: 1 })).toBe("8-5-1");
  });

  it("renders streaks the usual way", () => {
    expect(formatStreak(3)).toBe("W3");
    expect(formatStreak(-2)).toBe("L2");
    expect(formatStreak(0)).toBe("—");
  });

  it("lists weeks in order", () => {
    expect(weeksIn([game(3, "A", null, "B", null), game(1, "C", null, "D", null)]))
      .toEqual([1, 3]);
  });
});
