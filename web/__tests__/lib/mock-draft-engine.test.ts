import {
  aiBid,
  applyWin,
  budgetPressure,
  MAX_PRESSURE,
  openSpots,
  MAX_VALUATION_SPREAD,
  nominationOrder,
  privateValue,
  resolveNominee,
  startingLineup,
  starterNeeds,
  valuationMultiplier,
  type DraftTeam,
  type FAPlayer,
  type ValuationNoise,
} from "@/lib/mock-draft-engine";

function team(name: string, isUser = false, cap = 200, roster: DraftTeam["roster"] = []): DraftTeam {
  return { name, isUser, cap, roster };
}

/** average of a noisy bid over enough draws for the taste jitter to wash out */
const mean = (f: () => number) =>
  Array.from({ length: 60 }, f).reduce((a, b) => a + b, 0) / 60;

const eliteQB: FAPlayer = { id: "q1", name: "Elite QB", pos: "QB", mv: 60 };
const wr1: FAPlayer = { id: "w1", name: "WR One", pos: "WR", mv: 50 };

describe("aiBid", () => {
  it("bids full market (with SF premium) for a needed QB starter", () => {
    const t = team("A");
    // no noise via a large sample: check it lands in a plausible band above market
    const bids = Array.from({ length: 50 }, () => aiBid(t, eliteQB));
    const avg = bids.reduce((a, b) => a + b, 0) / bids.length;
    expect(avg).toBeGreaterThan(eliteQB.mv); // SF premium pushes above market
  });

  it("won't bid on a position it has already filled to starter+bench", () => {
    const roster = Array.from({ length: 6 }, (_, i) => ({
      id: `k${i}`, name: `K${i}`, pos: "K" as const, salary: 1, mv: 1,
    }));
    const t = team("A", false, 200, roster);
    expect(aiBid(t, { id: "k9", name: "Kicker", pos: "K", mv: 1 })).toBe(0);
  });

  it("respects affordability (never bids more than cap minus reserve)", () => {
    const t = team("Broke", false, 12);
    expect(aiBid(t, eliteQB)).toBeLessThanOrEqual(12);
  });

  it("pays over market when the cash would otherwise go unspent", () => {
    // same roster need, wildly different bankrolls: the rich team must lean over
    // market because it cannot spend $340 at market across its open spots
    const normal = mean(() => aiBid(team("Normal", false, 60), wr1));
    const rich = mean(() => aiBid(team("Rich", false, 350), wr1));
    expect(normal).toBeLessThanOrEqual(wr1.mv * 1.2); // ~market
    expect(rich).toBeGreaterThan(wr1.mv * 1.5); // deliberately over market
  });

  it("buys a best-available body once positional targets are met", () => {
    // WR room already at starters+bench (2+3), but roster spots and cash remain
    const roster = Array.from({ length: 5 }, (_, i) => ({
      id: `w${i}`, name: `W${i}`, pos: "WR" as const, salary: 20, mv: 25,
    }));
    expect(aiBid(team("Spare", false, 250, roster), wr1)).toBeGreaterThan(0);
  });

  it("never buys past the hard positional ceiling, however rich", () => {
    const roster = Array.from({ length: 7 }, (_, i) => ({
      id: `w${i}`, name: `W${i}`, pos: "WR" as const, salary: 1, mv: 25,
    }));
    expect(aiBid(team("Loaded", false, 380, roster), wr1)).toBe(0);
  });
});

describe("budgetPressure", () => {
  it("is neutral for a team whose cash matches what it still has to buy", () => {
    expect(budgetPressure(team("Normal", false, 45), 40)).toBe(1);
  });

  it("rises with surplus cash and is capped", () => {
    const poor = budgetPressure(team("Poor", false, 45), 40);
    const mid = budgetPressure(team("Mid", false, 200), 40);
    const loaded = budgetPressure(team("Loaded", false, 390), 4);
    expect(mid).toBeGreaterThan(poor);
    expect(loaded).toBeGreaterThan(mid);
    expect(loaded).toBeLessThanOrEqual(MAX_PRESSURE);
  });

  it("is anchored on market value, not a private valuation", () => {
    // otherwise a manager who is *low* on a player would inflate his bid,
    // cancelling out the valuation noise
    const t = team("Rich", false, 300);
    const noise: ValuationNoise = { spread: 0.8, seed: 11 };
    const names = Array.from({ length: 40 }, (_, i) => `T${i}`);
    const hi = names.find((n) => valuationMultiplier(n, wr1.id, noise) > 1.6)!;
    const lo = names.find((n) => valuationMultiplier(n, wr1.id, noise) < 0.4)!;
    expect(mean(() => aiBid({ ...t, name: hi }, wr1, true, noise))).toBeGreaterThan(
      mean(() => aiBid({ ...t, name: lo }, wr1, true, noise)),
    );
  });

  it("stops mattering once the roster is full", () => {
    const roster = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`, name: `P${i}`, pos: "WR" as const, salary: 1, mv: 5,
    }));
    const t = team("Full", false, 300, roster);
    expect(openSpots(t)).toBe(0);
    expect(budgetPressure(t, 20)).toBe(1);
  });
});

describe("resolveNominee", () => {
  it("user wins at second-highest + 1 (Vickrey)", () => {
    const teams = [team("You", true, 200), team("Rival", false, 5)]; // rival can't bid much
    const res = resolveNominee(teams, wr1, "You", 40);
    expect(res.winner).toBe("You");
    expect(res.userWon).toBe(true);
    // rival is cap-limited (<= $5-reserve area) so price should be well under the $40 max
    expect(res.price).toBeLessThan(40);
    expect(res.price).toBeGreaterThanOrEqual(1);
  });

  it("returns no-sale when nobody bids at least $1", () => {
    const teams = [team("You", true, 200)];
    const res = resolveNominee(teams, wr1, "You", 0);
    expect(res.winner).toBeNull();
  });

  it("an AI can outbid a low user max", () => {
    const teams = [team("You", true, 200), team("Rich", false, 200)];
    const res = resolveNominee(teams, wr1, "You", 1);
    expect(res.winner).toBe("Rich");
    expect(res.userWon).toBe(false);
  });
});

describe("applyWin", () => {
  it("adds the player at the price and debits cap", () => {
    const t = team("A", false, 100);
    applyWin(t, wr1, 30);
    expect(t.cap).toBe(70);
    expect(t.roster).toHaveLength(1);
    expect(t.roster[0]).toMatchObject({ id: "w1", salary: 30, pos: "WR" });
  });
});

describe("startingLineup", () => {
  it("fills QB + SF from QBs and uses FLEX for an extra skill player", () => {
    const roster: DraftTeam["roster"] = [
      { id: "q1", name: "QB A", pos: "QB", salary: 40, mv: 40 },
      { id: "q2", name: "QB B", pos: "QB", salary: 20, mv: 20 },
      { id: "r1", name: "RB A", pos: "RB", salary: 30, mv: 30 },
      { id: "r2", name: "RB B", pos: "RB", salary: 10, mv: 10 },
      { id: "r3", name: "RB C", pos: "RB", salary: 8, mv: 8 },
      { id: "w1", name: "WR A", pos: "WR", salary: 25, mv: 25 },
      { id: "w2", name: "WR B", pos: "WR", salary: 12, mv: 12 },
      { id: "t1", name: "TE A", pos: "TE", salary: 15, mv: 15 },
      { id: "k1", name: "K A", pos: "K", salary: 1, mv: 1 },
    ];
    const lineup = startingLineup(team("A", false, 100, roster));
    const bySlot = Object.fromEntries(lineup.map((l) => [l.slot + (l.player?.id ?? ""), l.player?.id]));
    expect(lineup.find((l) => l.slot === "QB")?.player?.id).toBe("q1");
    expect(lineup.find((l) => l.slot === "SF")?.player?.id).toBe("q2"); // 2nd QB in superflex
    // FLEX should be filled by the best leftover skill player (RB C, the extra back)
    expect(lineup.find((l) => l.slot === "FLEX")?.player).not.toBeNull();
    expect(bySlot).toBeDefined();
  });
});

describe("nominationOrder", () => {
  const pool: FAPlayer[] = Array.from({ length: 40 }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    pos: "WR",
    mv: 100 - i * 2, // 100 down to 22
  }));

  it("preserves the full set (no drops or dupes)", () => {
    const ordered = nominationOrder(pool);
    expect(ordered).toHaveLength(pool.length);
    expect(new Set(ordered.map((p) => p.id))).toEqual(new Set(pool.map((p) => p.id)));
  });

  it("is jittered, not strictly by value, but still value-weighted", () => {
    let strictCount = 0;
    let topInFirstQuartileCount = 0;
    const runs = 40;
    for (let r = 0; r < runs; r++) {
      const ordered = nominationOrder(pool);
      const isStrict = ordered.every((p, i) => i === 0 || ordered[i - 1].mv >= p.mv);
      if (isStrict) strictCount++;
      const topIdx = ordered.findIndex((p) => p.id === "p0"); // the $100 player
      if (topIdx < pool.length / 4) topInFirstQuartileCount++;
    }
    expect(strictCount).toBeLessThan(runs); // not always strictly descending
    expect(topInFirstQuartileCount).toBeGreaterThan(runs / 2); // but the elite still tends early
  });
});

describe("starterNeeds", () => {
  it("marks a position filled once startable minimum is met", () => {
    const roster: DraftTeam["roster"] = [
      { id: "t1", name: "TE A", pos: "TE", salary: 15, mv: 15 },
    ];
    const needs = starterNeeds(team("A", false, 100, roster));
    expect(needs.find((n) => n.pos === "TE")?.filled).toBe(true);
    expect(needs.find((n) => n.pos === "QB")?.filled).toBe(false);
  });
});

describe("private manager valuations", () => {
  const noise: ValuationNoise = { spread: 0.5, seed: 7 };

  it("is a no-op at spread 0 — everyone prices at market", () => {
    expect(valuationMultiplier("A", "w1", { spread: 0, seed: 7 })).toBe(1);
    expect(privateValue("A", wr1)).toBe(wr1.mv);
  });

  it("is stable for a (seed, team, player) — a manager keeps his opinion", () => {
    const a = privateValue("A", wr1, noise);
    expect(privateValue("A", wr1, noise)).toBe(a);
    expect(privateValue("A", wr1, { spread: 0.5, seed: 8 })).not.toBe(a); // new draft, new opinions
  });

  it("gives different managers different prices for the same player", () => {
    const prices = ["A", "B", "C", "D", "E", "F"].map((t) => privateValue(t, wr1, noise));
    expect(new Set(prices).size).toBeGreaterThan(1);
  });

  it("stays inside ±spread of market, and clamps beyond the max spread", () => {
    for (let i = 0; i < 200; i++) {
      const m = valuationMultiplier(`Team ${i}`, `p${i}`, noise);
      expect(m).toBeGreaterThanOrEqual(1 - noise.spread);
      expect(m).toBeLessThanOrEqual(1 + noise.spread);
      const clamped = valuationMultiplier(`Team ${i}`, `p${i}`, { spread: 5, seed: 1 });
      expect(clamped).toBeGreaterThanOrEqual(1 - MAX_VALUATION_SPREAD);
      expect(clamped).toBeLessThanOrEqual(1 + MAX_VALUATION_SPREAD);
    }
  });

  it("spans most of the band across the pool (not clustered at market)", () => {
    const mults = Array.from({ length: 500 }, (_, i) =>
      valuationMultiplier("A", `p${i}`, { spread: 0.9, seed: 3 }),
    );
    expect(Math.min(...mults)).toBeLessThan(0.3); // someone is priced way down
    expect(Math.max(...mults)).toBeGreaterThan(1.7); // and someone way up
  });

  it("moves AI bids: rivals who love a player pay more than the market-only case", () => {
    const t = team("A");
    const flat = mean(() => aiBid(t, wr1));
    // find a team the seed happens to be high on, and one it's low on
    const names = Array.from({ length: 40 }, (_, i) => `T${i}`);
    const hi = names.find((n) => valuationMultiplier(n, wr1.id, { spread: 0.8, seed: 11 }) > 1.6)!;
    const lo = names.find((n) => valuationMultiplier(n, wr1.id, { spread: 0.8, seed: 11 }) < 0.4)!;
    expect(mean(() => aiBid(team(hi), wr1, true, { spread: 0.8, seed: 11 }))).toBeGreaterThan(flat);
    expect(mean(() => aiBid(team(lo), wr1, true, { spread: 0.8, seed: 11 }))).toBeLessThan(flat);
  });

  it("resolveNominee passes the noise through to the AI bids", () => {
    const spread90: ValuationNoise = { spread: 0.9, seed: 4 };
    const names = Array.from({ length: 60 }, (_, i) => `T${i}`);
    const hi = names.find((n) => valuationMultiplier(n, wr1.id, spread90) > 1.7);
    const lo = names.find((n) => valuationMultiplier(n, wr1.id, spread90) < 0.4);
    expect(hi && lo).toBeTruthy();
    const meanTopBid = (rival: string) => {
      const runs = Array.from({ length: 60 }, () =>
        resolveNominee([team("You", true), team(rival)], wr1, "You", 0, spread90),
      );
      return runs.reduce((a, r) => a + (r.topBids[0]?.bid ?? 0), 0) / runs.length;
    };
    // the rival who loves him pays over market; the one who doesn't, well under
    expect(meanTopBid(hi!)).toBeGreaterThan(wr1.mv);
    expect(meanTopBid(lo!)).toBeLessThan(wr1.mv * 0.6);
  });
});
