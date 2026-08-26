import { athleticPool, boardStats } from "@/lib/snake-draft-engine";
import {
  botPick,
  buildBoard,
  DEFAULT_SETTINGS,
  isComplete,
  isUserOnClock,
  LINEUP_1QB,
  LINEUP_SUPERFLEX,
  makePick,
  makeTeams,
  maxAtPos,
  needMultiplier,
  newDraft,
  onClock,
  openStarterSlots,
  posCount,
  replacementRanks,
  scoreTeams,
  simToEnd,
  simToUser,
  snakeOrder,
  startingLineup,
  suggestedPick,
  upcomingPicks,
  type DraftSettings,
  type MarketPlayer,
  type Pos,
  type SnakeTeam,
} from "@/lib/snake-draft-engine";

/**
 * A synthetic board: `n` players per position, points sloping down from 100,
 * with VORP measured off the 12th player at each position — so replacement
 * lands on rank 12 everywhere and, at SOURCE_FORMAT's 12 teams and lineup, the
 * format correction is zero.
 */
function pool(n = 40): MarketPlayer[] {
  const points = (i: number) => 100 - i * 2;
  const baseline = points(11);
  const out: MarketPlayer[] = [];
  for (const pos of ["QB", "RB", "WR", "TE"] as Pos[]) {
    for (let i = 0; i < n; i++) {
      out.push({
        id: `${pos}${i}`,
        name: `${pos} ${i}`,
        pos,
        points: points(i),
        vorp: points(i) - baseline,
        bye: 6,
      });
    }
  }
  return out;
}

/** A bare source-board row, for the need helpers (which only read `pos`). */
const mkt = (pos: Pos): MarketPlayer => ({
  id: `mkt-${pos}`,
  name: `Market ${pos}`,
  pos,
  points: 200,
  vorp: 50,
  bye: 6,
});

const settings = (over: Partial<DraftSettings> = {}): DraftSettings => ({
  ...DEFAULT_SETTINGS,
  ...over,
});

const teamWith = (roster: { pos: Pos; value?: number }[]): SnakeTeam => ({
  name: "T",
  slot: 1,
  isUser: false,
  roster: roster.map((r, i) => ({
    id: `x${i}`,
    name: `X${i}`,
    pos: r.pos,
    points: r.value ?? 50,
    vorp: r.value ?? 50,
    bye: 6,
    value: r.value ?? 50,
    rank: i + 1,
    posRank: i + 1,
  })),
});

describe("snakeOrder", () => {
  it("runs 1→N then N→1", () => {
    expect(snakeOrder(3, 2)).toEqual([0, 1, 2, 2, 1, 0]);
  });

  it("produces one pick per team per round", () => {
    const order = snakeOrder(12, 15);
    expect(order).toHaveLength(180);
    for (let t = 0; t < 12; t++) {
      expect(order.filter((x) => x === t)).toHaveLength(15);
    }
  });
});

describe("upcomingPicks", () => {
  it("gives a slot its snake pick numbers", () => {
    const d = newDraft(settings({ teams: 10, rounds: 4, slot: 3 }), pool());
    expect(upcomingPicks(d, 3).slice(0, 4)).toEqual([3, 18, 23, 38]);
  });
});

describe("buildBoard", () => {
  it("places replacement level from lineup and league size", () => {
    // 1 QB × 12 teams -> QB12; adding a superflex slot pushes it to ~QB22
    const p = pool();
    expect(replacementRanks(p, settings({ teams: 12, lineup: LINEUP_1QB })).QB).toBe(12);
    expect(replacementRanks(p, settings({ teams: 12, lineup: LINEUP_SUPERFLEX })).QB).toBe(22);
  });

  it("re-prices quarterbacks upward in superflex", () => {
    const p = pool();
    const oneQb = buildBoard(p, settings({ lineup: LINEUP_1QB }));
    const sf = buildBoard(p, settings({ lineup: LINEUP_SUPERFLEX }));
    const qb1 = (b: ReturnType<typeof buildBoard>) => b.find((x) => x.id === "QB0")!;
    expect(qb1(sf).value).toBeGreaterThan(qb1(oneQb).value);
    expect(qb1(sf).rank).toBeLessThanOrEqual(qb1(oneQb).rank);
    // the QB move dwarfs the incidental one at RB (a superflex slot eats a few
    // running-back starts too, via SF_SHARE)
    const rb1 = (b: ReturnType<typeof buildBoard>) => b.find((x) => x.id === "RB0")!;
    const qbGain = qb1(sf).value - qb1(oneQb).value;
    const rbGain = rb1(sf).value - rb1(oneQb).value;
    expect(qbGain).toBeGreaterThan(5 * Math.abs(rbGain));
  });

  it("ranks the board by value and keeps per-position ranks in order", () => {
    const b = buildBoard(pool(), settings());
    expect(b[0].rank).toBe(1);
    expect(b.map((x) => x.value)).toEqual([...b.map((x) => x.value)].sort((a, c) => c - a));
    const qbs = b.filter((x) => x.pos === "QB");
    expect(qbs.map((x) => x.posRank)).toEqual(qbs.map((_, i) => i + 1));
  });

  it("reproduces the published values when the format matches the board's", () => {
    const p = pool();
    const b = buildBoard(p, { ...DEFAULT_SETTINGS });
    for (const row of b) {
      expect(row.value).toBeCloseTo(p.find((x) => x.id === row.id)!.vorp, 6);
    }
  });

  it("keeps below-replacement players in order, negative values and all", () => {
    const b = buildBoard(pool(), settings());
    const tail = b.slice(-5);
    expect(tail[4].value).toBeLessThan(0);
    expect(tail[0].value).toBeGreaterThanOrEqual(tail[4].value);
  });

  it("still drafts sensibly once every player left is below replacement", () => {
    // the multiplicative scoring model would invert on negative values
    const s = settings({ teams: 2, rounds: 4, lineup: LINEUP_1QB });
    // five below-replacement players at each position (not 20 quarterbacks)
    const thin = (["QB", "RB", "WR", "TE"] as Pos[]).flatMap((pos) =>
      pool().filter((p) => p.pos === pos && p.vorp < 0).slice(0, 5),
    );
    const d0 = newDraft(s, thin);
    // with taste noise off, the best of the bad players is still the pick —
    // a negative value would have flipped the need discount and inverted this
    expect(botPick(d0, 0, false)!.rank).toBe(1);
    const d = simToEnd(d0);
    expect(d.picks).toHaveLength(8);
    for (const t of d.teams) {
      for (const pos of ["QB", "RB", "WR", "TE"] as Pos[]) {
        expect(posCount(t, pos)).toBeLessThanOrEqual(maxAtPos(LINEUP_1QB, pos));
      }
    }
  });
});

describe("the published board", () => {
  it("reads its own baselines back out of the numbers", () => {
    const st = boardStats(athleticPool());
    // where The Athletic's VORP crosses zero at each position
    expect(st.replRank).toEqual({ QB: 16, RB: 44, WR: 60, TE: 21 });
    // their VORP is exactly points-minus-baseline at WR/TE and 0.8x at RB
    expect(st.slope.WR).toBeCloseTo(1, 3);
    expect(st.slope.TE).toBeCloseTo(1, 3);
    expect(st.slope.RB).toBeCloseTo(0.8, 3);
  });

  it("drafts off the published values, unaltered, at the published format", () => {
    const p = athleticPool();
    const b = buildBoard(p, DEFAULT_SETTINGS);
    for (const row of b) {
      expect(row.value).toBeCloseTo(p.find((x) => x.id === row.id)!.vorp, 9);
    }
    expect(b[0].name).toBe("Ja'Marr Chase");
    expect(b.find((x) => x.pos === "QB")!.rank).toBe(15); // their QB1, at their rank
  });

  it("lifts quarterbacks into round 1 in superflex", () => {
    const p = athleticPool();
    const sf = buildBoard(p, { ...DEFAULT_SETTINGS, lineup: LINEUP_SUPERFLEX });
    expect(replacementRanks(p, { ...DEFAULT_SETTINGS, lineup: LINEUP_SUPERFLEX }).QB).toBe(26);
    expect(sf.find((x) => x.pos === "QB")!.rank).toBeLessThanOrEqual(DEFAULT_SETTINGS.teams);
  });
});

describe("startingLineup", () => {
  it("fills dedicated slots first, then FLEX, then superflex", () => {
    const t = teamWith([
      { pos: "QB", value: 90 },
      { pos: "QB", value: 80 },
      { pos: "RB", value: 70 },
      { pos: "RB", value: 60 },
      { pos: "WR", value: 50 },
      { pos: "WR", value: 40 },
      { pos: "TE", value: 30 },
      { pos: "WR", value: 20 },
    ]);
    const slots = startingLineup(t, LINEUP_SUPERFLEX);
    expect(slots.map((s) => s.slot)).toEqual(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SF"]);
    expect(slots.find((s) => s.slot === "FLEX")!.player!.value).toBe(20); // last skill player
    expect(slots.find((s) => s.slot === "SF")!.player!.value).toBe(80); // the QB2
  });

  it("leaves slots empty when the roster cannot fill them", () => {
    const t = teamWith([{ pos: "RB" }]);
    // QB · RB · RB · WR · WR · TE · FLEX = 7 slots, one RB fills one of them
    expect(openStarterSlots(t, LINEUP_1QB)).toBe(6);
  });
});

describe("needMultiplier", () => {
  it("is full value for a player who steps into an empty starting slot", () => {
    const t = teamWith([]);
    expect(needMultiplier(t, mkt("RB"), LINEUP_1QB)).toBe(1);
  });

  it("discounts a backup behind a filled position", () => {
    const t = teamWith([{ pos: "QB" }]);
    const m = needMultiplier(t, mkt("QB"), LINEUP_1QB);
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(1);
  });

  it("does not treat a tight end as a superflex starter", () => {
    // legal in the lineup, but nobody drafts a TE planning to start him at SF —
    // counting it gave bots a third tight end in a one-TE league
    // TE + FLEX already filled, superflex slot still open
    const t = teamWith([
      { pos: "TE" }, { pos: "RB" }, { pos: "RB" }, { pos: "RB" }, { pos: "WR" }, { pos: "WR" },
    ]);
    const te2 = mkt("TE");
    expect(needMultiplier(t, te2, LINEUP_SUPERFLEX)).toBeLessThan(1);
    expect(maxAtPos(LINEUP_SUPERFLEX, "TE")).toBe(2);
    // …while a quarterback does fill it
    expect(needMultiplier(teamWith([{ pos: "QB" }]), mkt("QB"), LINEUP_SUPERFLEX)).toBe(1);
  });

  it("is zero past the positional ceiling", () => {
    const cap = maxAtPos(LINEUP_1QB, "QB");
    const t = teamWith(Array.from({ length: cap }, () => ({ pos: "QB" as Pos })));
    expect(needMultiplier(t, mkt("QB"), LINEUP_1QB)).toBe(0);
  });
});

describe("botPick", () => {
  it("takes a high-value player who fills a need", () => {
    const d = newDraft(settings({ teams: 4, rounds: 5 }), pool());
    const p = botPick(d, 0, false)!;
    expect(p.rank).toBe(1);
  });

  it("never drafts past the positional ceiling", () => {
    let d = newDraft(settings({ teams: 2, rounds: 12, lineup: LINEUP_1QB }), pool());
    d = simToEnd(d);
    for (const t of d.teams) {
      for (const pos of ["QB", "RB", "WR", "TE"] as Pos[]) {
        expect(t.roster.filter((p) => p.pos === pos).length).toBeLessThanOrEqual(
          maxAtPos(LINEUP_1QB, pos),
        );
      }
    }
  });

  it("fills its holes once it is out of picks to spare", () => {
    // 3 rounds, lineup needs a QB and an RB; the bot already has two RBs, so its
    // last pick has to be the quarterback no matter what the board says
    const lineup = { QB: 1, RB: 1, WR: 0, TE: 0, FLEX: 0, SF: 0 };
    const s = settings({ teams: 1, rounds: 3, slot: 1, lineup });
    let d = newDraft(s, pool());
    d = { ...d, teams: [{ ...d.teams[0], roster: [d.board[0], d.board[1]] }] };
    // force the roster to be two RBs regardless of what topped the board
    const rbs = d.board.filter((p) => p.pos === "RB").slice(0, 2);
    d = { ...d, teams: [{ ...d.teams[0], roster: rbs }] };
    expect(botPick(d, 0, false)!.pos).toBe("QB");
  });

  it("has managers disagree when valuation noise is on", () => {
    const s = settings({ teams: 8, rounds: 3 });
    const quiet = newDraft(s, pool(), { spread: 0, seed: 1 });
    const noisy = newDraft(s, pool(), { spread: 0.9, seed: 1 });
    const quietPicks = quiet.teams.map((_, i) => botPick(quiet, i, false)!.id);
    const noisyPicks = noisy.teams.map((_, i) => botPick(noisy, i, false)!.id);
    // with no noise every manager wants the same guy; with noise they don't
    expect(new Set(quietPicks).size).toBe(1);
    expect(new Set(noisyPicks).size).toBeGreaterThan(1);
  });
});

describe("draft flow", () => {
  it("removes the pick from the board and adds it to the right roster", () => {
    const d = newDraft(settings({ teams: 4, rounds: 3, slot: 2 }), pool());
    const target = d.board[5];
    const after = makePick(d, target);
    expect(after.board.some((p) => p.id === target.id)).toBe(false);
    expect(after.teams[0].roster.map((p) => p.id)).toEqual([target.id]); // slot 1 was on the clock
    expect(d.board.some((p) => p.id === target.id)).toBe(true); // original untouched
    expect(after.picks[0]).toMatchObject({ overall: 1, round: 1, pickInRound: 1 });
  });

  it("ignores a player who is already off the board", () => {
    const d = newDraft(settings(), pool());
    const after = makePick(d, d.board[0]);
    expect(makePick(after, d.board[0])).toBe(after);
  });

  it("simToUser stops with the user on the clock", () => {
    const d = newDraft(settings({ teams: 8, rounds: 4, slot: 6 }), pool());
    const after = simToUser(d);
    expect(after.picks).toHaveLength(5);
    expect(isUserOnClock(after)).toBe(true);
    expect(after.picks.every((p) => !p.isUser)).toBe(true);
  });

  it("simToUser is a no-op when the user is already up", () => {
    const d = newDraft(settings({ teams: 8, rounds: 4, slot: 1 }), pool());
    expect(simToUser(d).picks).toHaveLength(0);
  });

  it("simToEnd fills every roster and completes the draft", () => {
    const s = settings({ teams: 6, rounds: 8 });
    const d = simToEnd(newDraft(s, pool()));
    expect(isComplete(d)).toBe(true);
    expect(onClock(d)).toBeNull();
    expect(d.picks).toHaveLength(48);
    for (const t of d.teams) expect(t.roster).toHaveLength(8);
    expect(new Set(d.picks.map((p) => p.player.id)).size).toBe(48); // nobody drafted twice
  });

  it("ends early rather than looping when the board runs dry", () => {
    const small = pool().slice(0, 5);
    const d = simToEnd(newDraft(settings({ teams: 4, rounds: 10 }), small));
    expect(d.picks).toHaveLength(5);
    expect(isComplete(d)).toBe(true);
  });

  it("makeTeams marks exactly one user team, at the chosen slot", () => {
    const teams = makeTeams(settings({ teams: 6, slot: 4 }));
    expect(teams.filter((t) => t.isUser)).toHaveLength(1);
    expect(teams[3].isUser).toBe(true);
  });
});

describe("suggestedPick", () => {
  it("recommends a startable player over a better-valued backup", () => {
    const lineup = { QB: 1, RB: 1, WR: 1, TE: 0, FLEX: 0, SF: 0 };
    let d = newDraft(settings({ teams: 1, rounds: 4, slot: 1, lineup }), pool());
    const bestQb = d.board.filter((p) => p.pos === "QB")[0];
    d = { ...d, teams: [{ ...d.teams[0], roster: [bestQb] }] };
    expect(suggestedPick(d)!.pos).not.toBe("QB");
  });
});

describe("scoreTeams", () => {
  it("ranks teams by the value of the lineup they can start", () => {
    const d = simToEnd(newDraft(settings({ teams: 4, rounds: 6 }), pool()));
    const scores = scoreTeams(d);
    expect(scores.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].starterValue).toBeGreaterThanOrEqual(scores[i].starterValue);
    }
  });
});
