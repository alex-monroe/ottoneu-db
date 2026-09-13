/**
 * Weekly pick'em — `web/lib/pickem.ts`.
 *
 * The promises worth pinning: a week locks Thursday night *Eastern* (noon on
 * Thanksgiving) on both sides of daylight saving; nobody's picks leave the
 * board read before the lock; and the scoring counts only final games, pushes
 * a tie, and shares ranks rather than rewarding skipped games.
 */

import {
  buildBoard,
  displayNameProblem,
  gameWinner,
  isThanksgiving,
  normalizeDisplayName,
  pickemLocksAt,
  pickemOpen,
  pickemRevealed,
  pickResult,
  type PickemPick,
} from "@/lib/pickem";
import type { Matchup } from "@/lib/standings";

// 2026: Week 1 opens Tuesday 2026-09-08 (see community-rankings.test.ts).
const ANCHOR_2026 = "2026-09-08";

function game(
  gameId: number,
  away: [number, string],
  home: [number, string],
  status: Matchup["status"] = "scheduled",
  awayScore: number | null = null,
  homeScore: number | null = null,
): Matchup {
  return {
    game_id: gameId,
    season: 2026,
    week: 2,
    home_team_id: home[0],
    home_team_name: home[1],
    home_score: homeScore,
    away_team_id: away[0],
    away_team_name: away[1],
    away_score: awayScore,
    status,
    game_type: "regular",
    starts_on: "2026-09-16",
    ends_on: "2026-09-22",
    status_label: null,
  };
}

describe("the lock", () => {
  test("Week 1 locks on its Thursday at 20:00 Eastern (EDT, UTC−4)", () => {
    expect(pickemLocksAt(ANCHOR_2026, 1).toISOString()).toBe("2026-09-11T00:00:00.000Z");
  });

  test("each week is seven days on", () => {
    expect(pickemLocksAt(ANCHOR_2026, 2).toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });

  test("after daylight saving ends it is still 20:00 local — 01:00 UTC", () => {
    // DST ends Sunday 2026-11-01; Week 9's Thursday is 2026-11-05.
    expect(pickemLocksAt(ANCHOR_2026, 9).toISOString()).toBe("2026-11-06T01:00:00.000Z");
  });

  test("Thanksgiving week locks at noon, before the 12:30 game", () => {
    // Thanksgiving 2026 is Thursday 2026-11-26 — Week 12.
    expect(isThanksgiving("2026-11-26")).toBe(true);
    expect(pickemLocksAt(ANCHOR_2026, 12).toISOString()).toBe("2026-11-26T17:00:00.000Z");
    expect(isThanksgiving("2026-11-19")).toBe(false);
    expect(isThanksgiving("2027-11-25")).toBe(true);
  });

  const locksAt = pickemLocksAt(ANCHOR_2026, 2);
  const before = new Date(locksAt.getTime() - 60_000);
  const after = new Date(locksAt.getTime() + 60_000);

  test("only the current week is open, and only before its lock", () => {
    expect(pickemOpen(2, 2, locksAt, before)).toBe(true);
    expect(pickemOpen(2, 2, locksAt, locksAt)).toBe(false);
    expect(pickemOpen(2, 2, locksAt, after)).toBe(false);
    expect(pickemOpen(1, 2, locksAt, before)).toBe(false);
    expect(pickemOpen(3, 2, locksAt, before)).toBe(false);
    expect(pickemOpen(2, null, locksAt, before)).toBe(false);
  });

  test("no calendar date means no lock time, and the week stays closed", () => {
    expect(pickemOpen(2, 2, null, before)).toBe(false);
  });

  test("picks are revealed for past weeks, and for the current week once locked", () => {
    expect(pickemRevealed(1, 2, null, before)).toBe(true);
    expect(pickemRevealed(2, 2, locksAt, before)).toBe(false);
    expect(pickemRevealed(2, 2, locksAt, locksAt)).toBe(true);
    // Unknown is not locked.
    expect(pickemRevealed(2, 2, null, after)).toBe(false);
  });
});

describe("results", () => {
  test("only a final game has a winner", () => {
    expect(gameWinner(game(1, [10, "A"], [20, "B"], "in_progress", 90, 40))).toBeNull();
    expect(gameWinner(game(1, [10, "A"], [20, "B"], "final", 90, 40))).toBe(10);
    expect(gameWinner(game(1, [10, "A"], [20, "B"], "final", 40, 90))).toBe(20);
    expect(gameWinner(game(1, [10, "A"], [20, "B"], "final", 50, 50))).toBe("tie");
  });

  test("a pick on a live leader is still pending", () => {
    const live = game(1, [10, "A"], [20, "B"], "in_progress", 90, 40);
    expect(pickResult(live, 10)).toBe("pending");
  });

  test("a tied game is a push for both sides", () => {
    const tied = game(1, [10, "A"], [20, "B"], "final", 50, 50);
    expect(pickResult(tied, 10)).toBe("push");
    expect(pickResult(tied, 20)).toBe("push");
  });
});

describe("buildBoard", () => {
  const games = [
    game(1, [10, "Away One"], [20, "Home One"], "final", 100, 80), // away won
    game(2, [30, "Away Two"], [40, "Home Two"], "final", 70, 90), // home won
    game(3, [50, "Away Three"], [60, "Home Three"], "final", 60, 60), // tie
    game(4, [70, "Away Four"], [80, "Home Four"], "in_progress", 30, 10),
  ];
  const names = new Map([
    ["u-ann", "Ann"],
    ["u-bob", "Bob"],
    ["u-cat", "Cat"],
    ["u-dan", "Dan"],
  ]);
  const picks: PickemPick[] = [
    // Ann: 2 right, a push, one pending.
    { userId: "u-ann", gameId: 1, teamId: 10 },
    { userId: "u-ann", gameId: 2, teamId: 40 },
    { userId: "u-ann", gameId: 3, teamId: 50 },
    { userId: "u-ann", gameId: 4, teamId: 70 },
    // Bob: 1 right, 1 wrong.
    { userId: "u-bob", gameId: 1, teamId: 10 },
    { userId: "u-bob", gameId: 2, teamId: 30 },
    // Cat: 1 right, skipped the rest.
    { userId: "u-cat", gameId: 2, teamId: 40 },
    // Dan: 0 right, 2 wrong.
    { userId: "u-dan", gameId: 1, teamId: 20 },
    { userId: "u-dan", gameId: 2, teamId: 30 },
  ];

  test("before the lock: a player count and nothing else", () => {
    const board = buildBoard(games, picks, names, false, "u-ann");
    expect(board).toEqual({ revealed: false, players: 4, rows: [], splits: [] });
  });

  test("scores right, wrong, push and pending", () => {
    const board = buildBoard(games, picks, names, true);
    const ann = board.rows.find((r) => r.displayName === "Ann")!;
    expect(ann).toMatchObject({ correct: 2, wrong: 0, pushes: 1, pending: 1, picked: 4 });
    const dan = board.rows.find((r) => r.displayName === "Dan")!;
    expect(dan).toMatchObject({ correct: 0, wrong: 2, pushes: 0, pending: 0, picked: 2 });
  });

  test("ranks on points alone, sharing a rank when level — skipping is not rewarded", () => {
    const board = buildBoard(games, picks, names, true);
    expect(board.rows.map((r) => [r.rank, r.displayName])).toEqual([
      [1, "Ann"],
      // Bob (1–1) and Cat (1–0, five skipped) share second; name breaks the display order.
      [2, "Bob"],
      [2, "Cat"],
      [4, "Dan"],
    ]);
  });

  test("marks the viewer's own row, and carries no user ids", () => {
    const board = buildBoard(games, picks, names, true, "u-cat");
    expect(board.rows.filter((r) => r.isViewer).map((r) => r.displayName)).toEqual(["Cat"]);
    expect(JSON.stringify(board)).not.toContain("u-");
  });

  test("splits list who picked each side, by board name", () => {
    const board = buildBoard(games, picks, names, true);
    expect(board.splits.find((s) => s.gameId === 2)).toEqual({
      gameId: 2,
      homePickers: ["Ann", "Cat"],
      awayPickers: ["Bob", "Dan"],
    });
    expect(board.splits.find((s) => s.gameId === 4)).toEqual({
      gameId: 4,
      homePickers: [],
      awayPickers: ["Ann"],
    });
  });

  test("ignores picks for other games, teams not in the game, and unnamed players", () => {
    const stray: PickemPick[] = [
      { userId: "u-ann", gameId: 99, teamId: 10 },
      { userId: "u-bob", gameId: 1, teamId: 999 },
      { userId: "u-nobody", gameId: 1, teamId: 10 },
    ];
    const board = buildBoard(games, stray, names, true);
    expect(board.players).toBe(0);
    expect(board.rows).toEqual([]);
  });
});

describe("board names", () => {
  const teams = ["The Witchcraft", "Irish Invasion"];

  test("collapses whitespace", () => {
    expect(normalizeDisplayName("  Couch   Coach ")).toBe("Couch Coach");
  });

  test("enforces the length", () => {
    expect(displayNameProblem("A", teams, null)).toMatch(/between/);
    expect(displayNameProblem("x".repeat(31), teams, null)).toMatch(/between/);
    expect(displayNameProblem("Couch Coach", teams, null)).toBeNull();
  });

  test("a franchise's name is reserved for its own manager, in any case", () => {
    expect(displayNameProblem("the witchcraft", teams, null)).toMatch(/team in the league/);
    expect(displayNameProblem("The Witchcraft", teams, "Irish Invasion")).toMatch(
      /team in the league/,
    );
    expect(displayNameProblem("The Witchcraft", teams, "The Witchcraft")).toBeNull();
  });
});
