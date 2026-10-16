/**
 * Cap-loan trade valuation (web/lib/loan-trade.ts).
 *
 * The engine is two models — a season simulation for this year's title odds
 * and a keep-or-cut option model for future seasons — joined by one exchange
 * rate (`titleValue`). These tests pin each model's behaviour on cases whose
 * answer is known, then the joined valuation on a small league.
 */

import {
  bracketOrder,
  estimateWeeklySd,
  keeperOptionValue,
  makeNormal,
  projectedWeeklyPoints,
  seasonStateFromMatchups,
  simulateTitleOdds,
  valueLoanTrade,
  type LoanTradePlayer,
  type LoanTradeSettings,
} from "@/lib/loan-trade";
import type { Matchup } from "@/lib/standings";

let nextGameId = 1;
function game(
  week: number,
  home: string,
  homeScore: number | null,
  away: string,
  awayScore: number | null,
): Matchup {
  return {
    game_id: nextGameId++,
    season: 2026,
    week,
    home_team_id: 0,
    home_team_name: home,
    home_score: homeScore,
    away_team_id: 0,
    away_team_name: away,
    away_score: awayScore,
    status: homeScore == null ? "scheduled" : "final",
    game_type: "regular",
    starts_on: null,
    ends_on: null,
    status_label: null,
  };
}

const keeperSettings = {
  keeperYears: 1,
  keeperDiscount: 1,
  valueUncertainty: 0,
  minValueSd: 0.0001,
  annualRaise: 4,
};

describe("bracketOrder", () => {
  it("keeps the top two seeds apart until the final", () => {
    expect(bracketOrder(2)).toEqual([1, 2]);
    expect(bracketOrder(4)).toEqual([1, 4, 2, 3]);
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe("makeNormal", () => {
  it("is reproducible and roughly standard normal", () => {
    const a = makeNormal(7);
    const b = makeNormal(7);
    const xs = Array.from({ length: 20000 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs.slice(0, 5));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });
});

describe("seasonStateFromMatchups", () => {
  it("banks final games, counts ties as half a win, and queues the rest", () => {
    const state = seasonStateFromMatchups([
      game(1, "A", 100, "B", 90),
      game(1, "C", 80, "D", 80),
      game(2, "A", null, "C", null),
    ]);
    expect(state.teams).toEqual(["A", "B", "C", "D"]);
    expect(state.record.get("A")).toEqual({ wins: 1, points_for: 100 });
    expect(state.record.get("C")).toEqual({ wins: 0.5, points_for: 80 });
    expect(state.remaining).toEqual([["A", "C"]]);
  });
});

describe("estimateWeeklySd", () => {
  it("needs a few games per team before it will answer", () => {
    expect(estimateWeeklySd([game(1, "A", 100, "B", 90)])).toBeNull();
  });

  it("pools each team's spread around its own mean", () => {
    // A: 90, 110 (mean 100) · B: 80, 120 (mean 100) → pooled SS 1000 over 2 dof.
    const sd = estimateWeeklySd([game(1, "A", 90, "B", 80), game(2, "A", 110, "B", 120)], 2);
    expect(sd).toBeCloseTo(Math.sqrt(1000 / 2));
  });
});

describe("simulateTitleOdds", () => {
  const teams = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const schedule: Matchup[] = [];
  for (let w = 1; w <= 4; w++) {
    const rotated = teams.map((_, i) => teams[(i + w) % teams.length]);
    for (let i = 0; i < rotated.length; i += 2) schedule.push(game(w, rotated[i], null, rotated[i + 1], null));
  }
  const state = seasonStateFromMatchups(schedule);
  const means = new Map(teams.map((t, i) => [t, 100 + i]));

  it("hands out exactly one title and the right number of playoff spots", () => {
    const odds = simulateTitleOdds(state, means, 20, 2000, 1, 6);
    const titles = [...odds.title.values()].reduce((a, b) => a + b, 0);
    const spots = [...odds.playoffs.values()].reduce((a, b) => a + b, 0);
    expect(titles).toBeCloseTo(1, 6);
    expect(spots).toBeCloseTo(6, 6);
  });

  it("favours the stronger team, and a stronger roster raises its odds", () => {
    const base = simulateTitleOdds(state, means, 20, 4000, 3, 6);
    expect(base.title.get("H")!).toBeGreaterThan(base.title.get("A")!);
    const boosted = simulateTitleOdds(state, new Map([...means, ["A", 125]]), 20, 4000, 3, 6);
    expect(boosted.title.get("A")!).toBeGreaterThan(base.title.get("A")! + 0.05);
  });

  it("gives identical answers for identical inputs", () => {
    const a = simulateTitleOdds(state, means, 20, 500, 9, 6);
    const b = simulateTitleOdds(state, means, 20, 500, 9, 6);
    expect([...a.title]).toEqual([...b.title]);
  });
});

describe("keeperOptionValue", () => {
  it("is the surplus after the raise when the value is certain and covers it", () => {
    expect(keeperOptionValue(30, 10, keeperSettings, 200)).toBeCloseTo(16, 3);
  });

  it("is zero, not negative, for a contract nobody would keep", () => {
    expect(keeperOptionValue(10, 40, keeperSettings, 200)).toBe(0);
  });

  it("rewards uncertainty for an at-the-money player — cuts are free", () => {
    const calm = keeperOptionValue(20, 16, { ...keeperSettings, valueUncertainty: 0.1 });
    const wild = keeperOptionValue(20, 16, { ...keeperSettings, valueUncertainty: 0.6 });
    expect(wild).toBeGreaterThan(calm);
  });

  it("adds later seasons only while the player is still being kept", () => {
    const one = keeperOptionValue(30, 10, keeperSettings, 200);
    const two = keeperOptionValue(30, 10, { ...keeperSettings, keeperYears: 2 }, 200);
    // Year two: 30 − (10 + 8) = 12 more.
    expect(two - one).toBeCloseTo(12, 3);
  });
});

describe("valueLoanTrade", () => {
  // Four teams; each fields 1 QB, 2 RB, 2 WR, 1 TE, flex, superflex, K.
  const positions = ["QB", "QB", "RB", "RB", "RB", "WR", "WR", "WR", "TE", "K"];
  const players: LoanTradePlayer[] = [];
  const teams = ["Contender", "Rebuilder", "Middle", "Other"];
  teams.forEach((team) => {
    positions.forEach((position, i) => {
      players.push({
        player_id: `${team}-${i}`,
        name: `${team} ${position}${i}`,
        position,
        nfl_team: "FA",
        team_name: team,
        salary: 10,
        ppg: team === "Contender" ? 12 : team === "Rebuilder" ? 8 : 10,
        dollar_value: 10,
      });
    });
  });
  // The rebuilder's star WR, and a cheap young QB the contender holds.
  players.push({ player_id: "star", name: "Star WR", position: "WR", nfl_team: "FA", team_name: "Rebuilder", salary: 70, ppg: 25, dollar_value: 55 });
  players.push({ player_id: "kid", name: "Kid QB", position: "QB", nfl_team: "FA", team_name: "Contender", salary: 4, ppg: 5, dollar_value: 25 });

  const schedule = [
    game(1, "Contender", null, "Middle", null),
    game(1, "Rebuilder", null, "Other", null),
    game(2, "Contender", null, "Other", null),
    game(2, "Rebuilder", null, "Middle", null),
  ];
  const state = seasonStateFromMatchups(schedule);
  const settings: LoanTradeSettings = {
    titleValue: 100,
    lenderCapValue: 0.1,
    keeperYears: 2,
    keeperDiscount: 0.75,
    valueUncertainty: 0.4,
    minValueSd: 5,
    annualRaise: 4,
    weeklySd: 20,
    simulations: 3000,
    seed: 5,
  };
  const result = valueLoanTrade(
    { borrower: "Contender", lender: "Rebuilder", toBorrower: ["star"], toLender: ["kid"], loan: 60 },
    players,
    state,
    settings,
    400,
  );

  it("raises the borrower's projection and title odds", () => {
    expect(result.borrower.weeklyAfter).toBeGreaterThan(result.borrower.weeklyBefore);
    expect(result.borrower.titleAfter).toBeGreaterThan(result.borrower.titleBefore);
    expect(result.borrower.thisSeasonValue).toBeGreaterThan(0);
  });

  it("pays the lender in keeper value, net of the cap it gave up", () => {
    expect(result.lender.keeperValue).toBeGreaterThan(0);
    expect(result.lender.capCost).toBeCloseTo(6);
    expect(result.keeperPerLoanDollar).toBeCloseTo(result.lender.keeperValue / 60);
  });

  it("moves the cap with the loan and the salary with the players", () => {
    expect(result.borrower.capAfter).toBe(460);
    expect(result.lender.capAfter).toBe(340);
    expect(result.borrower.payrollAfter).toBe(100 + 70);
    expect(result.lender.payrollAfter).toBe(100 + 4);
  });

  it("is zero-sum in keeper value and sums its parts", () => {
    expect(result.borrower.keeperValue + result.lender.keeperValue).toBeCloseTo(0);
    for (const s of [result.borrower, result.lender]) {
      expect(s.net).toBeCloseTo(s.thisSeasonValue + s.keeperValue - s.capCost);
    }
    expect(result.jointGain).toBeCloseTo(result.borrower.net + result.lender.net);
  });

  it("projects a lineup from the best eligible players", () => {
    const contender = players.filter((p) => p.team_name === "Contender");
    // Nine starters at 12 PPG, the young QB stays on the bench.
    expect(projectedWeeklyPoints(contender)).toBeCloseTo(9 * 12);
  });
});
