/**
 * Trade builder — `web/lib/trade-builder.ts`.
 *
 * Pins the four reads a manager makes before proposing a trade: the starting
 * lineup on season PPG, rest-of-season value at pace, keeper value floored at
 * zero, and cap room / roster spots with a loan.
 */

import {
  evaluateTrade,
  keeperValue,
  lineupPpg,
  nextSalary,
  replayTrade,
  seasonPace,
  tradeFromQuery,
  tradeToQuery,
  type BuilderContext,
  type BuilderPlayer,
  type RecordedAsset,
} from "@/lib/trade-builder";

function p(
  playerId: string,
  position: string,
  ppg: number,
  salary: number,
  pace = 0,
  next = salary + 4,
): BuilderPlayer {
  return {
    playerId,
    ottoneuId: 0,
    name: playerId,
    position,
    nflTeam: "SF",
    salary,
    ppg,
    gamesPlayed: ppg > 0 ? 5 : 0,
    earnedToDate: pace * 0.3,
    seasonPace: pace,
    nextSalary: next,
  };
}

/** A starting nine plus one bench player. */
function roster(prefix: string): BuilderPlayer[] {
  return [
    p(`${prefix}qb1`, "QB", 20, 40, 60),
    p(`${prefix}qb2`, "QB", 15, 20, 30),
    p(`${prefix}rb1`, "RB", 14, 30, 40),
    p(`${prefix}rb2`, "RB", 10, 10, 15),
    p(`${prefix}wr1`, "WR", 13, 25, 35),
    p(`${prefix}wr2`, "WR", 11, 12, 20),
    p(`${prefix}wr3`, "WR", 9, 5, 10),
    p(`${prefix}te1`, "TE", 8, 6, 9),
    p(`${prefix}k1`, "K", 7, 1, 0),
    p(`${prefix}rb3`, "RB", 4, 2, 2),
  ];
}

function ctx(overrides: Partial<BuilderContext> = {}): BuilderContext {
  return {
    teams: [
      { teamName: "Alpha", players: roster("a") },
      { teamName: "Beta", players: roster("b") },
    ],
    capPerTeam: 400,
    rosterSpots: 10,
    remainingFraction: 0.5,
    ...overrides,
  };
}

const trade = (o: Partial<Parameters<typeof evaluateTrade>[1]> = {}) => ({
  teamA: "Alpha",
  teamB: "Beta",
  aSends: [] as string[],
  bSends: [] as string[],
  loanAtoB: 0,
  loanBtoA: 0,
  ...o,
});

describe("helpers", () => {
  it("scales earned value to a full-season pace", () => {
    expect(seasonPace(30, 0.3)).toBeCloseTo(100);
    expect(seasonPace(30, 0)).toBe(0);
  });

  it("raises next season's salary by whether he played", () => {
    expect(nextSalary(10, 3, 4, 1)).toBe(14);
    expect(nextSalary(10, 0, 4, 1)).toBe(11);
  });

  it("floors keeper value at zero", () => {
    expect(keeperValue({ seasonPace: 50, nextSalary: 30 })).toBe(20);
    expect(keeperValue({ seasonPace: 10, nextSalary: 30 })).toBe(0);
  });

  it("scores the optimal Superflex lineup, ignoring the bench", () => {
    // QB 20 + RB 14 + RB 10 + WR 13 + WR 11 + TE 8 + FLEX WR 9 + SF QB 15 + K 7.
    expect(lineupPpg(roster("a"))).toBeCloseTo(107);
  });
});

describe("evaluateTrade", () => {
  it("is null until a player or loan moves between two different teams", () => {
    expect(evaluateTrade(ctx(), trade())).toBeNull();
    expect(evaluateTrade(ctx(), trade({ teamB: "Alpha", aSends: ["aqb1"] }))).toBeNull();
    expect(evaluateTrade(ctx(), trade({ teamB: "Nobody", aSends: ["aqb1"] }))).toBeNull();
  });

  it("moves bench-only players without touching either lineup", () => {
    const e = evaluateTrade(ctx(), trade({ aSends: ["arb3"], bSends: ["brb3"] }))!;
    expect(e.a.lineupDelta).toBe(0);
    expect(e.b.lineupDelta).toBe(0);
  });

  it("credits the lineup gain to the side that receives the better starter", () => {
    // Alpha sends its RB1 (14 PPG) for Beta's bench RB (4). Beta's RB2 (10)
    // slides to FLEX over the 9-PPG WR3: +14 − 9 = +5. Alpha starts the two
    // 4-PPG backs beside its RB2 (10): −14 + 4 = −10.
    const e = evaluateTrade(ctx(), trade({ aSends: ["arb1"], bSends: ["brb3"] }))!;
    expect(e.a.lineupDelta).toBeCloseTo(-10);
    expect(e.b.lineupDelta).toBeCloseTo(5);
    expect(e.a.receives.map((x) => x.playerId)).toEqual(["brb3"]);
    expect(e.b.receives.map((x) => x.playerId)).toEqual(["arb1"]);
  });

  it("values the weeks left at each player's pace", () => {
    // aqb1 pace 60, brb1 pace 40, half the season left.
    const e = evaluateTrade(ctx(), trade({ aSends: ["aqb1"], bSends: ["brb1"] }))!;
    expect(e.a.restOfSeasonNet).toBeCloseTo((40 - 60) * 0.5);
    expect(e.b.restOfSeasonNet).toBeCloseTo((60 - 40) * 0.5);
  });

  it("reports no rest-of-season value when the schedule is unknown", () => {
    const e = evaluateTrade(ctx({ remainingFraction: null }), trade({ aSends: ["aqb1"] }))!;
    expect(e.a.restOfSeasonNet).toBeNull();
  });

  it("nets keeper value with each contract floored at zero", () => {
    // aqb1: pace 60 vs next 44 → 16. brb2: pace 15 vs next 14 → 1.
    const e = evaluateTrade(ctx(), trade({ aSends: ["aqb1"], bSends: ["brb2"] }))!;
    expect(e.a.keeperNet).toBeCloseTo(1 - 16);
    expect(e.b.keeperNet).toBeCloseTo(16 - 1);
  });

  it("moves cap room by salary and the loan", () => {
    // Alpha's payroll is 151; it sends $40, takes $10, and lends Beta $5.
    const e = evaluateTrade(ctx(), trade({ aSends: ["aqb1"], bSends: ["brb2"], loanAtoB: 5 }))!;
    expect(e.a.capBefore).toBe(400 - 151);
    expect(e.a.capAfter).toBe(400 - 151 + 40 - 10 - 5);
    expect(e.b.capAfter).toBe(400 - 151 - 40 + 10 + 5);
  });

  it("warns when a side goes over the cap or the roster limit", () => {
    const tight = ctx({ capPerTeam: 160 });
    const e = evaluateTrade(tight, trade({ bSends: ["bqb1", "bqb2"] }))!;
    // Alpha takes $60 of salary with only $9 of room and two extra bodies.
    expect(e.a.capAfter).toBe(160 - 151 - 60);
    expect(e.a.warnings.some((w) => w.includes("over the cap"))).toBe(true);
    expect(e.a.rosterAfter).toBe(12);
    expect(e.a.warnings.some((w) => w.includes("2 cuts"))).toBe(true);
    expect(e.b.warnings).toEqual([]);
  });

  it("does not repeat a team's existing overage on a trade that eases it", () => {
    // Already over on salary and bodies (loans, penalties and IR are unknown):
    // a trade that sheds salary and a player warns about neither.
    const over = ctx({ capPerTeam: 100, rosterSpots: 9 });
    const e = evaluateTrade(over, trade({ aSends: ["aqb1"] }))!;
    expect(e.a.capAfter).toBeLessThan(0);
    expect(e.a.warnings).toEqual([]);
    expect(e.b.warnings.length).toBe(2);
  });

  it("accepts a loan-only trade", () => {
    const e = evaluateTrade(ctx(), trade({ loanBtoA: 20 }))!;
    expect(e.a.capAfter - e.a.capBefore).toBe(20);
    expect(e.b.capAfter - e.b.capBefore).toBe(-20);
  });

  it("ignores ids not on the sending team's roster", () => {
    const e = evaluateTrade(ctx(), trade({ aSends: ["aqb1", "bqb1"] }))!;
    expect(e.a.sends.map((x) => x.playerId)).toEqual(["aqb1"]);
  });
});

describe("query string", () => {
  it("round-trips a trade", () => {
    const t = trade({ aSends: ["1", "2"], bSends: ["3"], loanAtoB: 7 });
    const params = Object.fromEntries(new URLSearchParams(tradeToQuery(t)));
    expect(tradeFromQuery(params)).toEqual(t);
  });

  it("tolerates missing and malformed params", () => {
    expect(tradeFromQuery({ la: "-4", lb: "abc", as: "" })).toEqual({
      teamA: "",
      teamB: "",
      aSends: [],
      bSends: [],
      loanAtoB: 0,
      loanBtoA: 0,
    });
  });
});

describe("replayTrade", () => {
  const same = (x: string, y: string) => x.trim() === y.trim();
  const lookupOf = (c: BuilderContext) =>
    new Map(c.teams.flatMap((t) => t.players).map((pl) => [pl.playerId, pl]));
  const move = (playerId: string | null, fromTeam: string, toTeam: string, name = playerId ?? "?"): RecordedAsset => ({
    kind: "player",
    playerId,
    name,
    fromTeam,
    toTeam,
    amount: 0,
  });

  /** Alpha's QB1 for Beta's RB1, already processed: each sits on his new team. */
  function afterTrade(): BuilderContext {
    const c = ctx();
    const alpha = c.teams[0].players, beta = c.teams[1].players;
    const qb = alpha.splice(alpha.findIndex((x) => x.playerId === "aqb1"), 1)[0];
    const rb = beta.splice(beta.findIndex((x) => x.playerId === "brb1"), 1)[0];
    alpha.push(rb);
    beta.push(qb);
    return c;
  }

  it("rewinds a processed trade and pre-selects both sides", () => {
    const c = afterTrade();
    const r = replayTrade(c.teams, [move("aqb1", "Alpha", "Beta"), move("brb1", "Beta", "Alpha")], lookupOf(c), same)!;
    expect(r.trade).toEqual(trade({ aSends: ["aqb1"], bSends: ["brb1"] }));
    const ids = (team: string) => r.teams.find((t) => t.teamName === team)!.players.map((x) => x.playerId);
    expect(ids("Alpha")).toContain("aqb1");
    expect(ids("Alpha")).not.toContain("brb1");
    expect(ids("Beta")).toContain("brb1");
    // Evaluated on the rewound rosters, it is the original trade.
    const e = evaluateTrade({ ...c, teams: r.teams }, r.trade)!;
    expect(e.a.receives.map((x) => x.playerId)).toEqual(["brb1"]);
  });

  it("leaves a pending trade's rosters as they are", () => {
    const c = ctx();
    const r = replayTrade(c.teams, [move("aqb1", "Alpha", "Beta")], lookupOf(c), same)!;
    expect(r.teams.find((t) => t.teamName === "Alpha")!.players).toHaveLength(10);
    expect(r.trade.aSends).toEqual(["aqb1"]);
  });

  it("finds a player who has since been cut, and matches team names loosely", () => {
    const c = ctx();
    const cut = c.teams[1].players.splice(0, 1)[0]; // Beta's QB1, now a free agent
    const lookup = new Map([...lookupOf(c), [cut.playerId, cut]]);
    const r = replayTrade(c.teams, [move(cut.playerId, "Beta ", "Alpha")], lookup, same)!;
    expect(r.trade.teamA).toBe("Beta");
    expect(r.trade.aSends).toEqual([cut.playerId]);
    expect(r.teams.find((t) => t.teamName === "Beta")!.players.map((x) => x.playerId)).toContain(cut.playerId);
  });

  it("carries loans and reports players it cannot place", () => {
    const c = ctx();
    const r = replayTrade(
      c.teams,
      [
        move("aqb1", "Alpha", "Beta"),
        move(null, "Beta", "Alpha", "Mystery Rookie"),
        { kind: "loan", playerId: null, name: "Loan", fromTeam: "Beta", toTeam: "Alpha", amount: 12 },
      ],
      lookupOf(c),
      same,
    )!;
    expect(r.trade.loanBtoA).toBe(12);
    expect(r.missing).toEqual(["Mystery Rookie"]);
  });

  it("is null when the trade's teams are not two known teams", () => {
    const c = ctx();
    expect(replayTrade(c.teams, [move("aqb1", "Alpha", "Gamma")], lookupOf(c), same)).toBeNull();
  });
});

describe("replay query string", () => {
  it("keeps the trade id alongside edited selections", () => {
    const q = new URLSearchParams(tradeToQuery(trade({ aSends: ["1"] }), 39466));
    expect(q.get("trade")).toBe("39466");
    expect(q.get("as")).toBe("1");
  });
});
