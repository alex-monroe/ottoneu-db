/**
 * Positional rank — "QB6", "WR17" (web/lib/positional-rank.ts).
 *
 * Also covers how the rank reaches the hover card. The card's other fields come
 * from whatever pool the page passes — on /arbitration's projected mode that is
 * projection-merged rows — so the rank must come from the separate
 * current-season map, never be re-derived from `players`.
 */
import {
  HEAT_MAX_BETTER_RANK,
  HEAT_MIN_GAP,
  classifyHeat,
  describeHeat,
  describePositionalRank,
  formatPositionalRank,
  minGamesForHeat,
  rankByPosition,
  rankByPpg,
  type RankablePlayer,
} from "@/lib/positional-rank";
import { buildHoverDataMap } from "@/lib/analysis";
import type { Player, PositionalRank } from "@/lib/types";

jest.mock("@/lib/supabase", () => ({
  supabase: {},
  fetchAllRows: jest.fn(),
  getSupabaseAdmin: jest.fn(),
}));

function row(
  player_id: string,
  position: string,
  total_points: number,
  games_played = 4,
): RankablePlayer {
  return {
    player_id,
    position,
    total_points,
    games_played,
    ppg: games_played > 0 ? total_points / games_played : 0,
  };
}

describe("rankByPosition", () => {
  test("ranks by total points within each position, independently", () => {
    const ranks = rankByPosition(
      [
        row("wr-b", "WR", 60),
        row("qb-a", "QB", 90),
        row("wr-a", "WR", 80),
        row("qb-b", "QB", 70),
        row("wr-c", "WR", 40),
      ],
      2026,
    );
    expect(ranks.get("wr-a")).toEqual({ position: "WR", rank: 1, of: 3, season: 2026 });
    expect(ranks.get("wr-b")?.rank).toBe(2);
    expect(ranks.get("wr-c")?.rank).toBe(3);
    expect(ranks.get("qb-a")).toEqual({ position: "QB", rank: 1, of: 2, season: 2026 });
    expect(ranks.get("qb-b")?.rank).toBe(2);
  });

  test("players who have not played are not ranked, and do not count in `of`", () => {
    const ranks = rankByPosition([row("rb-a", "RB", 50), row("rb-hurt", "RB", 0, 0)], 2026);
    expect(ranks.has("rb-hurt")).toBe(false);
    expect(ranks.get("rb-a")).toMatchObject({ rank: 1, of: 1 });
  });

  test("a player who played and scored nothing is still ranked, last", () => {
    const ranks = rankByPosition([row("te-a", "TE", 30), row("te-b", "TE", 0, 2)], 2026);
    expect(ranks.get("te-b")).toMatchObject({ rank: 2, of: 2 });
  });

  test("equal points break towards the higher PPG, and ranks stay unique", () => {
    const ranks = rankByPosition(
      [row("wr-4g", "WR", 60, 4), row("wr-3g", "WR", 60, 3), row("wr-x", "WR", 60, 4)],
      2026,
    );
    expect(ranks.get("wr-3g")?.rank).toBe(1);
    // Same points, same games: stable by player_id.
    expect(ranks.get("wr-4g")?.rank).toBe(2);
    expect(ranks.get("wr-x")?.rank).toBe(3);
  });

  test("unknown positions are skipped rather than invented", () => {
    const ranks = rankByPosition([row("def", "DST", 100), row("", "", 100)], 2026);
    expect(ranks.size).toBe(0);
  });
});

describe("rankByPpg", () => {
  test("ranks by rate, leaving out players under the games floor", () => {
    const ranks = rankByPpg(
      [row("volume", "RB", 80, 8), row("rate", "RB", 60, 4), row("one-game", "RB", 30, 1)],
      2026,
      2,
    );
    expect(ranks.get("rate")).toMatchObject({ rank: 1, of: 2 });
    expect(ranks.get("volume")).toMatchObject({ rank: 2, of: 2 });
    expect(ranks.has("one-game")).toBe(false);
  });

  test("a floor of 1 ranks everyone who has played", () => {
    const ranks = rankByPpg([row("a", "TE", 10, 1), row("b", "TE", 0, 0)], 2026, 1);
    expect([...ranks.keys()]).toEqual(["a"]);
  });
});

describe("minGamesForHeat — a quarter of the season so far", () => {
  test.each([
    [1, 1],
    [3, 1],
    [4, 1],
    [5, 2],
    [8, 2],
    [17, 5],
  ])("%i games deep → at least %i", (depth, expected) => {
    expect(minGamesForHeat(depth)).toBe(expected);
  });
});

describe("classifyHeat — deliberately severe", () => {
  test("a dramatic gap near the top is fire (rate better) or ice (total better)", () => {
    expect(classifyHeat(39, 5)).toBe("fire"); // 2025 Rashee Rice
    expect(classifyHeat(9, 22)).toBe("ice"); // 2024 Garrett Wilson
  });

  test("the gap must be at least HEAT_MIN_GAP spots", () => {
    expect(classifyHeat(1 + HEAT_MIN_GAP, 1)).toBe("fire");
    expect(classifyHeat(HEAT_MIN_GAP, 1)).toBeNull();
  });

  test("the worse rank must be at least double the better one", () => {
    // 14 spots apart, but WR20 vs WR34 is not a different player.
    expect(classifyHeat(34, 20)).toBeNull();
    expect(classifyHeat(40, 20)).toBe("fire");
  });

  test("nothing outside the top HEAT_MAX_BETTER_RANK, however wide the gap", () => {
    const better = HEAT_MAX_BETTER_RANK + 1;
    expect(classifyHeat(better * 3, better)).toBeNull();
    expect(classifyHeat(HEAT_MAX_BETTER_RANK * 3, HEAT_MAX_BETTER_RANK)).toBe("fire");
  });

  test("equal ranks are nothing", () => {
    expect(classifyHeat(5, 5)).toBeNull();
  });
});

describe("rankByPosition — PPG rank and heat", () => {
  /** 40 WRs on a smooth curve, all full-time, plus the ones under test. */
  function field(): RankablePlayer[] {
    return Array.from({ length: 40 }, (_, i) => row(`wr${i}`, "WR", 200 - i * 4, 16));
  }

  test("without seasonGames there is no PPG rank and no heat", () => {
    const r = rankByPosition([...field(), row("star", "WR", 110, 5)], 2025).get("star")!;
    expect(r.ppg_rank).toBeUndefined();
    expect(r.heat).toBeUndefined();
  });

  test("a star who missed most of the year runs hot", () => {
    // 22 PPG over 5 games: top of the rate list, deep in the totals.
    const r = rankByPosition([...field(), row("star", "WR", 110, 5)], 2025, 17).get("star")!;
    expect(r.ppg_rank).toBe(1);
    expect(r.rank).toBeGreaterThan(20);
    expect(r.ppg_min_games).toBe(5);
    expect(r.heat).toBe("fire");
  });

  test("under a quarter of the season, a player gets no PPG rank and no heat", () => {
    const r = rankByPosition([...field(), row("star", "WR", 88, 4)], 2025, 17).get("star")!;
    expect(r.ppg_rank).toBeUndefined();
    expect(r.heat).toBeUndefined();
    // …but his total-points rank is untouched.
    expect(r.rank).toBeGreaterThan(0);
  });

  test("an ordinary field carries PPG ranks and no heat at all", () => {
    const ranks = rankByPosition(field(), 2025, 17);
    for (const r of ranks.values()) {
      expect(r.ppg_rank).toBe(r.rank);
      expect(r.heat).toBeUndefined();
    }
  });
});

describe("formatting", () => {
  const r: PositionalRank = { position: "QB", rank: 6, of: 38, season: 2026 };

  test("the badge label", () => {
    expect(formatPositionalRank(r)).toBe("QB6");
  });

  test("heat explains itself with both ranks and the games floor", () => {
    expect(describeHeat(r)).toBeNull();
    expect(describeHeat({ ...r, rank: 23, ppg_rank: 5, ppg_min_games: 1, heat: "fire" })).toBe(
      "Scoring at a far better rate than his total shows: QB5 by PPG vs QB23 by total points (min 1 game)",
    );
    expect(describeHeat({ ...r, rank: 9, ppg_rank: 22, ppg_min_games: 5, heat: "ice" })).toBe(
      "His total outruns his rate: QB22 by PPG vs QB9 by total points (min 5 games)",
    );
  });

  test.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [113, "113th"],
  ])("ordinal %i → %s", (rank, expected) => {
    expect(describePositionalRank({ ...r, rank })).toBe(`${expected} of 38 QBs in 2026 by total points`);
  });
});

describe("buildHoverDataMap — positional rank", () => {
  function player(player_id: string, position: string, total_points: number): Player {
    return {
      player_id,
      ottoneu_id: player_id.length,
      name: player_id,
      position,
      nfl_team: "ANY",
      birth_date: null,
      is_college: false,
      price: 1,
      team_name: null,
      total_points,
      games_played: 4,
      snaps: 0,
      ppg: total_points / 4,
      pps: 0,
    };
  }

  test("takes the rank from the map it is given, not from the page's pool", () => {
    // In this (say, projected) pool "b" outscores "a"; the actual-season map
    // says otherwise, and the map is what the card must show.
    const players = [player("a", "WR", 10), player("bb", "WR", 99)];
    const rankMap: Record<string, PositionalRank> = {
      a: { position: "WR", rank: 1, of: 2, season: 2026 },
      bb: { position: "WR", rank: 2, of: 2, season: 2026 },
    };
    const map = buildHoverDataMap(players, null, null, false, rankMap);
    expect(map["a"].positional_rank?.rank).toBe(1);
    expect(map["bb"].positional_rank?.rank).toBe(2);
  });

  test("absent from the map means no rank on the card", () => {
    const map = buildHoverDataMap([player("a", "WR", 10)], null, null, false, {});
    expect(map["a"].positional_rank).toBeUndefined();
  });

  test("defaults to no rank when no map is passed", () => {
    const map = buildHoverDataMap([player("a", "WR", 10)]);
    expect(map["a"].positional_rank).toBeUndefined();
  });
});
