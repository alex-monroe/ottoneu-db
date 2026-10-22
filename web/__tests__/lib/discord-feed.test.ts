import {
  addDays,
  auctionStartedKey,
  auctionsToPost,
  buildAuctionFinishedMessage,
  buildAuctionStartedMessage,
  buildMovesDigestMessage,
  buildPickemReminderMessage,
  buildPickemResultsMessage,
  buildTradeMessage,
  formatDay,
  formatSiteClock,
  latestFinishedWeek,
  postIdString,
  productionBook,
  seasonLeaderboard,
  sideValueRead,
  tradesToPost,
  weekEndsOn,
  type AuctionResult,
  type OpenAuction,
  type ProductionBook,
} from "@/lib/discord-feed";
import type { Board, BoardRow } from "@/lib/pickem";
import type { RecapMove } from "@/lib/recap-moves";
import type { Matchup } from "@/lib/standings";
import type { StatWindow } from "@/lib/stat-window";
import type { LeagueTrade, TradeAsset } from "@/lib/trades";
import type { Player } from "@/lib/types";

const SITE = "https://site.test";

const WINDOW: StatWindow = {
  season: 2026,
  games: 5,
  fraction: 5 / 17,
  complete: false,
  weeksPlayed: 5,
  label: "2026 through Week 5",
  shortLabel: "2026 to date",
};

function player(id: string, kind: Partial<TradeAsset> = {}): TradeAsset {
  return {
    kind: "player",
    playerId: id,
    ottoneuId: 1,
    isCollege: false,
    name: `Player ${id}`,
    position: "RB",
    amount: 10,
    fromTeam: "Alpha",
    toTeam: "Bravo",
    ...kind,
  };
}

function trade(overrides: Partial<LeagueTrade> = {}): LeagueTrade {
  return {
    key: "th:1",
    source: "trade_history",
    ottoneuTradeId: 1,
    status: "processed",
    season: 2026,
    acceptedAt: "2026-10-14T06:32",
    processedAt: "2026-10-16T06:32",
    teams: ["Alpha", "Bravo"],
    assets: [],
    loansKnown: true,
    ...overrides,
  };
}

function book(entries: Record<string, { ppg: number; games: number; pace: number | null }>, window = WINDOW): ProductionBook {
  return {
    window,
    byPlayer: new Map(
      Object.entries(entries).map(([id, e]) => [
        id,
        { position: "WR", ppg: e.ppg, games: e.games, pace: e.pace, earnedValue: e.pace === null ? null : e.pace * window.fraction },
      ]),
    ),
  };
}

describe("dates", () => {
  it("shifts and formats days", () => {
    expect(addDays("2026-10-01", -3)).toBe("2026-09-28");
    expect(formatDay("2026-10-16")).toBe("Fri, Oct 16");
  });

  it("prints the Ottoneu site clock as plain text", () => {
    expect(formatSiteClock("2026-10-18T22:40:00")).toBe("Oct 18, 10:40 PM");
    expect(formatSiteClock("2026-10-18T00:05")).toBe("Oct 18, 12:05 AM");
    expect(formatSiteClock("2026-10-18T12:00")).toBe("Oct 18, 12:00 PM");
  });
});

describe("productionBook", () => {
  it("scales earned value to a full-season pace, and leaves unpriced players null", () => {
    const players = [
      { player_id: "a", position: "RB", games_played: 5, ppg: 15 },
      { player_id: "k", position: "K", games_played: 5, ppg: 8 },
    ] as Player[];
    const earned = [{ ...players[0], earned_value: 10 }] as unknown as Parameters<typeof productionBook>[1];
    const b = productionBook(players, earned, WINDOW);
    expect(b.byPlayer.get("a")!.pace).toBeCloseTo(34);
    expect(b.byPlayer.get("k")!.pace).toBeNull();
  });

  it("has no pace before a game is played", () => {
    const players = [{ player_id: "a", position: "RB", games_played: 0, ppg: 0 }] as Player[];
    const earned = [{ ...players[0], earned_value: 0 }] as unknown as Parameters<typeof productionBook>[1];
    expect(productionBook(players, earned, { ...WINDOW, fraction: 0 }).byPlayer.get("a")!.pace).toBeNull();
  });
});

describe("tradesToPost", () => {
  const today = "2026-10-17";

  it("posts a pending trade as pending and a processed one as processed", () => {
    const due = tradesToPost(
      [
        trade({ ottoneuTradeId: 2, key: "th:2", status: "pending", processedAt: "2026-10-18T22:40" }),
        trade(),
      ],
      new Set(),
      today,
      3,
    );
    expect(due.map((d) => postIdString(d.id))).toEqual(["trade_processed:1", "trade_pending:2"]);
  });

  it("never re-posts what the log already has", () => {
    expect(tradesToPost([trade()], new Set(["trade_processed:1"]), today, 3)).toEqual([]);
  });

  it("posts a processed trade even after its pending heads-up went out", () => {
    expect(tradesToPost([trade()], new Set(["trade_pending:1"]), today, 3)).toHaveLength(1);
  });

  it("skips old news, removed trades and card-rebuilt trades", () => {
    expect(
      tradesToPost(
        [
          trade({ processedAt: "2026-10-01T06:00" }),
          trade({ status: "removed" }),
          trade({ source: "player_cards", ottoneuTradeId: null }),
        ],
        new Set(),
        today,
        3,
      ),
    ).toEqual([]);
  });
});

describe("buildTradeMessage", () => {
  const assets = [
    player("a", { fromTeam: "Alpha", toTeam: "Bravo", amount: 45, name: "Ace" }),
    player("b", { fromTeam: "Bravo", toTeam: "Alpha", amount: 5, name: "Bee", position: null }),
    { ...player("loan"), kind: "loan" as const, playerId: null, name: "Loan", amount: 18, fromTeam: "Alpha", toTeam: "Bravo" },
  ];
  const b = book({ a: { ppg: 20, games: 5, pace: 60 }, b: { ppg: 9, games: 4, pace: 12 } });

  it("posts a plain summary by default: players, salaries, the loan and the links", () => {
    const e = buildTradeMessage(trade({ assets }), b, SITE).embeds[0];
    expect(e.title).toBe("🤝 Trade: Alpha ⇄ Bravo");
    expect(e.description).toContain("**Bravo gets**\n• **Ace** (RB, $45)\n• $18 cap loan");
    // Still borrows a missing position from the stats pool.
    expect(e.description).toContain("**Alpha gets**\n• **Bee** (WR, $5)\n");
    expect(e.description).not.toContain("PPG");
    expect(e.description).not.toContain("pace");
    expect(e.description).not.toContain("Value read");
    expect(e.footer.text).toBe("From Ottoneu's trade log.");
    expect(e.description).toContain(
      `[See it in the trade builder →](${SITE}/trades/builder?trade=1&utm_source=discord&utm_campaign=trade_processed)`,
    );
    expect(e.description).toContain(`[Every trade →](${SITE}/trades?utm_source=discord&utm_campaign=trade_processed)`);
  });

  it("names both sides' players, salaries and the loan, with a value read per side when asked", () => {
    const msg = buildTradeMessage(trade({ assets }), b, SITE, { valueRead: true });
    const e = msg.embeds[0];
    expect(e.title).toBe("🤝 Trade: Alpha ⇄ Bravo");
    expect(e.url).toBe(`${SITE}/trades?utm_source=discord&utm_campaign=trade_processed`);
    expect(e.description).toContain("**Bravo gets**\n• **Ace** (RB, $45) — 20.0 PPG in 5 games · $60 pace\n• $18 cap loan");
    // A trade row without a position borrows the player's from the stats pool.
    expect(e.description).toContain("• **Bee** (WR, $5) — 9.0 PPG in 4 games · $12 pace");
    expect(e.description).toContain("**Value read** · 2026 through Week 5");
    expect(e.description).toContain("Alpha: **−$48** — $12 of pace in for $5 salary, $60 out for $45");
    expect(e.description).toContain("Bravo: **+$48**");
    expect(e.footer.text).toContain("no projections");
    expect(e.description).toContain(
      `[See it in the trade builder →](${SITE}/trades/builder?trade=1&utm_source=discord&utm_campaign=trade_processed)`,
    );
  });

  it("marks a pending trade and when it processes", () => {
    const e = buildTradeMessage(trade({ assets, status: "pending", processedAt: "2026-10-18T22:40" }), b, SITE).embeds[0];
    expect(e.title).toBe("⏳ Pending trade: Alpha ⇄ Bravo");
    expect(e.url).toContain("utm_campaign=trade_pending");
    expect(e.description).toContain("/trades/builder?trade=1&utm_source=discord&utm_campaign=trade_pending");
    expect(e.description.startsWith("Awaiting league approval — processes on Oct 18, 10:40 PM (Ottoneu time)")).toBe(true);
  });

  it("says so rather than reading value before any games", () => {
    const e = buildTradeMessage(trade({ assets }), book({}, { ...WINDOW, fraction: 0 }), SITE, { valueRead: true }).embeds[0];
    expect(e.description).toContain("no value read");
    expect(e.description).toContain("**Ace** (RB, $45) — no games yet");
  });

  it("calls out a college prospect", () => {
    const e = buildTradeMessage(
      trade({ assets: [player("c", { isCollege: true, name: "Prospect" })] }),
      b,
      SITE,
      { valueRead: true },
    ).embeds[0];
    expect(e.description).toContain("**Prospect** (RB, $10) — college prospect");
    expect(e.description).toContain("**Alpha gets**\n• nothing on record");
  });
});

describe("sideValueRead", () => {
  it("counts an unpriced player as no production", () => {
    const t = trade({ assets: [player("a"), player("z", { fromTeam: "Bravo", toTeam: "Alpha" })] });
    const read = sideValueRead(t, "Bravo", book({ a: { ppg: 10, games: 5, pace: 30 } }));
    expect(read).toEqual({ paceIn: 30, paceOut: 0, net: 30, salaryIn: 10, salaryOut: 10 });
  });
});

function move(overrides: Partial<RecapMove>): RecapMove {
  return {
    ottoneuId: 1,
    name: "Someone",
    position: "WR",
    nflTeam: "KC",
    teamName: "Alpha",
    salary: 3,
    date: "2026-10-16",
    at: "2026-10-16T09:00",
    approximate: false,
    ...overrides,
  };
}

describe("buildMovesDigestMessage", () => {
  it("groups the day's scraped adds and cuts by team", () => {
    const msg = buildMovesDigestMessage(
      "2026-10-16",
      {
        adds: [move({ name: "Big", salary: 12, teamName: "Bravo" }), move({ name: "Small", salary: 1 })],
        cuts: [move({ name: "Gone", position: "RB", salary: 2 })],
      },
      SITE,
    )!;
    const e = msg.embeds[0];
    expect(e.title).toBe("📋 Moves — Fri, Oct 16");
    expect(e.url).toBe(`${SITE}/rosters?utm_source=discord&utm_campaign=moves_digest`);
    expect(e.description.split("\n\n").slice(0, 2)).toEqual([
      "**Alpha**\n➕ Small (WR) $1\n➖ Gone (RB) $2",
      "**Bravo**\n➕ Big (WR) $12",
    ]);
    expect(e.footer.text).toBe("2 adds · 1 cut · salaries as added/cut");
  });

  it("leaves out inferred rows and other days, and posts nothing on a quiet day", () => {
    expect(
      buildMovesDigestMessage(
        "2026-10-16",
        { adds: [move({ approximate: true }), move({ date: "2026-10-15" })], cuts: [] },
        SITE,
      ),
    ).toBeNull();
  });
});

function game(week: number, status: Matchup["status"], endsOn = "2026-10-13"): Matchup {
  return {
    game_id: week * 10 + (status === "final" ? 1 : 2),
    season: 2026,
    week,
    home_team_id: 1,
    home_team_name: "Alpha",
    home_score: 100,
    away_team_id: 2,
    away_team_name: "Bravo",
    away_score: 90,
    status,
    game_type: "regular",
    starts_on: "2026-10-07",
    ends_on: endsOn,
    status_label: null,
  };
}

describe("latestFinishedWeek / weekEndsOn", () => {
  it("is the latest week whose games are all final", () => {
    const games = [game(4, "final"), game(5, "final"), game(5, "final"), game(6, "in_progress"), game(6, "final")];
    expect(latestFinishedWeek(games, 2026)).toBe(5);
    expect(latestFinishedWeek(games, 2025)).toBeNull();
    expect(weekEndsOn(games, 2026, 5)).toBe("2026-10-13");
    expect(weekEndsOn(games, 2026, 9)).toBeNull();
  });
});

function boardRow(rank: number, displayName: string, correct: number): BoardRow {
  return { rank, displayName, isViewer: false, correct, wrong: 6 - correct, pushes: 0, pending: 0, picked: 6 };
}

function board(rows: BoardRow[], revealed = true): Board {
  return { revealed, players: rows.length, rows, splits: [] };
}

describe("seasonLeaderboard", () => {
  it("sums revealed weeks and shares ranks when level", () => {
    const rows = seasonLeaderboard([
      board([boardRow(1, "Ann", 5), boardRow(2, "Ben", 3)]),
      board([boardRow(1, "Ben", 4), boardRow(2, "Cal", 2)]),
      board([boardRow(1, "Zed", 6)], false),
    ]);
    expect(rows).toEqual([
      { rank: 1, displayName: "Ben", correct: 7, weeks: 2 },
      { rank: 2, displayName: "Ann", correct: 5, weeks: 1 },
      { rank: 3, displayName: "Cal", correct: 2, weeks: 1 },
    ]);
    expect(seasonLeaderboard([board([boardRow(1, "A", 3), boardRow(1, "B", 3)])]).map((r) => r.rank)).toEqual([1, 1]);
  });
});

describe("buildPickemResultsMessage", () => {
  const base = { season: 2026, week: 5, games: 6, siteUrl: SITE };

  it("names the winner, the board, the season leader, and the next week", () => {
    const e = buildPickemResultsMessage({
      ...base,
      board: board([boardRow(1, "Ann", 5), boardRow(2, "Ben", 3)]),
      leaders: [{ rank: 1, displayName: "Ben", correct: 20, weeks: 5 }],
      next: { week: 6, locksAt: "2026-10-23T00:00:00.000Z" },
    })!.embeds[0];
    expect(e.title).toBe("🎯 Week 5 Pick'em results");
    expect(e.url).toBe(`${SITE}/pickem?week=6&utm_source=discord&utm_campaign=pickem_results`);
    expect(e.description).toContain("🏆 **Ann** wins Week 5 with 5 of 6.");
    expect(e.description).toContain("**1.** Ann — 5\n**2.** Ben — 3");
    expect(e.description).toContain("📈 **Ben** leads the season with 20 correct.");
    expect(e.description).toContain("Week 6 picks are open until <t:1792713600:F>.");
  });

  it("handles a tie, and a season-lead tie", () => {
    const e = buildPickemResultsMessage({
      ...base,
      board: board([boardRow(1, "Ann", 4), boardRow(1, "Ben", 4)]),
      leaders: [
        { rank: 1, displayName: "Ann", correct: 9, weeks: 2 },
        { rank: 1, displayName: "Ben", correct: 9, weeks: 2 },
      ],
      next: null,
    })!.embeds[0];
    expect(e.description).toContain("🏆 **Ann** and **Ben** tie for Week 5 with 4 of 6.");
    expect(e.description).toContain("📈 **Ann** and **Ben** share the season lead with 9 correct.");
    expect(e.url).toContain("/pickem?week=5&");
  });

  it("posts nothing when nobody picked", () => {
    expect(buildPickemResultsMessage({ ...base, board: board([]), leaders: [], next: null })).toBeNull();
  });
});

describe("buildPickemReminderMessage", () => {
  it("gives the lock and a count of players — never who", () => {
    const e = buildPickemReminderMessage({
      week: 7,
      locksAt: "2026-10-23T00:00:00.000Z",
      players: 3,
      games: 6,
      siteUrl: SITE,
    }).embeds[0];
    expect(e.url).toBe(`${SITE}/pickem?week=7&utm_source=discord&utm_campaign=pickem_reminder`);
    expect(e.description).toContain("Pick the winner of all 6 league games. Picks lock <t:1792713600:F> (<t:1792713600:R>).");
    expect(e.description).toContain("3 players in so far.");
  });

  it("says when nobody has picked yet", () => {
    const e = buildPickemReminderMessage({ week: 7, locksAt: "2026-10-23T00:00:00.000Z", players: 0, games: 6, siteUrl: SITE }).embeds[0];
    expect(e.description).toContain("Nobody has picked yet.");
  });
});

describe("FA auctions", () => {
  const NOW = new Date("2026-10-21T18:00:00Z");
  const open = (over: Partial<OpenAuction> = {}): OpenAuction => ({
    playerKey: "nfl:7366",
    ottoneuId: 7366,
    isCollege: false,
    playerName: "Christian Kirk",
    nflTeam: "SF",
    position: "WR",
    injuryStatus: "IR",
    minBid: 2,
    endsAt: "2026-10-22T09:00:00+00:00",
    firstSeenAt: "2026-10-21T09:00:00+00:00",
    ...over,
  });
  const result = (over: Partial<AuctionResult> = {}): AuctionResult => ({
    auctionId: 65780,
    ottoneuId: 13211,
    isCollege: false,
    playerName: "Tyrone Tracy",
    nflTeam: "NYG",
    position: "RB",
    salary: 6,
    endedAtLocal: "2026-10-21T12:52:00",
    startedByTeamName: "The Roseman Empire",
    winnerTeamName: "Marin County Mountain Runners",
    bids: [
      { teamId: 2629, teamName: "Marin County Mountain Runners", amount: 6 },
      { teamId: 2625, teamName: "Ball So Hard University", amount: 5 },
    ],
    ...over,
  });

  describe("auctionStartedKey", () => {
    it("names the auction by player and first sighting, whatever the timestamp spelling", () => {
      expect(auctionStartedKey(open())).toBe("nfl:7366@2026-10-21T09:00:00.000Z");
      expect(auctionStartedKey(open({ firstSeenAt: "2026-10-21T09:00:00Z" }))).toBe(auctionStartedKey(open()));
    });

    it("tells a later auction of the same player apart", () => {
      expect(auctionStartedKey(open({ firstSeenAt: "2026-11-02T09:00:00Z" }))).not.toBe(auctionStartedKey(open()));
    });
  });

  describe("auctionsToPost", () => {
    it("posts results then openings, oldest first", () => {
      const due = auctionsToPost(
        [open({ playerKey: "nfl:2", firstSeenAt: "2026-10-21T10:00:00Z" }), open()],
        [result({ auctionId: 2, endedAtLocal: "2026-10-21T13:00:00" }), result()],
        new Set(),
        NOW,
        "2026-10-20",
      );
      expect(due.map((p) => `${p.id.type}:${p.id.key}`)).toEqual([
        "auction_finished:65780",
        "auction_finished:2",
        "auction_started:nfl:7366@2026-10-21T09:00:00.000Z",
        "auction_started:nfl:2@2026-10-21T10:00:00.000Z",
      ]);
    });

    it("skips what is posted, closed, too old, or has no winner", () => {
      const posted = new Set(["auction_finished:65780"]);
      const due = auctionsToPost(
        [open({ endsAt: "2026-10-21T17:59:00Z" })],
        [result(), result({ auctionId: 1, endedAtLocal: "2026-10-19T23:00:00" }), result({ auctionId: 3, winnerTeamName: null })],
        posted,
        NOW,
        "2026-10-20",
      );
      expect(due).toEqual([]);
    });
  });

  describe("buildAuctionStartedMessage", () => {
    it("carries the player, min bid, a closing timestamp and both links", () => {
      const embed = buildAuctionStartedMessage(open(), SITE).embeds[0];
      expect(embed.title).toBe("🚨 New auction: Christian Kirk");
      expect(embed.url).toMatch(/ottoneu\.fangraphs\.com\/football\/\d+\/auctions$/);
      expect(embed.description).toContain("**SF WR** · IR");
      expect(embed.description).toContain("Min bid **$2** · closes <t:1792659600:R>");
      expect(embed.description).toContain(`${SITE}/free-agents?utm_source=discord&utm_campaign=auction_started`);
    });
  });

  describe("buildAuctionFinishedMessage", () => {
    it("names the winner, the price and every bid, linking the auction", () => {
      const embed = buildAuctionFinishedMessage(result(), SITE).embeds[0];
      expect(embed.title).toBe("✅ Auction won: Tyrone Tracy");
      expect(embed.url).toMatch(/\/auctions\/65780$/);
      expect(embed.description).toContain("**Marin County Mountain Runners** signed **Tyrone Tracy** (NYG RB) for **$6**.");
      expect(embed.description).toContain("🏆 Marin County Mountain Runners — $6\n▫️ Ball So Hard University — $5");
      expect(embed.description).toContain("Started by The Roseman Empire");
      expect(embed.description).toContain(`${SITE}/players/13211?utm_source=discord&utm_campaign=auction_finished`);
      expect(embed.footer.text).toBe("2 bids · closed Oct 21, 12:52 PM ET");
    });

    it("has no site link for a college player", () => {
      const embed = buildAuctionFinishedMessage(result({ isCollege: true }), SITE).embeds[0];
      expect(embed.description).not.toContain("/players/");
    });
  });
});
