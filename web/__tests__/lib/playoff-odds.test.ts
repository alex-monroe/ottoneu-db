/**
 * Playoff-odds Monte Carlo (web/lib/playoff-odds.ts).
 *
 * A four-team league with two playoff spots keeps the expected answers easy to
 * reason about; every invariant checked here (odds sum to the slot count,
 * determinism for a seed, an upgrade never hurts) holds at any league size.
 */

import {
  buildScoreModels,
  computePlayoffOdds,
  deadlineSignal,
  formatOdds,
  simulateSeason,
  type TeamProjection,
} from "@/lib/playoff-odds";
import type { Matchup } from "@/lib/standings";

const IDS: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 };
let nextGameId = 1;

function game(
  week: number,
  home: string,
  homeScore: number | null,
  away: string,
  awayScore: number | null,
  overrides: Partial<Matchup> = {},
): Matchup {
  return {
    game_id: nextGameId++,
    season: 2026,
    week,
    home_team_id: IDS[home],
    home_team_name: home,
    home_score: homeScore,
    away_team_id: IDS[away],
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

/** Weeks 1-2 played, weeks 3-6 to come. A is 2-0 and strong, D 0-2 and weak. */
function season(): Matchup[] {
  return [
    game(1, "A", 120, "B", 100),
    game(1, "C", 105, "D", 95),
    game(2, "A", 125, "C", 100),
    game(2, "B", 110, "D", 90),
    game(3, "A", null, "D", null),
    game(3, "B", null, "C", null),
    game(4, "A", null, "B", null),
    game(4, "C", null, "D", null),
    game(5, "A", null, "C", null),
    game(5, "B", null, "D", null),
    game(6, "A", null, "D", null),
    game(6, "B", null, "C", null),
  ];
}

const opts = { simulations: 2000, seed: 7, slots: 2 };

describe("buildScoreModels", () => {
  it("uses the projection when there is one, season PPG otherwise", () => {
    const models = buildScoreModels(season(), new Map([[1, { rate: 140 }]]));
    expect(models.get(1)!.mean).toBe(140);
    expect(models.get(1)!.source).toBe("projection");
    expect(models.get(2)!.mean).toBeCloseTo(105);
    expect(models.get(2)!.source).toBe("season_ppg");
  });

  it("treats a zero projection as missing (no roster data), not a forecast", () => {
    const models = buildScoreModels(season(), new Map([[1, { rate: 0 }]]));
    expect(models.get(1)!.source).toBe("season_ppg");
    expect(models.get(1)!.mean).toBeCloseTo(122.5);
  });

  it("falls back to the league average for a team with no games and no projection", () => {
    const models = buildScoreModels([game(1, "A", 100, "B", 80), game(2, "C", null, "D", null)]);
    expect(models.get(3)!.source).toBe("league_average");
    expect(models.get(3)!.mean).toBeCloseTo(90);
  });

  it("shrinks a team's own spread toward the league's pooled spread", () => {
    const matchups = [
      // A is wild (sd ~ 42), B is steady (sd 0), C/D in between.
      game(1, "A", 60, "B", 100),
      game(2, "A", 140, "B", 100),
      game(1, "C", 90, "D", 100),
      game(2, "C", 110, "D", 80),
    ];
    const models = buildScoreModels(matchups);
    const a = models.get(1)!.sd;
    const b = models.get(2)!.sd;
    expect(b).toBeGreaterThan(0); // never a machine
    expect(a).toBeGreaterThan(b);
    expect(a).toBeLessThan(Math.sqrt(3200)); // pulled in from its raw sd
  });

  it("assumes a spread proportional to the mean before anyone has two scores", () => {
    const models = buildScoreModels(season().slice(0, 2));
    expect(models.get(1)!.sd).toBeCloseTo(0.2 * 120);
  });

  it("keeps a week-specific projection apart from the rate", () => {
    const proj: TeamProjection = { rate: 130, byWeek: new Map([[3, 90]]) };
    const models = buildScoreModels(season(), new Map([[1, proj]]));
    expect(models.get(1)!.mean).toBe(130);
    expect(models.get(1)!.byWeek.get(3)).toBe(90);
  });
});

describe("simulateSeason", () => {
  it("is deterministic for a seed", () => {
    const models = buildScoreModels(season());
    expect(simulateSeason(season(), models, opts)).toEqual(simulateSeason(season(), models, opts));
  });

  it("hands out exactly `slots` playoff spots and one #1 seed per season", () => {
    const rows = simulateSeason(season(), buildScoreModels(season()), opts);
    expect(rows.reduce((s, r) => s + r.playoff_odds, 0)).toBeCloseTo(2);
    expect(rows.reduce((s, r) => s + r.top_seed_odds, 0)).toBeCloseTo(1);
  });

  it("expected wins add up to wins banked plus games left", () => {
    const rows = simulateSeason(season(), buildScoreModels(season()), opts);
    // 4 games played + 8 to play, one winner each.
    expect(rows.reduce((s, r) => s + r.expected_wins, 0)).toBeCloseTo(12, 1);
    const a = rows.find((r) => r.team_id === 1)!;
    expect(a.expected_wins).toBeGreaterThanOrEqual(2);
    expect(a.expected_wins).toBeLessThanOrEqual(6);
  });

  it("favours the strong team and fades the weak one", () => {
    const rows = simulateSeason(season(), buildScoreModels(season()), opts);
    const odds = Object.fromEntries(rows.map((r) => [r.team_id, r.playoff_odds]));
    expect(odds[1]).toBeGreaterThan(0.9);
    expect(odds[4]).toBeLessThan(0.15);
    expect(odds[1]).toBeGreaterThan(odds[2]);
  });

  it("reproduces the standings exactly once every game is final", () => {
    const done = [game(1, "A", 100, "B", 90), game(1, "C", 80, "D", 120)];
    const rows = simulateSeason(done, buildScoreModels(done), opts);
    const odds = Object.fromEntries(rows.map((r) => [r.team_id, r.playoff_odds]));
    // A and D are 1-0; D leads on points for.
    expect(odds).toEqual({ 1: 1, 2: 0, 3: 0, 4: 1 });
    expect(rows.find((r) => r.top_seed_odds === 1)!.team_id).toBe(4);
  });

  it("draws a game in progress around its live projection", () => {
    const matchups = [
      game(1, "A", 100, "B", 100.5),
      game(1, "C", 100, "D", 99),
      // A is losing on paper but the live projection says it is running away.
      game(2, "A", 20, "B", 30, { status: "in_progress" }),
      game(2, "C", null, "D", null),
    ];
    const models = buildScoreModels(matchups);
    const live = new Map([[matchups[2].game_id, { home: 160, away: 60 }]]);
    const withLive = simulateSeason(matchups, models, { ...opts, liveMeans: live });
    const without = simulateSeason(matchups, models, opts);
    const a = (rows: typeof withLive) => rows.find((r) => r.team_id === 1)!.expected_wins;
    expect(a(withLive)).toBeGreaterThan(0.99); // lost week 1, wins week 2
    expect(a(without)).toBeLessThan(a(withLive));
  });

  it("uses a week's own projection for that week's game", () => {
    const base = season();
    const steady = new Map<number, TeamProjection>([
      [1, { rate: 120 }],
      [4, { rate: 120 }],
    ]);
    // A is projected at 40 in week 3 (byes), against D.
    const byes = new Map<number, TeamProjection>([
      [1, { rate: 120, byWeek: new Map([[3, 40]]) }],
      [4, { rate: 120 }],
    ]);
    const wins = (p: Map<number, TeamProjection>) =>
      simulateSeason(base, buildScoreModels(base, p), opts).find((r) => r.team_id === 4)!
        .expected_wins;
    expect(wins(byes)).toBeGreaterThan(wins(steady) + 0.4);
  });

  it("ignores playoff-bracket games", () => {
    const matchups = [...season(), game(7, "D", null, "A", null, { game_type: "playoff" })];
    const models = buildScoreModels(matchups);
    const total = simulateSeason(matchups, models, opts).reduce((s, r) => s + r.expected_wins, 0);
    expect(total).toBeCloseTo(12, 1);
  });
});

describe("computePlayoffOdds", () => {
  it("an upgrade never lowers a team's odds (common random numbers)", () => {
    const result = computePlayoffOdds(season(), buildScoreModels(season()), opts);
    for (const t of result.teams) {
      expect(t.boosted_playoff_odds).toBeGreaterThanOrEqual(t.playoff_odds);
      expect(t.odds_gain).toBeCloseTo(t.boosted_playoff_odds - t.playoff_odds);
    }
  });

  it("labels the bubble team a buyer, the long shot a seller and the lock a hold", () => {
    // B and C are dead level for the second spot; D is buried; A is in.
    const matchups = [
      game(1, "A", 150, "D", 60),
      game(1, "B", 100, "C", 100.1),
      game(2, "A", 150, "C", 99),
      game(2, "B", 100, "D", 60),
      game(3, "A", null, "B", null),
      game(3, "C", null, "D", null),
      game(4, "B", null, "C", null),
      game(4, "A", null, "D", null),
    ];
    const result = computePlayoffOdds(matchups, buildScoreModels(matchups), {
      ...opts,
      boostPpg: 15,
    });
    const signal = Object.fromEntries(result.teams.map((t) => [t.team_name, t.signal]));
    expect(signal.A).toBe("hold");
    expect(signal.D).toBe("seller");
    expect(["B", "C"].map((n) => signal[n])).toContain("buyer");
  });

  it("reports the signal active only before a known deadline", () => {
    const models = buildScoreModels(season());
    const before = computePlayoffOdds(season(), models, {
      ...opts,
      tradeDeadline: "2026-12-01",
      today: "2026-11-30",
    });
    const after = computePlayoffOdds(season(), models, {
      ...opts,
      tradeDeadline: "2026-12-01",
      today: "2026-12-02",
    });
    const unknown = computePlayoffOdds(season(), models, { ...opts, today: "2026-11-01" });
    expect(before.signal_active).toBe(true);
    expect(before.trade_deadline).toBe("2026-12-01");
    expect(after.signal_active).toBe(false);
    expect(unknown.signal_active).toBe(false);
    expect(before.games_remaining).toBe(8);
  });

  it("returns teams in standings order", () => {
    const result = computePlayoffOdds(season(), buildScoreModels(season()), opts);
    expect(result.teams[0].team_name).toBe("A");
    expect(result.teams).toHaveLength(4);
  });
});

describe("deadlineSignal", () => {
  it.each([
    [0.05, 0.1, "seller"],
    [0.4, 0.55, "buyer"],
    [0.4, 0.44, "hold"],
    [0.97, 0.99, "hold"],
    [0.1, 0.2, "buyer"],
  ])("odds %p → %p is a %s", (odds, boosted, expected) => {
    expect(deadlineSignal(odds, boosted)).toBe(expected);
  });
});

describe("formatOdds", () => {
  it("never prints a simulated certainty", () => {
    expect(formatOdds(0)).toBe("<1%");
    expect(formatOdds(1)).toBe(">99%");
    expect(formatOdds(0.624)).toBe("62%");
  });
});
