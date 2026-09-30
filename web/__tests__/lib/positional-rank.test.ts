/**
 * Positional rank — "QB6", "WR17" (web/lib/positional-rank.ts).
 *
 * Also covers how the rank reaches the hover card. The card's other fields come
 * from whatever pool the page passes — on /arbitration's projected mode that is
 * projection-merged rows — so the rank must come from the separate
 * current-season map, never be re-derived from `players`.
 */
import {
  describePositionalRank,
  formatPositionalRank,
  rankByPosition,
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

describe("formatting", () => {
  const r: PositionalRank = { position: "QB", rank: 6, of: 38, season: 2026 };

  test("the badge label", () => {
    expect(formatPositionalRank(r)).toBe("QB6");
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
