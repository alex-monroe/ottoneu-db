/**
 * The live matchup projection (web/lib/live-matchup.ts).
 *
 * Pinned against the real 2026 Week 1 opener: Tinseltown's Drake Maye was
 * projected 19.0 and scored 9.82 in Wednesday's finished game, so the side's
 * live projection must sit exactly that 9.18 below its pre-game total while
 * every other starter is still to play.
 */

import {
  benchOf,
  expectedPoints,
  groupGames,
  pairStarters,
  remainingFraction,
  scoreboardProjection,
  sideTotals,
  UNKNOWN_CLOCK_REMAINING,
  type LineupEntry,
} from "@/lib/live-matchup";

let nextId = 1;

function entry(overrides: Partial<LineupEntry> = {}): LineupEntry {
  return {
    game_id: 1,
    side: "home",
    team_id: 10,
    team_name: "Home",
    ottoneu_id: nextId++,
    player_id: null,
    player_name: "Player",
    nfl_team: "BUF",
    position: "WR",
    slot: "WR",
    slot_number: 0,
    is_starter: true,
    points: null,
    game_state: "scheduled",
    game_info: "Sun 1:00pm @MIA",
    injury_status: null,
    stat_line: null,
    projected: 10,
    ...overrides,
  };
}

describe("expectedPoints", () => {
  it("uses the projection for a player yet to play", () => {
    expect(expectedPoints(entry({ projected: 14.2 }))).toBe(14.2);
  });

  it("uses the points once the game is final, however far off the projection", () => {
    expect(
      expectedPoints(entry({ game_state: "final", points: 9.82, projected: 19.0 })),
    ).toBe(9.82);
  });

  it("counts a real zero as zero, not as the projection", () => {
    expect(expectedPoints(entry({ game_state: "final", points: 0, projected: 12 }))).toBe(0);
  });

  it("counts an unprojected player yet to play as zero", () => {
    expect(expectedPoints(entry({ projected: null }))).toBe(0);
  });

  it("adds the unplayed share of the projection to a player mid-game", () => {
    // Start of the 3rd quarter, 15:00 left in it: half the game to go.
    const mid = entry({ game_state: "in_progress", points: 6, projected: 10, game_info: "Q3 15:00" });
    expect(expectedPoints(mid)).toBeCloseTo(11);
  });

  it("lets a hot start lift the projection above the pre-game number", () => {
    const hot = entry({ game_state: "in_progress", points: 20, projected: 10, game_info: "Half" });
    expect(expectedPoints(hot)).toBe(25);
  });
});

describe("remainingFraction", () => {
  it.each([
    ["Q1 15:00", 1],
    ["Q2 7:30", 0.625],
    ["3rd 5:00", 20 / 60],
    ["Q4 0:00", 0],
    ["Halftime", 0.5],
    ["OT 8:00", 0],
  ])("%s -> %d", (info, expected) => {
    expect(remainingFraction(info)).toBeCloseTo(expected);
  });

  it("falls back to a half when the clock cannot be read", () => {
    expect(remainingFraction("7-10 @LA")).toBe(UNKNOWN_CLOCK_REMAINING);
    expect(remainingFraction(null)).toBe(UNKNOWN_CLOCK_REMAINING);
  });
});

describe("sideTotals — the 2026 opener", () => {
  const tinseltown = [
    entry({ slot: "QB", position: "QB", game_state: "final", points: 9.82, projected: 19.0, game_info: "L 10-13 @SEA" }),
    entry({ slot: "RB", projected: 14.0 }),
    entry({ slot: "RB", slot_number: 1, projected: 8.2 }),
    // Brock Bowers: OUT, and the source does not project him.
    entry({ slot: "TE", position: "TE", projected: null, injury_status: "OUT" }),
    entry({ slot: "BN", is_starter: false, projected: 22.1 }),
  ];

  it("sums starters only — the bench never counts", () => {
    const totals = sideTotals(tinseltown);
    expect(totals.starters).toBe(4);
    expect(totals.pregame).toBeCloseTo(19.0 + 14.0 + 8.2);
  });

  it("moves the live projection by exactly the finished player's miss", () => {
    const totals = sideTotals(tinseltown);
    expect(totals.pregame - totals.live).toBeCloseTo(19.0 - 9.82);
    expect(totals.actual).toBeCloseTo(9.82);
  });

  it("counts where each starter is in his week", () => {
    const totals = sideTotals(tinseltown);
    expect([totals.finished, totals.playing, totals.toPlay]).toEqual([1, 0, 3]);
    expect(totals.unprojected).toBe(1);
  });

  it("converges on the score once every starter has played", () => {
    const done = [
      entry({ game_state: "final", points: 12.5, projected: 8 }),
      entry({ game_state: "final", points: 3.1, projected: 9 }),
      entry({ game_state: "bye", points: null, projected: null }),
    ];
    const totals = sideTotals(done);
    expect(totals.live).toBeCloseTo(totals.actual);
    expect(totals.live).toBeCloseTo(15.6);
  });
});

describe("pairStarters", () => {
  it("returns every starting slot in display order, even ones left empty", () => {
    const home = [
      entry({ slot: "QB", position: "QB" }),
      entry({ slot: "K", position: "K" }),
    ];
    // Marin County, Week 1: no lineup set — everyone on the bench.
    const away = [entry({ side: "away", slot: "BN", is_starter: false })];
    const pairs = pairStarters(home, away);
    expect(pairs.map((p) => p.label)).toEqual([
      "QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SFLX", "K",
    ]);
    expect(pairs[0].home?.slot).toBe("QB");
    expect(pairs[8].home?.slot).toBe("K");
    expect(pairs.every((p) => p.away === null)).toBe(true);
  });

  it("keeps the two RBs apart by slot number", () => {
    const rb1 = entry({ slot: "RB", slot_number: 0, player_name: "One" });
    const rb2 = entry({ slot: "RB", slot_number: 1, player_name: "Two" });
    const pairs = pairStarters([rb2, rb1], []);
    expect(pairs[1].home?.player_name).toBe("One");
    expect(pairs[2].home?.player_name).toBe("Two");
  });

  it("still shows a slot the template does not know", () => {
    const odd = entry({ slot: "DST" });
    const pairs = pairStarters([odd], []);
    expect(pairs.at(-1)?.label).toBe("DST");
  });
});

describe("benchOf", () => {
  it("keeps Ottoneu's bench order", () => {
    const bench = [
      entry({ is_starter: false, slot: "BN", slot_number: 2, player_name: "C" }),
      entry({ is_starter: false, slot: "BN", slot_number: 0, player_name: "A" }),
      entry({ slot: "QB" }),
    ];
    expect(benchOf(bench).map((e) => e.player_name)).toEqual(["A", "C"]);
  });
});

describe("groupGames / scoreboardProjection", () => {
  it("groups rows by game and side, and summarises for the card", () => {
    const rows = [
      entry({ game_id: 7, side: "home", team_name: "H", projected: 10 }),
      entry({ game_id: 7, side: "away", team_name: "A", projected: 12 }),
      entry({ game_id: 8, side: "home", team_name: "X", projected: 5 }),
    ];
    const games = groupGames(rows, new Map([[7, "2026-09-10T20:28:00Z"]]));
    expect([...games.keys()].sort()).toEqual([7, 8]);
    const g7 = games.get(7)!;
    expect(g7.home.team_name).toBe("H");
    expect(g7.scrapedAt).toBe("2026-09-10T20:28:00Z");
    expect(scoreboardProjection(g7)).toEqual({ home: 10, away: 12 });
  });

  it("has nothing to show for a game with no lineups or no starters", () => {
    expect(scoreboardProjection(undefined)).toBeNull();
    const benchOnly = groupGames([entry({ is_starter: false, slot: "BN" })]).get(1);
    expect(scoreboardProjection(benchOnly)).toBeNull();
  });
});
