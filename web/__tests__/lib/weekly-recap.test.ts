/**
 * The weekly recap derivation (web/lib/weekly-recap.ts).
 *
 * The page is read out loud, so the invariants worth pinning are the ones that
 * would put a *false* sentence on air: a player credited with beating a forecast
 * he never had, a bench flop listed as a bust, an "upset" that was actually
 * chalk, or a hindsight lineup that scores worse than the one the manager set.
 */

import {
  benchMissFor,
  busts,
  defaultRecapWeek,
  overachievers,
  recapGames,
  recapPlayers,
  recapWeeks,
  teamWeeks,
  topBench,
  topPerformers,
  unprojectedStarters,
  type RecapPlayer,
} from "@/lib/weekly-recap";
import { groupGames, type LineupEntry } from "@/lib/live-matchup";
import type { Matchup } from "@/lib/standings";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let nextId = 1;

function entry(overrides: Partial<LineupEntry> = {}): LineupEntry {
  return {
    game_id: 1,
    side: "home",
    team_id: 10,
    team_name: "Home",
    ottoneu_id: nextId++,
    player_id: null,
    player_name: `Player ${nextId}`,
    nfl_team: "BUF",
    position: "WR",
    slot: "WR",
    slot_number: 0,
    is_starter: true,
    points: 10,
    game_state: "final",
    game_info: "W 20-17 @MIA",
    injury_status: null,
    stat_line: null,
    projected: 10,
    ...overrides,
  };
}

function player(overrides: Partial<RecapPlayer> = {}): RecapPlayer {
  const points = overrides.points ?? 10;
  const projected = overrides.projected === undefined ? 10 : overrides.projected;
  return {
    ottoneuId: nextId++,
    name: `Player ${nextId}`,
    position: "WR",
    nflTeam: "BUF",
    teamName: "Home",
    slot: "WR",
    isStarter: true,
    points,
    projected,
    surprise: projected == null ? null : points - projected,
    statLine: null,
    gameInfo: null,
    ...overrides,
  };
}

function matchup(overrides: Partial<Matchup> = {}): Matchup {
  return {
    game_id: 1,
    season: 2026,
    week: 1,
    home_team_id: 10,
    home_team_name: "Home",
    home_score: 120,
    away_team_id: 20,
    away_team_name: "Away",
    away_score: 110,
    status: "final",
    game_type: "regular",
    starts_on: "2026-09-09",
    ends_on: "2026-09-15",
    status_label: "Final",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("which week to recap", () => {
  const schedule = [
    matchup({ game_id: 1, week: 1, status: "final" }),
    matchup({ game_id: 2, week: 2, status: "in_progress" }),
    matchup({ game_id: 3, week: 3, status: "scheduled" }),
  ];

  it("offers only weeks with something in them", () => {
    expect(recapWeeks(schedule).map((w) => w.week)).toEqual([1, 2]);
  });

  it("marks a week that is still being played", () => {
    expect(recapWeeks(schedule)).toEqual([
      { week: 1, partial: false },
      { week: 2, partial: true },
    ]);
  });

  // A recap looks backwards. Defaulting to the week in progress would open the
  // page on a league of busts every Sunday afternoon.
  it("defaults to the last finished week, not the one under way", () => {
    expect(defaultRecapWeek(schedule)).toBe(1);
  });

  it("honours a requested week that has games", () => {
    expect(defaultRecapWeek(schedule, 2)).toBe(2);
  });

  it("ignores a requested week with nothing in it", () => {
    expect(defaultRecapWeek(schedule, 3)).toBe(1);
    expect(defaultRecapWeek(schedule, 99)).toBe(1);
  });

  it("has no week to show without a schedule", () => {
    expect(defaultRecapWeek([])).toBeNull();
  });
});

describe("player surprises", () => {
  it("is null for a player who had no forecast, not a beat of zero", () => {
    const games = [...groupGames([entry({ projected: null, points: 22 })]).values()];
    const [p] = recapPlayers(games);
    expect(p.points).toBe(22);
    expect(p.projected).toBeNull();
    expect(p.surprise).toBeNull();
  });

  it("is the gap against the forecast frozen at kickoff", () => {
    const games = [...groupGames([entry({ projected: 19.0, points: 9.82 })]).values()];
    expect(recapPlayers(games)[0].surprise).toBeCloseTo(-9.18);
  });

  it("leaves unforecast players out of both lists", () => {
    const players = [
      player({ name: "No forecast", points: 30, projected: null }),
      player({ name: "Beat it", points: 20, projected: 10 }),
      player({ name: "Missed it", points: 2, projected: 14 }),
    ];
    expect(overachievers(players).map((p) => p.name)).toEqual(["Beat it", "Missed it"]);
    expect(busts(players).map((p) => p.name)).toEqual(["Missed it", "Beat it"]);
    expect(overachievers(players).some((p) => p.name === "No forecast")).toBe(false);
  });

  it("counts starters with no forecast so the page can say what it left out", () => {
    expect(
      unprojectedStarters([
        player({ projected: null }),
        player({ projected: null, isStarter: false }),
        player({ projected: 9 }),
      ]),
    ).toBe(1);
  });

  // The asymmetry is deliberate: a bench blow-up is a story about the manager,
  // a bench flop cost nobody anything.
  it("includes benched players among the overachievers", () => {
    const players = [
      player({ name: "Bench hero", points: 34, projected: 8, isStarter: false }),
      player({ name: "Starter", points: 14, projected: 10 }),
    ];
    expect(overachievers(players)[0].name).toBe("Bench hero");
  });

  it("excludes benched players from the busts", () => {
    const players = [
      player({ name: "Bench dud", points: 0, projected: 15, isStarter: false }),
      player({ name: "Starting dud", points: 3, projected: 12 }),
    ];
    expect(busts(players).map((p) => p.name)).toEqual(["Starting dud"]);
  });

  // No minimum-projection floor is needed: ranking on the raw shortfall already
  // keeps a low-forecast player off the top of the list.
  it("does not let a small forecast outrank a real collapse", () => {
    const players = [
      player({ name: "Fringe", points: 0, projected: 3.2 }),
      player({ name: "Star", points: 4, projected: 18.4 }),
    ];
    expect(busts(players)[0].name).toBe("Star");
  });
});

describe("top performers and the bench", () => {
  const players = [
    player({ name: "Big starter", points: 31 }),
    player({ name: "Big bench", points: 29, isStarter: false }),
    player({ name: "Small starter", points: 4 }),
  ];

  it("counts only started performances — each list is a separate fact", () => {
    expect(topPerformers(players).map((p) => p.name)).toEqual([
      "Big starter",
      "Small starter",
    ]);
    expect(topBench(players).map((p) => p.name)).toEqual(["Big bench"]);
  });
});

describe("what a roster left on its bench", () => {
  const roster: RecapPlayer[] = [
    player({ name: "QB1", position: "QB", slot: "QB", points: 20 }),
    player({ name: "RB1", position: "RB", slot: "RB", points: 12 }),
    player({ name: "RB2", position: "RB", slot: "RB", points: 3 }),
    player({ name: "WR1", position: "WR", slot: "WR", points: 14 }),
    player({ name: "WR2", position: "WR", slot: "WR", points: 9 }),
    player({ name: "TE1", position: "TE", slot: "TE", points: 7 }),
    player({ name: "FLEX", position: "WR", slot: "FLEX", points: 8 }),
    player({ name: "SFLX", position: "QB", slot: "SFLX", points: 11 }),
    player({ name: "K1", position: "K", slot: "K", points: 6 }),
    // The one that should have played: a running back who outscored RB2 by 15.
    player({ name: "Bench RB", position: "RB", slot: "BN", points: 18, isStarter: false }),
  ];

  const miss = benchMissFor("Home", roster);

  it("scores the lineup that was set", () => {
    expect(miss.actual).toBeCloseTo(90);
  });

  it("names the swap that was there to make", () => {
    expect(miss.shouldHaveStarted.map((p) => p.name)).toEqual(["Bench RB"]);
    expect(miss.shouldHaveSat.map((p) => p.name)).toEqual(["RB2"]);
    expect(miss.left).toBeCloseTo(15);
    expect(miss.optimal).toBeCloseTo(105);
  });

  it("never reports a negative miss — the optimum cannot lose to the lineup set", () => {
    const perfect = benchMissFor(
      "Home",
      roster.filter((p) => p.isStarter),
    );
    expect(perfect.left).toBe(0);
    expect(perfect.shouldHaveStarted).toEqual([]);
  });
});

describe("the games", () => {
  const lineups = groupGames([
    entry({ game_id: 1, side: "home", team_name: "Home", points: 60, projected: 70 }),
    entry({ game_id: 1, side: "home", team_name: "Home", points: 60, projected: 70 }),
    entry({ game_id: 1, side: "away", team_name: "Away", points: 55, projected: 50 }),
    entry({ game_id: 1, side: "away", team_name: "Away", points: 55, projected: 50 }),
  ]);

  const [game] = recapGames([matchup({ game_id: 1 })], lineups);

  it("scores each side off the box score's starters, not the stored total", () => {
    expect(game.home.points).toBe(120);
    expect(game.away.points).toBe(110);
    expect(game.margin).toBe(10);
    expect(game.winner).toBe("Home");
  });

  it("measures each side against its own starters' frozen projections", () => {
    expect(game.home.pregame).toBe(140);
    expect(game.home.beat).toBe(-20);
    expect(game.away.beat).toBe(10);
  });

  it("calls it chalk when the favourite wins", () => {
    expect(game.upset).toBe(false);
  });

  it("calls an upset when the lower-projected side wins", () => {
    const [flipped] = recapGames(
      [matchup({ game_id: 1, home_score: 110, away_score: 120 })],
      groupGames([
        entry({ game_id: 1, side: "home", team_name: "Home", points: 110, projected: 140 }),
        entry({ game_id: 1, side: "away", team_name: "Away", points: 120, projected: 100 }),
      ]),
    );
    expect(flipped.winner).toBe("Away");
    expect(flipped.upset).toBe(true);
  });

  // Without both projections there is nothing to have upset, and `false` would
  // read on the page as "chalk".
  it("has no opinion on a game with no stored lineups", () => {
    const [bare] = recapGames([matchup({ game_id: 9 })], new Map());
    expect(bare.upset).toBeNull();
    expect(bare.home.pregame).toBeNull();
    expect(bare.home.points).toBe(120);
  });
});

describe("against the power ranking", () => {
  const games = recapGames(
    [
      matchup({ game_id: 1, home_team_name: "Best", home_score: 140, away_team_name: "Worst", away_score: 80 }),
      matchup({ game_id: 2, home_team_name: "Middle", home_score: 100, away_team_name: "Other", away_score: 90 }),
    ],
    new Map(),
  );

  const ranking = [
    { teamName: "Worst", rank: 1, votes: [{ userId: "a", displayName: "Alex", rank: 1, note: null }] },
    { teamName: "Middle", rank: 2, votes: [] },
    { teamName: "Other", rank: 3, votes: [] },
    { teamName: "Best", rank: 4, votes: [] },
  ];

  const rows = teamWeeks(games, ranking);
  const by = (name: string) => rows.find((r) => r.teamName === name)!;

  it("ranks every team by what it scored, best first", () => {
    expect(rows.map((r) => r.teamName)).toEqual(["Best", "Middle", "Other", "Worst"]);
    expect(by("Best").scoringRank).toBe(1);
    expect(by("Worst").scoringRank).toBe(4);
  });

  it("is positive when a team outscored where the hosts had it", () => {
    // Ranked fourth, scored first.
    expect(by("Best").powerSurprise).toBe(3);
  });

  it("is negative when the ranking was too kind", () => {
    // Ranked first, scored last.
    expect(by("Worst").powerSurprise).toBe(-3);
  });

  it("carries each host's own placement so the row can name who was off", () => {
    expect(by("Worst").votes).toEqual([
      { userId: "a", displayName: "Alex", rank: 1, note: null },
    ]);
  });

  it("records the head-to-head result alongside the scoring rank", () => {
    expect(by("Best").result).toBe("win");
    expect(by("Best").opponent).toBe("Worst");
    expect(by("Worst").result).toBe("loss");
  });

  it("leaves the ranking columns null for a week nobody ranked", () => {
    const unranked = teamWeeks(games);
    expect(unranked.every((r) => r.powerRank === null)).toBe(true);
    expect(unranked.every((r) => r.powerSurprise === null)).toBe(true);
    // The scoring side still works — the page shows the week, minus the segment.
    expect(unranked[0].scoringRank).toBe(1);
  });

  it("gives teams level on points the same scoring rank", () => {
    const tied = teamWeeks(
      recapGames(
        [matchup({ game_id: 1, home_team_name: "A", home_score: 100, away_team_name: "B", away_score: 100 })],
        new Map(),
      ),
    );
    expect(tied.map((r) => r.scoringRank)).toEqual([1, 1]);
    expect(tied.every((r) => r.result === "tie")).toBe(true);
  });
});
