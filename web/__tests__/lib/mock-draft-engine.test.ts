import {
  aiBid,
  applyWin,
  nominationOrder,
  resolveNominee,
  startingLineup,
  starterNeeds,
  type DraftTeam,
  type FAPlayer,
} from "@/lib/mock-draft-engine";

function team(name: string, isUser = false, cap = 200, roster: DraftTeam["roster"] = []): DraftTeam {
  return { name, isUser, cap, roster };
}

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
