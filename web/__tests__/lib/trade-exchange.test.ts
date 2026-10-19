/**
 * Inputs for the trade exchange-rate fit (web/lib/trade-exchange.ts): the
 * season rewound to a trade day, odds from it, and one row per trade side.
 */

import { exchangeSides, oddsOnDay, rewindMatchups } from "@/lib/trade-exchange";
import type { Matchup } from "@/lib/standings";
import type { LeagueTrade, TradeValuation } from "@/lib/trades";

const IDS: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 };
let nextGameId = 1;

/** Week k ends 2026-09-(14 + 7k − 7): week 1 → 09-15, week 2 → 09-22, … */
function endOf(week: number): string {
  const d = new Date(Date.UTC(2026, 8, 15 + 7 * (week - 1)));
  return d.toISOString().slice(0, 10);
}

function game(week: number, home: string, hs: number | null, away: string, as: number | null, season = 2026): Matchup {
  return {
    game_id: nextGameId++,
    season,
    week,
    home_team_id: IDS[home],
    home_team_name: home,
    home_score: hs,
    away_team_id: IDS[away],
    away_team_name: away,
    away_score: as,
    status: hs == null ? "scheduled" : "final",
    game_type: "regular",
    starts_on: null,
    ends_on: endOf(week),
    status_label: null,
  };
}

/** Six weeks, all played. A is strong, D weak. */
function season(year = 2026): Matchup[] {
  const pairs: [string, string][][] = [
    [["A", "D"], ["B", "C"]],
    [["A", "C"], ["B", "D"]],
    [["A", "B"], ["C", "D"]],
  ];
  const strength: Record<string, number> = { A: 140, B: 110, C: 105, D: 80 };
  const out: Matchup[] = [];
  for (let w = 1; w <= 6; w++) {
    for (const [h, a] of pairs[(w - 1) % 3]) out.push(game(w, h, strength[h], a, strength[a], year));
  }
  return out;
}

describe("rewindMatchups", () => {
  it("resets every game whose week had not ended by the trade day", () => {
    const rewound = rewindMatchups(season(), endOf(2)); // day = end of week 2
    const final = rewound.filter((m) => m.status === "final").map((m) => m.week);
    // Week 2 ends on the trade day itself, so it is not finished yet.
    expect(new Set(final)).toEqual(new Set([1]));
    expect(rewound.filter((m) => m.week >= 2).every((m) => m.home_score == null)).toBe(true);
  });

  it("does not mutate its input", () => {
    const games = season();
    rewindMatchups(games, "2026-01-01");
    expect(games.every((m) => m.status === "final")).toBe(true);
  });
});

describe("oddsOnDay", () => {
  it("is empty when the season has no schedule", () => {
    expect(oddsOnDay([], season(2025), "2026-10-01").size).toBe(0);
  });

  it("is empty for an offseason day with no last season to rate teams on", () => {
    expect(oddsOnDay(season(), [], "2026-08-01").size).toBe(0);
  });

  it("rates an offseason day on last season's PPG", () => {
    const odds = oddsOnDay(season(), season(2025), "2026-08-01", { simulations: 500, slots: 2 });
    expect(odds.get("A")!.playoff_odds).toBeGreaterThan(odds.get("D")!.playoff_odds);
    const total = [...odds.values()].reduce((s, t) => s + t.playoff_odds, 0);
    expect(total).toBeCloseTo(2, 5); // two spots, filled every simulated season
  });

  it("reads the record as of the trade day, not today", () => {
    const odds = oddsOnDay(season(), [], endOf(3), { simulations: 500, slots: 2 });
    // Weeks 1-2 played: A 2-0, D 0-2.
    expect(odds.get("A")!.wins).toBe(2);
    expect(odds.get("D")!.losses).toBe(2);
    expect(odds.get("A")!.rank).toBe(1);
  });

  it("is deterministic", () => {
    const a = oddsOnDay(season(), season(2025), endOf(3), { simulations: 300, slots: 2 });
    const b = oddsOnDay(season(), season(2025), endOf(3), { simulations: 300, slots: 2 });
    expect([...a.values()]).toEqual([...b.values()]);
  });
});

describe("exchangeSides", () => {
  const trade: LeagueTrade = {
    key: "th:1",
    source: "trade_history",
    ottoneuTradeId: 1,
    status: "processed",
    season: 2026,
    acceptedAt: "2026-09-25T10:00",
    processedAt: "2026-09-27T10:00",
    teams: ["A", "D"],
    assets: [],
    loansKnown: true,
  };
  const asset = (name: string, from: string, to: string, value: number) => ({
    asset: {
      kind: "player" as const, playerId: name, ottoneuId: null, isCollege: false, name,
      position: "RB", amount: 10, fromTeam: from, toTeam: to,
    },
    value, unprojected: false, nextValue: value, nextIsProxy: false, nextSalary: 14,
    keeperValue: null, keeper: null, realizedNext: null,
  });
  const valuation: TradeValuation = {
    trade,
    remaining: 0.5,
    sides: [
      { team: "A", gave: [asset("young", "A", "D", 5)], got: [asset("vet", "D", "A", 40)],
        loanOut: 0, loanIn: 0, seasonNet: 18, keeperNet: null, capNet: 0, realizedNextNet: null },
      { team: "D", gave: [asset("vet", "D", "A", 40)], got: [asset("young", "A", "D", 5)],
        loanOut: 0, loanIn: 0, seasonNet: -18, keeperNet: null, capNet: 0, realizedNextNet: null },
    ],
  };

  it("emits both sides with the trade week and each team's odds", () => {
    const sides = exchangeSides([valuation], new Map([[2026, season()], [2025, season(2025)]]), { simulations: 200, slots: 2 });
    expect(sides).toHaveLength(2);
    expect(sides[0]).toMatchObject({ team: "A", counterparty: "D", season_net: 18, as_of_week: 2, remaining: 0.5 });
    expect(sides[0].got[0]).toMatchObject({ player_id: "vet", salary: 10, next_salary: 14, value: 40 });
    expect(sides[0].odds!.playoff_odds).toBeGreaterThan(sides[1].odds!.playoff_odds);
  });

  it("leaves odds and week unknown when the season has no schedule", () => {
    const [a] = exchangeSides([valuation], new Map(), { simulations: 200, slots: 2 });
    expect(a.odds).toBeNull();
    expect(a.as_of_week).toBeNull();
  });
});
