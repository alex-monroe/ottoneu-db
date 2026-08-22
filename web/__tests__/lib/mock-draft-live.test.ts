import {
  valuationMultiplier,
  type DraftTeam,
  type FAPlayer,
  type ValuationNoise,
} from "@/lib/mock-draft-engine";
import {
  advanceLive,
  instantStep,
  minUserBid,
  msLeft,
  newDraft,
  placeUserBid,
  setUserMax,
  shiftClock,
  SPEED_PRESETS,
  type LiveDraft,
} from "@/lib/mock-draft-live";

const cfg = SPEED_PRESETS.normal;

function team(name: string, isUser = false, cap = 200, roster: DraftTeam["roster"] = []): DraftTeam {
  return { name, isUser, cap, roster };
}

const wr1: FAPlayer = { id: "w1", name: "WR One", pos: "WR", mv: 50 };
const wr2: FAPlayer = { id: "w2", name: "WR Two", pos: "WR", mv: 30 };
const rb1: FAPlayer = { id: "r1", name: "RB One", pos: "RB", mv: 40 };

function start(pool: FAPlayer[] = [wr1, wr2, rb1], teams?: DraftTeam[]): LiveDraft {
  return newDraft(teams ?? [team("You", true), team("Rival A"), team("Rival B")], pool, "You");
}

/** Drive the clock forward in `stepMs` slices, running the engine each slice. */
function run(st: LiveDraft, fromMs: number, forMs: number, stepMs = 100): [LiveDraft, number] {
  let t = fromMs;
  const until = fromMs + forMs;
  while (t < until) {
    t += stepMs;
    st = advanceLive(st, t, cfg);
  }
  return [st, t];
}

describe("advanceLive", () => {
  it("puts the first player on the block with a live clock", () => {
    const st = advanceLive(start(), 1000, cfg);
    expect(st.lot).not.toBeNull();
    expect(st.lot!.player.id).toBe("w1");
    expect(st.lot!.price).toBe(0);
    expect(st.lot!.highBidder).toBeNull();
    expect(msLeft(st.lot!, 1000)).toBe(cfg.clockMs);
    expect(st.pool).toHaveLength(3); // not consumed until the hammer falls
  });

  it("lets the AI teams bid the price up over time", () => {
    const [st] = run(advanceLive(start(), 0, cfg), 0, cfg.reactMaxMs * 3);
    expect(st.lot).not.toBeNull();
    expect(st.lot!.price).toBeGreaterThan(0);
    expect(st.lot!.highBidder).not.toBeNull();
    expect(st.lot!.bids.length).toBeGreaterThan(0);
    // nobody bids against themselves twice in a row
    const bids = st.lot!.bids;
    for (let i = 1; i < bids.length; i++) {
      expect(bids[i].bidder).not.toBe(bids[i - 1].bidder);
      expect(bids[i].amount).toBeGreaterThan(bids[i - 1].amount);
    }
  });

  it("extends the clock when a bid lands", () => {
    const st = advanceLive(start(), 0, cfg);
    const opened = st.lot!.deadline;
    // a bid landing near the hammer pushes the deadline out ("going once")
    const late = cfg.clockMs - 100;
    const bumped = placeUserBid(st, 25, late, cfg);
    expect(bumped.lot!.price).toBe(25);
    expect(bumped.lot!.deadline).toBe(late + cfg.resetMs);
    expect(bumped.lot!.deadline).toBeGreaterThan(opened);
  });

  it("hammers the lot when the clock runs out: winner rostered, pool advances", () => {
    const [st] = run(start(), 0, cfg.clockMs * 4);
    expect(st.log.length).toBeGreaterThanOrEqual(1);
    const first = st.log[st.log.length - 1]; // log is newest-first
    expect(first.player.id).toBe("w1");
    expect(first.winner).not.toBeNull();
    expect(first.price).toBeGreaterThanOrEqual(1);
    const winner = st.teams.find((t) => t.name === first.winner)!;
    expect(winner.roster.map((p) => p.id)).toContain("w1");
    // cap is debited by every sale this team won
    const spent = winner.roster.reduce((a, p) => a + p.salary, 0);
    expect(winner.cap).toBe(200 - spent);
    expect(st.pool.map((p) => p.id)).not.toContain("w1");
  });

  it("no AI ever pays more than its private max", () => {
    let st = advanceLive(start(), 0, cfg);
    const maxes = { ...st.lot!.maxes }; // this lot's maxes only
    // run just until the first lot hammers, so the sale matches those maxes
    let t = 0;
    while (st.log.length === 0 && t < cfg.clockMs * 6) {
      t += 100;
      st = advanceLive(st, t, cfg);
    }
    const sale = st.log[0];
    expect(sale.player.id).toBe("w1");
    expect(sale.winner).not.toBe("You"); // the user never bids here
    expect(sale.price).toBeLessThanOrEqual(maxes[sale.winner!]);
  });

  it("records a no-sale when nobody wants the player", () => {
    // one dead-broke AI and a user who never bids
    const teams = [team("You", true), team("Broke", false, 1)];
    const [st] = run(start([wr1], teams), 0, cfg.clockMs * 2);
    expect(st.log).toHaveLength(1);
    expect(st.log[0].winner).toBeNull();
    expect(st.log[0].price).toBe(0);
  });

  it("drains the whole pool and stops", () => {
    const [st] = run(start(), 0, (cfg.clockMs + cfg.soldMs) * 12);
    expect(st.pool).toHaveLength(0);
    expect(st.log).toHaveLength(3);
    expect(st.lot).toBeNull();
  });
});

describe("user bidding", () => {
  it("rejects a bid that doesn't beat the board", () => {
    let st = advanceLive(start(), 0, cfg);
    st = placeUserBid(st, 10, 100, cfg);
    expect(st.lot!.price).toBe(10);
    const same = placeUserBid(st, 10, 200, cfg);
    expect(same).toBe(st); // no-op, identical object
    expect(minUserBid(st.lot!)).toBe(11);
  });

  it("a standing auto-bid answers rivals with the minimum raise", () => {
    let st = advanceLive(start(), 0, cfg);
    st = setUserMax(st, 200); // outbid everyone, but only ever by $1
    [st] = run(st, 0, cfg.clockMs * 3);
    const sale = st.log[st.log.length - 1];
    expect(sale.winner).toBe("You");
    expect(sale.userWon).toBe(true);
    expect(sale.price).toBeLessThanOrEqual(200);
    const you = st.teams.find((t) => t.isUser)!;
    expect(you.roster.map((p) => p.id)).toContain("w1");
  });

  it("a low auto-bid ceiling loses to a rival", () => {
    let st = advanceLive(start(), 0, cfg);
    st = setUserMax(st, 3); // nowhere near a $50 WR
    [st] = run(st, 0, cfg.clockMs * 3);
    const sale = st.log[st.log.length - 1];
    expect(sale.userWon).toBe(false);
    expect(sale.price).toBeGreaterThan(3);
  });
});

describe("shiftClock", () => {
  it("pushes the deadline out by the paused duration", () => {
    const st = advanceLive(start(), 0, cfg);
    const shifted = shiftClock(st, 5000);
    expect(shifted.lot!.deadline).toBe(st.lot!.deadline + 5000);
    expect(msLeft(shifted.lot!, 0)).toBe(cfg.clockMs + 5000);
  });
});

describe("instantStep", () => {
  it("resolves the next player with no clock and clears the open lot", () => {
    const st = instantStep(advanceLive(start(), 0, cfg), 0, 0);
    expect(st.lot).toBeNull();
    expect(st.log).toHaveLength(1);
    expect(st.pool.map((p) => p.id)).toEqual(["w2", "r1"]);
  });

  it("honours the user's max bid", () => {
    const teams = [team("You", true), team("Poor", false, 4)];
    const st = instantStep(start([wr1], teams), 50, 0);
    expect(st.log[0].userWon).toBe(true);
    expect(st.log[0].price).toBeLessThanOrEqual(50);
  });
});

describe("private valuations in the live auction", () => {
  const noise: ValuationNoise = { spread: 0.9, seed: 21 };
  const names = Array.from({ length: 60 }, (_, i) => `T${i}`);
  // a rival this seed is high on, and one it is low on, for the same WR
  const hi = names.find((n) => valuationMultiplier(n, wr1.id, noise) > 1.7)!;
  const lo = names.find((n) => valuationMultiplier(n, wr1.id, noise) < 0.4)!;
  const teams = [team("You", true), team(hi), team(lo)];

  it("prices each rival's private max off his own valuation, not market", () => {
    const st = advanceLive(newDraft(teams, [wr1], "You", noise), 0, cfg);
    expect(st.lot!.maxes[hi]).toBeGreaterThan(wr1.mv);
    expect(st.lot!.maxes[lo]).toBeLessThan(wr1.mv * 0.6);
  });

  it("keeps each ceiling fixed for the whole lot", () => {
    let st = advanceLive(newDraft(teams, [wr1], "You", noise), 0, cfg);
    const maxes = { ...st.lot!.maxes };
    [st] = run(st, 0, cfg.clockMs * 3);
    const sale = st.log[0];
    expect(sale.winner).toBe(hi); // the manager who loves him wins
    expect(sale.price).toBeLessThanOrEqual(maxes[hi]);
  });

  it("defaults to no noise — every rival prices at market", () => {
    const st = advanceLive(start([wr1], teams), 0, cfg);
    expect(st.valuation.spread).toBe(0);
    for (const n of [hi, lo]) expect(st.lot!.maxes[n]).toBeGreaterThanOrEqual(wr1.mv * 0.8);
  });

  it("instantStep (the fast-forwards) uses the same valuations", () => {
    const st = instantStep(newDraft([team("You", true), team(lo)], [wr1], "You", noise), 0, 0);
    expect(st.log).toHaveLength(1);
    // the lone rival is priced well under market, so the sale is too
    expect(st.log[0].price).toBeLessThan(wr1.mv * 0.6);
  });
});
