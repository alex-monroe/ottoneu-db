/**
 * The trade log and its judgements (web/lib/trades.ts).
 *
 * What is worth pinning is anything that would mislead someone deciding whether
 * a trade was smart: one trade counted twice because two sources both saw it, a
 * card-rebuilt trade read as "no loan" when we simply cannot see loans, cap math
 * that disagrees with Ottoneu's own "Cap available will change by" line, a bad
 * contract counted as negative keeper value, or a sell-off's outcome read off
 * the wrong season.
 */

import type { Matchup } from "@/lib/standings";
import {
  findSellOffs,
  judgeSellOffs,
  mergeTrades,
  mostTradedPlayers,
  nextSeasonSalary,
  playerKey,
  playerTradeChain,
  remainingSeasonFraction,
  standingAt,
  summariseLoans,
  tradeTree,
  tradesFromCards,
  tradesFromHistory,
  valueTrade,
  weeksPlayedBefore,
  type CardMoveRow,
  type LeagueTrade,
  type TradeAsset,
  type TradeAssetRow,
  type TradeRow,
  type ValueBooks,
} from "@/lib/trades";
import { groupOutlooks } from "@/lib/keeper-outlook";
import type { KeeperOutlook } from "@/lib/types";

// --- builders ---------------------------------------------------------------

function player(
  name: string, amount: number, fromTeam: string, toTeam: string, extra: Partial<TradeAsset> = {},
): TradeAsset {
  return {
    kind: "player", playerId: name.toLowerCase(), ottoneuId: null, isCollege: false,
    name, position: "WR", amount, fromTeam, toTeam, ...extra,
  };
}

function loan(amount: number, fromTeam: string, toTeam: string): TradeAsset {
  return {
    kind: "loan", playerId: null, ottoneuId: null, isCollege: false,
    name: "Loan", position: null, amount, fromTeam, toTeam,
  };
}

function trade(
  key: string, at: string, teams: [string, string], assets: TradeAsset[],
  extra: Partial<LeagueTrade> = {},
): LeagueTrade {
  return {
    key, source: "trade_history", ottoneuTradeId: null, status: "processed",
    season: Number(at.slice(0, 4)), acceptedAt: at, processedAt: at, teams, assets,
    loansKnown: true, ...extra,
  };
}

function game(
  week: number, endsOn: string, home: string, homeScore: number, away: string, awayScore: number,
  status: Matchup["status"] = "final", season = 2025,
): Matchup {
  return {
    game_id: week * 100 + home.length, season, week,
    home_team_id: home.length, home_team_name: home, home_score: homeScore,
    away_team_id: away.length + 50, away_team_name: away, away_score: awayScore,
    status, game_type: "regular", starts_on: null, ends_on: endsOn, status_label: null,
  };
}

function cardRow(
  name: string, team: string, from: string, salary: number, clock: string, date: string,
): CardMoveRow {
  return {
    player_id: name.toLowerCase(),
    transaction_date: date,
    transaction_type: `move (from ${from})`,
    team_name: team,
    from_team: null,
    salary,
    season: Number(date.slice(0, 4)),
    raw_description: `${clock} | ${team} | move | $${salary}`,
    players: { name, position: "RB", ottoneu_id: 1, is_college: false },
  };
}

// --- building the log ---------------------------------------------------------

describe("tradesFromHistory", () => {
  const rows: TradeRow[] = [{
    trade_id: 44207, season: 2026, accepted_at: "2026-10-12T06:32:00",
    processed_at: "2026-10-14T06:32:00", status: "processed",
    offered_by_team_name: "The Triple Helix", offered_to_team_name: "Irish Invasion",
  }];
  const asset = (over: Partial<TradeAssetRow>): TradeAssetRow => ({
    trade_id: 44207, asset_type: "player", from_team_name: "The Triple Helix",
    to_team_name: "Irish Invasion", ottoneu_id: 14304, is_college: false,
    player_id: "hampton", player_name: "Omarion Hampton", position: "RB", amount: 54, ...over,
  });

  it("joins assets to their trade and labels loans", () => {
    const [t] = tradesFromHistory(rows, [
      asset({}),
      asset({ asset_type: "loan", ottoneu_id: null, player_id: null, player_name: null, position: null, amount: 18 }),
    ]);
    expect(t.key).toBe("th:44207");
    expect(t.loansKnown).toBe(true);
    expect(t.assets.map((a) => [a.kind, a.name, a.amount])).toEqual([
      ["player", "Omarion Hampton", 54],
      ["loan", "Loan", 18],
    ]);
  });
});

describe("tradesFromCards", () => {
  it("groups rows sharing a minute and a team pair into one trade", () => {
    const trades = tradesFromCards([
      cardRow("Hampton", "Irish Invasion", "The Triple Helix", 54, "Oct 14, 2026 6:33 AM", "2026-10-14"),
      cardRow("Mason", "The Triple Helix", "Irish Invasion", 15, "Oct 14, 2026 6:33 AM", "2026-10-14"),
      cardRow("Swift", "Irish Invasion", "The Roseman Empire", 32, "Oct 14, 2026 6:33 AM", "2026-10-14"),
    ]);
    expect(trades).toHaveLength(2);
    const helix = trades.find((t) => t.teams.includes("The Triple Helix"))!;
    expect(helix.assets.map((a) => a.name).sort()).toEqual(["Hampton", "Mason"]);
    expect(helix.loansKnown).toBe(false);
    expect(helix.processedAt).toBe("2026-10-14T06:33");
  });
});

describe("mergeTrades", () => {
  const history = trade("th:1", "2026-10-12T06:32:00", ["The Triple Helix", "Irish Invasion"], [], {
    processedAt: "2026-10-14T06:32:00",
  });

  it("drops a card trade the trade history already explains", () => {
    const card = trade("card:a", "2026-10-14T06:33", ["Irish Invasion", "The Triple Helix"], [], {
      source: "player_cards", loansKnown: false,
    });
    expect(mergeTrades([history], [card]).map((t) => t.key)).toEqual(["th:1"]);
  });

  it("keeps a card trade from before the trade history begins", () => {
    const old = trade("card:b", "2024-11-01T10:00", ["Irish Invasion", "The Triple Helix"], [], {
      source: "player_cards", loansKnown: false,
    });
    expect(mergeTrades([history], [old]).map((t) => t.key)).toEqual(["th:1", "card:b"]);
  });

  it("matches on acceptance when the processed time is not stored", () => {
    const noDetail = { ...history, processedAt: null };
    const card = trade("card:c", "2026-10-14T06:33", ["Irish Invasion", "The Triple Helix"], [], {
      source: "player_cards",
    });
    expect(mergeTrades([noDetail], [card])).toHaveLength(1);
  });

  it("does not let a pending trade swallow a processed card trade", () => {
    const pending = { ...history, status: "pending" as const };
    const card = trade("card:d", "2026-10-14T06:33", ["Irish Invasion", "The Triple Helix"], [], {
      source: "player_cards",
    });
    expect(mergeTrades([pending], [card])).toHaveLength(2);
  });
});

// --- loans ----------------------------------------------------------------------

describe("summariseLoans", () => {
  const trades = [
    trade("a", "2025-11-12T10:00", ["Witch", "Irish"], [
      player("Allen", 110, "Witch", "Irish"), loan(90, "Witch", "Irish"),
    ]),
    trade("b", "2025-11-14T10:00", ["Witch", "Helix"], [player("Barkley", 90, "Witch", "Helix")]),
    trade("c", "2026-10-12T10:00", ["Helix", "Irish"], [loan(18, "Helix", "Irish")]),
    // Card-rebuilt: loans unknowable, so it must not count as "no loan".
    trade("d", "2024-10-01T10:00", ["Witch", "Irish"], [player("X", 5, "Witch", "Irish")], {
      source: "player_cards", loansKnown: false,
    }),
    trade("e", "2026-10-14T10:00", ["Witch", "Irish"], [loan(50, "Witch", "Irish")], {
      status: "pending",
    }),
  ];
  const summary = summariseLoans(trades);

  it("counts only processed trades whose loans are visible", () => {
    expect(summary.bySeason).toEqual([
      { season: 2026, trades: 1, tradesWithLoan: 1, loanTotal: 18, largestLoan: 18 },
      { season: 2025, trades: 2, tradesWithLoan: 1, loanTotal: 90, largestLoan: 90 },
    ]);
    expect(summary.knownSince).toBe("2025-11-12T10:00");
  });

  it("credits the lender and the borrower", () => {
    const witch = summary.byTeam.find((r) => r.team === "Witch")!;
    const irish = summary.byTeam.find((r) => r.team === "Irish")!;
    expect([witch.lentCount, witch.lentTotal]).toEqual([1, 90]);
    expect([irish.borrowedCount, irish.borrowedTotal]).toEqual([2, 108]);
    expect(summary.byTeam[0].team).toBe("Witch");
  });
});

// --- lineage --------------------------------------------------------------------

describe("lineage", () => {
  const first = trade("1", "2025-10-01T10:00", ["A", "B"], [
    player("Pitts", 7, "A", "B"), player("Love", 3, "B", "A"),
  ]);
  const second = trade("2", "2025-11-01T10:00", ["B", "C"], [
    player("Pitts", 7, "B", "C"), player("Bowers", 49, "C", "B"),
  ]);
  const third = trade("3", "2026-08-01T10:00", ["B", "D"], [
    player("Bowers", 53, "B", "D"), player("Nix", 63, "D", "B"),
  ]);
  const trades = [third, second, first];

  it("follows a player's chain of owners in time order", () => {
    const chain = playerTradeChain(trades, playerKey(player("Pitts", 0, "", "")));
    expect(chain.map((s) => `${s.fromTeam}->${s.toTeam}`)).toEqual(["A->B", "B->C"]);
  });

  it("lists players traded more than once", () => {
    expect(mostTradedPlayers(trades).map((p) => p.name)).toEqual(["Bowers", "Pitts"]);
  });

  it("grows a trade tree through every later flip", () => {
    const tree = tradeTree(trades, first, "B");
    expect(tree).toHaveLength(1);
    expect(tree[0].asset.name).toBe("Pitts");
    const flipped = tree[0].flipped!;
    expect(flipped.trade.key).toBe("2");
    expect(flipped.received[0].asset.name).toBe("Bowers");
    expect(flipped.received[0].flipped!.received[0].asset.name).toBe("Nix");
    expect(flipped.received[0].flipped!.received[0].flipped).toBeNull();
  });

  it("leaves a player the team still holds as a leaf", () => {
    expect(tradeTree(trades, first, "A")[0]).toEqual({ asset: first.assets[1], flipped: null });
  });
});

// --- timing and standings -------------------------------------------------------

describe("remainingSeasonFraction", () => {
  const weeks = [1, 2, 3, 4].map((w) => game(w, `2025-09-${String(w * 7).padStart(2, "0")}`, "A", 0, "B", 0));

  it("counts regular-season weeks not yet finished", () => {
    expect(remainingSeasonFraction("2025-08-01T00:00", weeks)).toBe(1);
    expect(remainingSeasonFraction("2025-09-15T00:00", weeks)).toBe(0.5);
    expect(remainingSeasonFraction("2025-12-01T00:00", weeks)).toBe(0);
  });

  it("is null when the schedule is not stored", () => {
    expect(remainingSeasonFraction("2025-09-15T00:00", [])).toBeNull();
  });
});

describe("standingAt", () => {
  const season2025 = [
    game(1, "2025-09-15", "Sellers", 80, "Buyers", 120),
    game(2, "2025-09-22", "Sellers", 90, "Buyers", 100),
  ];
  const season2024 = [game(1, "2024-09-15", "Sellers", 150, "Buyers", 100, "final", 2024)];
  const bySeason = new Map([[2025, season2025], [2024, season2024]]);

  it("uses only games finished before the trade", () => {
    expect(standingAt("Sellers", "2025-09-20T12:00", bySeason, 2025)).toMatchObject({
      rank: 2, wins: 0, losses: 1, basis: "this season",
    });
  });

  it("falls back to last season's final table before kickoff", () => {
    expect(standingAt("Sellers", "2025-08-01T12:00", bySeason, 2025)).toMatchObject({
      rank: 1, wins: 1, basis: "last season",
    });
  });
});

// --- valuation ------------------------------------------------------------------

describe("valueTrade", () => {
  // The real trade #44207: Triple Helix sent Hampton ($54) and an $18 loan for
  // Brissett ($8) and Mason ($15). Ottoneu: "Cap available will change by $13".
  const t = trade("th:44207", "2026-10-12T06:32", ["The Triple Helix", "Irish Invasion"], [
    player("Hampton", 54, "The Triple Helix", "Irish Invasion"),
    loan(18, "The Triple Helix", "Irish Invasion"),
    player("Brissett", 8, "Irish Invasion", "The Triple Helix"),
    player("Mason", 15, "Irish Invasion", "The Triple Helix"),
  ]);
  const books: ValueBooks = {
    projected: new Map([
      [2026, new Map([["hampton", 60], ["brissett", 10], ["mason", 12]])],
      [2027, new Map([["hampton", 70], ["brissett", 2]])],
    ]),
    realized: new Map(),
  };
  const weeks = [1, 2, 3, 4].map((w) =>
    game(w, `2026-10-${String(w * 7).padStart(2, "0")}`, "A", 0, "B", 0, "scheduled", 2026));
  const [helix, irish] = valueTrade(t, books, weeks).sides;

  it("matches Ottoneu's cap change for both sides", () => {
    expect(helix.capNet).toBe(13);
    expect(irish.capNet).toBe(-13);
  });

  it("prorates this-season value by the season left", () => {
    // 3 of 4 weeks left: (10 + 12 − 60) × 0.75 = −28.5 → −28 (Math.round)
    expect(helix.seasonNet).toBe(-28);
    expect(irish.seasonNet).toBe(29);
  });

  it("floors keeper value at zero and prices a vanished player at nothing", () => {
    // Hampton: 70 − (54 + 4) = 12. Brissett: 2 − 12 → 0. Mason: no 2027 row → 0.
    expect(irish.got[0]).toMatchObject({ keeperValue: 12, nextIsProxy: false });
    expect(helix.got.map((a) => a.keeperValue)).toEqual([0, 0]);
    expect(helix.keeperNet).toBe(-12);
  });

  it("is unknown, not zero, when a season has no projections at all", () => {
    const none = valueTrade(t, { projected: new Map(), realized: new Map() }, []);
    expect(none.sides[0].seasonNet).toBeNull();
    expect(none.sides[0].keeperNet).toBeNull();
    expect(none.sides[0].capNet).toBe(13);
  });

  it("uses this season's projection as next season's when none exists yet", () => {
    const thisYearOnly: ValueBooks = {
      projected: new Map([[2026, books.projected.get(2026)!]]),
      realized: new Map(),
    };
    const v = valueTrade(t, thisYearOnly, weeks).sides[1].got[0];
    expect(v).toMatchObject({ nextIsProxy: true, nextValue: 60, keeperValue: 2 });
  });

  it("reads keeper value as an option from the outlook taken before the trade", () => {
    const snap = (asOfWeek: number, quantiles: number[]): KeeperOutlook => ({
      playerId: "hampton", season: 2026, asOfWeek, valueSeason: 2027, quantiles,
      mean: 0, p10: 1, p50: 50, p90: 100, ownWeight: 0.9, yearsInLeague: 3, draftBucket: "R2",
    });
    // Half the outcomes are worthless, half are $100. At a $58 salary the point
    // read of the mean ($50.50) says $0; the option is worth ½ × $42 = $21.
    const half = [...Array(10).fill(1), ...Array(10).fill(100)];
    const withOutlook: ValueBooks = {
      ...books,
      // Week 3 is after the trade (one week was played), so it must be ignored.
      outlook: groupOutlooks([snap(0, half), snap(3, Array(20).fill(500))]),
    };
    const got = valueTrade(t, withOutlook, weeks).sides[1].got[0];
    expect(got.keeperValue).toBe(21);
    expect(got.keeper).toMatchObject({ pKeepable: 0.5, asOfWeek: 0 });
    // Brissett and Mason have no outlook: the point read stands.
    const helixGot = valueTrade(t, withOutlook, weeks).sides[0].got;
    expect(helixGot.map((a) => a.keeper)).toEqual([null, null]);
  });

  it("counts the regular-season weeks finished before a trade", () => {
    expect(weeksPlayedBefore("2026-10-12T06:32", weeks)).toBe(1);
    expect(weeksPlayedBefore("2026-08-01", weeks)).toBe(0);
    expect(weeksPlayedBefore("2026-10-12", [])).toBeNull();
  });

  it("gives a college prospect the smaller raise", () => {
    expect(nextSeasonSalary(2, true)).toBe(3);
    expect(nextSeasonSalary(2, false)).toBe(6);
  });
});

// --- sell-offs ------------------------------------------------------------------

describe("sell-offs", () => {
  const sell = trade("s", "2025-11-12T10:00", ["Losers", "Winners"], [
    player("Star", 90, "Losers", "Winners"),
    player("Prospect", 2, "Winners", "Losers"),
    loan(40, "Losers", "Winners"),
  ]);
  const books: ValueBooks = {
    projected: new Map([
      [2025, new Map([["star", 80], ["prospect", 5]])],
      [2026, new Map([["star", 70], ["prospect", 30]])],
    ]),
    realized: new Map([[2026, new Map([["star", 40], ["prospect", 25]])]]),
  };
  // Two weeks played before the November trade, two still to play.
  const before = [
    game(1, "2025-09-15", "Losers", 80, "Winners", 120),
    game(2, "2025-09-22", "Losers", 80, "Winners", 120),
    game(3, "2025-11-20", "Losers", 0, "Winners", 0, "scheduled"),
    game(4, "2025-11-27", "Losers", 0, "Winners", 0, "scheduled"),
  ];
  const nextSeason = [game(1, "2026-09-15", "Losers", 130, "Winners", 100, "final", 2026)];
  const bySeason = new Map([[2025, before], [2026, nextSeason]]);
  const valuations = [valueTrade(sell, books, before)];
  const found = findSellOffs(valuations, bySeason);

  it("flags the side that shipped out this season's value", () => {
    expect(found).toHaveLength(1);
    expect(found[0].seller.team).toBe("Losers");
    expect(found[0].seller.loanOut).toBe(40);
    // (5 − 80) × half a season left = −37.5
    expect(found[0].seller.seasonNet).toBe(-37);
    expect(found[0].wasLosing).toBe(true);
  });

  it("reads the outcome from the following season", () => {
    expect(found[0].standingAtTrade).toMatchObject({ rank: 2, basis: "this season" });
    expect(found[0].nextSeason).toMatchObject({ rank: 1, wins: 1 });
    // Keeper: prospect 30 − 6 = 24 in, star 70 − 94 → 0 out.
    expect(found[0].seller.keeperNet).toBe(24);
    expect(found[0].seller.realizedNextNet).toBe(25 - 40);
  });

  it("rolls bottom-half sell-offs up into a verdict", () => {
    expect(judgeSellOffs(found)).toEqual({
      judged: 1, gainedKeeperValue: 1, improvedRank: 1, withNextSeason: 1,
      averageKeeperNet: 24, averageRankChange: 1,
    });
  });

  it("ignores an even swap", () => {
    const even = trade("e", "2025-11-12T10:00", ["Losers", "Winners"], [
      player("Star", 90, "Losers", "Winners"), player("Prospect", 2, "Winners", "Losers"),
    ]);
    const flat: ValueBooks = {
      projected: new Map([[2025, new Map([["star", 40], ["prospect", 40]])]]),
      realized: new Map(),
    };
    expect(findSellOffs([valueTrade(even, flat, before)], bySeason)).toEqual([]);
  });
});
