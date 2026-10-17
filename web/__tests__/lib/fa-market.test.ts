/**
 * Open-market pricing — `web/lib/fa-market.ts`.
 *
 * Pins the three rules the board rests on: a Vickrey auction's suggested bid is
 * your value (floored, capped by cap room, never below the minimum); a waiver
 * claim is a straight salary-vs-value call; and value to you is league value
 * scaled by lineup fit.
 */

import {
  FIT_WEIGHT,
  adviseClaim,
  buildBoardRows,
  formatTimeLeft,
  hoursLeft,
  openListings,
  suggestMaxBid,
  valueToYou,
  type MarketListing,
} from "@/lib/fa-market";

const NOW = Date.parse("2026-10-17T23:30:00Z");

function listing(overrides: Partial<MarketListing> = {}): MarketListing {
  return {
    kind: "auction",
    player_id: "p1",
    ottoneu_id: 1,
    is_college: false,
    player_name: "Player One",
    nfl_team: "SF",
    position: "WR",
    injury_status: null,
    min_bid: 1,
    salary: null,
    ends_at: "2026-10-18T01:30:00Z",
    ...overrides,
  };
}

describe("suggestMaxBid", () => {
  it("bids the whole value, rounded down — the Vickrey dominant strategy", () => {
    expect(suggestMaxBid({ value: 14.9, minBid: 1, capRoom: 50 })).toEqual({
      action: "bid",
      maxBid: 14,
      cappedByRoom: false,
    });
  });

  it("caps the bid at the viewer's cap room", () => {
    expect(suggestMaxBid({ value: 30, minBid: 1, capRoom: 9 })).toEqual({
      action: "bid",
      maxBid: 9,
      cappedByRoom: true,
    });
  });

  it("passes when the player is worth less than the minimum bid", () => {
    expect(suggestMaxBid({ value: 2.5, minBid: 3, capRoom: 50 })).toEqual({ action: "pass", maxBid: 2 });
  });

  it("says no room before anything else when the minimum is unaffordable", () => {
    expect(suggestMaxBid({ value: 30, minBid: 5, capRoom: 4 })).toEqual({ action: "no_room" });
  });

  it("is unpriced with no production", () => {
    expect(suggestMaxBid({ value: null, minBid: 1, capRoom: 50 })).toEqual({ action: "unpriced" });
  });

  it("does not cap without a viewer team", () => {
    expect(suggestMaxBid({ value: 30, minBid: 1, capRoom: null })).toMatchObject({ maxBid: 30 });
  });
});

describe("adviseClaim", () => {
  it("claims when value beats the full salary", () => {
    expect(adviseClaim({ value: 15, salary: 11, capRoom: 20 })).toEqual({ action: "claim", margin: 4 });
  });

  it("passes when the salary is more than he is worth", () => {
    expect(adviseClaim({ value: 3, salary: 11, capRoom: 20 })).toEqual({ action: "pass", margin: -8 });
  });

  it("cannot claim a salary that does not fit under the cap", () => {
    expect(adviseClaim({ value: 40, salary: 11, capRoom: 9 })).toEqual({ action: "no_room" });
  });
});

describe("valueToYou", () => {
  it("scales league value by fit", () => {
    expect(valueToYou(20, "starter")).toBe(20);
    expect(valueToYou(20, "bench")).toBe(20 * FIT_WEIGHT.bench);
    expect(valueToYou(20, "none")).toBe(20 * FIT_WEIGHT.none);
    expect(valueToYou(null, "starter")).toBeNull();
  });
});

describe("buildBoardRows", () => {
  const earned = new Map([["p1", 20], ["p2", 10]]);
  const stats = new Map([["p1", { ppg: 12.3, games_played: 6 }]]);

  it("joins value, stats and fit", () => {
    const verdicts = new Map([["p1", { kind: "starter" as const, over: { name: "Benchwarmer" } }]]);
    const [row] = buildBoardRows([listing()], earned, stats, verdicts, true);
    expect(row).toMatchObject({
      league_value: 20,
      ppg: 12.3,
      fit: "starter",
      fit_over: "Benchwarmer",
      value_to_you: 20,
    });
  });

  it("marks a listed player with no verdict as not starting", () => {
    const [row] = buildBoardRows([listing({ player_id: "p2" })], earned, stats, new Map(), true);
    expect(row.fit).toBe("none");
    expect(row.value_to_you).toBe(10 * FIT_WEIGHT.none);
  });

  it("keeps league value when there is no viewer roster", () => {
    const [row] = buildBoardRows([listing()], earned, stats, new Map(), false);
    expect(row.fit).toBe("unknown");
    expect(row.value_to_you).toBe(20);
  });

  it("leaves an unmatched player unpriced", () => {
    const [row] = buildBoardRows([listing({ player_id: null })], earned, stats, new Map(), true);
    expect(row.league_value).toBeNull();
    expect(row.value_to_you).toBeNull();
  });
});

describe("time left", () => {
  it("counts hours to the deadline, never negative", () => {
    expect(hoursLeft("2026-10-18T01:30:00Z", NOW)).toBe(2);
    expect(hoursLeft("2026-10-17T20:00:00Z", NOW)).toBe(0);
  });

  it("formats", () => {
    expect(formatTimeLeft("2026-10-18T01:42:00Z", NOW)).toBe("2h 12m");
    expect(formatTimeLeft("2026-10-17T23:45:00Z", NOW)).toBe("15m");
    expect(formatTimeLeft("2026-10-17T23:00:00Z", NOW)).toBe("closed");
  });

  it("drops closed listings and sorts soonest first", () => {
    const rows = [
      listing({ player_name: "late", ends_at: "2026-10-18T05:00:00Z" }),
      listing({ player_name: "closed", ends_at: "2026-10-17T22:00:00Z" }),
      listing({ player_name: "soon", ends_at: "2026-10-18T00:00:00Z" }),
    ];
    expect(openListings(rows, NOW).map((r) => r.player_name)).toEqual(["soon", "late"]);
  });
});
