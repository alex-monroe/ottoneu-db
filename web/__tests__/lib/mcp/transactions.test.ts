/**
 * Unit tests for lib/mcp/transactions.ts — the read-side repair of the MCP
 * transaction feed.
 *
 * These cover the three things the stored rows lose (the clock time, the source
 * team of a trade, and how the row was obtained) plus the duplicate-inference
 * suppression, all on the real shapes the table holds.
 */
import {
  parseCardClock,
  classifySource,
  splitMoveType,
  shapeTransaction,
  dedupeInferred,
  sortNewestFirst,
  assessFeed,
  buildTransactionFeed,
  type RawTransactionRow,
  type ShapedTransaction,
} from "@/lib/mcp/transactions";

const CARD = (time: string) => `${time} | The Witchcraft | add | $3`;
const INFERRED = (date: string) =>
  `${date} | The Witchcraft | add | $3 | inferred from /csv/rosters reconciliation 2026-08-23`;

function makeRow(overrides: Partial<RawTransactionRow> = {}): RawTransactionRow {
  return {
    transaction_date: "2026-08-22",
    transaction_type: "add",
    team_name: "The Witchcraft",
    from_team: null,
    salary: 3,
    season: 2026,
    raw_description: CARD("Aug 22, 2026 9:26 PM"),
    players: { name: "Some Player", position: "WR" },
    ...overrides,
  };
}

function makeShaped(overrides: Partial<ShapedTransaction> = {}): ShapedTransaction {
  return {
    occurred_at_local: null,
    date: "2026-08-22",
    type: "add",
    player: "Some Player",
    position: "WR",
    team: "The Witchcraft",
    from_team: null,
    salary: 3,
    season: 2026,
    source: "scraped",
    ...overrides,
  };
}

describe("parseCardClock", () => {
  test("recovers the wall clock the card prints", () => {
    expect(parseCardClock(CARD("Aug 22, 2026 9:26 PM"))).toBe("2026-08-22T21:26");
    expect(parseCardClock(CARD("Aug 22, 2026 9:26 AM"))).toBe("2026-08-22T09:26");
  });

  test("maps 12 AM/PM onto midnight and noon, not 12/24", () => {
    expect(parseCardClock(CARD("Jan 3, 2026 12:05 AM"))).toBe("2026-01-03T00:05");
    expect(parseCardClock(CARD("Jan 3, 2026 12:05 PM"))).toBe("2026-01-03T12:05");
  });

  test("pads single-digit months and days", () => {
    expect(parseCardClock(CARD("Feb 7, 2026 3:04 PM"))).toBe("2026-02-07T15:04");
  });

  test("returns null when the row carries only a date", () => {
    expect(parseCardClock(INFERRED("Aug 23, 2026"))).toBeNull();
    expect(parseCardClock(null)).toBeNull();
    expect(parseCardClock("")).toBeNull();
  });
});

describe("classifySource", () => {
  test("flags the roster-CSV reconciliation marker", () => {
    expect(classifySource(INFERRED("Aug 23, 2026"))).toBe("inferred");
  });

  test("treats a card row — and an unlabelled one — as scraped", () => {
    expect(classifySource(CARD("Aug 22, 2026 9:26 PM"))).toBe("scraped");
    expect(classifySource(null)).toBe("scraped");
  });
});

describe("splitMoveType", () => {
  test("recovers the origin team the stored from_team column never holds", () => {
    expect(splitMoveType("move (from Irish Invasion)", null)).toEqual({
      type: "move",
      from_team: "Irish Invasion",
    });
  });

  test("leaves a plain type and any real stored from_team alone", () => {
    expect(splitMoveType("cut", null)).toEqual({ type: "cut", from_team: null });
    expect(splitMoveType("add", "Team X")).toEqual({ type: "add", from_team: "Team X" });
  });
});

describe("shapeTransaction", () => {
  test("flattens the joined player and derives the recovered fields", () => {
    const t = shapeTransaction(
      makeRow({
        transaction_type: "move (from The Hard Eight)",
        players: [{ name: "Traded Guy", position: "RB" }],
      }),
    );
    expect(t).toMatchObject({
      occurred_at_local: "2026-08-22T21:26",
      type: "move",
      from_team: "The Hard Eight",
      player: "Traded Guy",
      position: "RB",
      source: "scraped",
    });
  });

  test("tolerates a missing player join", () => {
    const t = shapeTransaction(makeRow({ players: null }));
    expect(t.player).toBeNull();
    expect(t.position).toBeNull();
  });
});

describe("dedupeInferred", () => {
  test("drops an inference that restates a scraped move", () => {
    // The 2026-08-23 reconciliation re-derived every card move from 2026-08-22.
    const rows = [
      makeShaped({ date: "2026-08-22", occurred_at_local: "2026-08-22T21:26" }),
      makeShaped({ date: "2026-08-23", source: "inferred" }),
    ];
    const kept = dedupeInferred(rows);
    expect(kept).toHaveLength(1);
    expect(kept[0].source).toBe("scraped");
  });

  test("keeps an inference with no scraped counterpart", () => {
    const rows = [
      makeShaped({ player: "Scraped Guy", occurred_at_local: "2026-08-22T21:26" }),
      makeShaped({ player: "Only Inferred", date: "2026-08-23", source: "inferred" }),
    ];
    expect(dedupeInferred(rows).map((t) => t.player)).toEqual([
      "Scraped Guy",
      "Only Inferred",
    ]);
  });

  test("keeps an inference far outside the match window", () => {
    const rows = [
      makeShaped({ date: "2026-01-05", occurred_at_local: "2026-01-05T10:00" }),
      makeShaped({ date: "2026-08-23", source: "inferred" }),
    ];
    expect(dedupeInferred(rows)).toHaveLength(2);
  });

  test("never drops a scraped row, even a duplicated one", () => {
    const rows = [
      makeShaped({ occurred_at_local: "2026-08-22T21:26" }),
      makeShaped({ occurred_at_local: "2026-08-22T21:26" }),
    ];
    expect(dedupeInferred(rows)).toHaveLength(2);
  });

  test("matches on the whole move, not just the player", () => {
    const rows = [
      makeShaped({ salary: 3, occurred_at_local: "2026-08-22T21:26" }),
      makeShaped({ salary: 9, date: "2026-08-23", source: "inferred" }),
    ];
    expect(dedupeInferred(rows)).toHaveLength(2);
  });
});

describe("sortNewestFirst", () => {
  test("orders same-date rows by the recovered clock, newest first", () => {
    const rows = [
      makeShaped({ player: "Early", occurred_at_local: "2026-08-22T09:05" }),
      makeShaped({ player: "Late", occurred_at_local: "2026-08-22T21:26" }),
      makeShaped({ player: "Midday", occurred_at_local: "2026-08-22T13:00" }),
    ];
    expect(sortNewestFirst(rows).map((t) => t.player)).toEqual(["Late", "Midday", "Early"]);
  });

  test("puts newer dates ahead regardless of clock", () => {
    const rows = [
      makeShaped({ player: "Older", date: "2026-08-22", occurred_at_local: "2026-08-22T23:59" }),
      makeShaped({ player: "Newer", date: "2026-08-23", occurred_at_local: "2026-08-23T00:01" }),
    ];
    expect(sortNewestFirst(rows).map((t) => t.player)).toEqual(["Newer", "Older"]);
  });

  test("sorts date-only rows after timestamped rows on the same date", () => {
    const rows = [
      makeShaped({ player: "No Clock", occurred_at_local: null }),
      makeShaped({ player: "Has Clock", occurred_at_local: "2026-08-22T09:05" }),
    ];
    expect(sortNewestFirst(rows).map((t) => t.player)).toEqual(["Has Clock", "No Clock"]);
  });

  test("is deterministic for date-only rows — the reshuffling bug", () => {
    const rows = [
      makeShaped({ player: "Charlie", occurred_at_local: null }),
      makeShaped({ player: "Alpha", occurred_at_local: null }),
      makeShaped({ player: "Bravo", occurred_at_local: null }),
    ];
    const first = sortNewestFirst(rows).map((t) => t.player);
    const reversed = sortNewestFirst([...rows].reverse()).map((t) => t.player);
    expect(reversed).toEqual(first);
  });

  test("does not mutate its input", () => {
    const rows = [
      makeShaped({ player: "A", occurred_at_local: "2026-08-22T09:05" }),
      makeShaped({ player: "B", occurred_at_local: "2026-08-22T21:26" }),
    ];
    sortNewestFirst(rows);
    expect(rows.map((t) => t.player)).toEqual(["A", "B"]);
  });
});

describe("assessFeed", () => {
  test("flags a single-date page as a bulk load and says not to narrate it", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      makeShaped({ player: `P${i}`, date: "2026-08-23", source: "inferred" }),
    );
    const q = assessFeed(rows);
    expect(q.is_bulk_load).toBe(true);
    expect(q.distinct_dates).toBe(1);
    expect(q.inferred_count).toBe(20);
    expect(q.note).toContain("bulk load");
  });

  test("does not flag a spread of real activity", () => {
    const rows = [
      makeShaped({ date: "2026-08-23" }),
      makeShaped({ date: "2026-08-20" }),
      makeShaped({ date: "2026-08-11" }),
      makeShaped({ date: "2026-07-31" }),
      makeShaped({ date: "2026-07-28" }),
      makeShaped({ date: "2026-07-24" }),
    ];
    const q = assessFeed(rows);
    expect(q.is_bulk_load).toBe(false);
    expect(q.distinct_dates).toBe(6);
  });

  test("a handful of same-day moves is real activity, not a bulk load", () => {
    const rows = [makeShaped(), makeShaped({ player: "B" })];
    expect(assessFeed(rows).is_bulk_load).toBe(false);
  });
});

describe("buildTransactionFeed", () => {
  test("shapes, dedupes, orders, and pages in one pass", () => {
    const rows: RawTransactionRow[] = [
      makeRow({
        transaction_date: "2026-08-22",
        raw_description: CARD("Aug 22, 2026 9:26 PM"),
        players: { name: "Dup Guy", position: "WR" },
      }),
      // The reconciliation's copy of the row above.
      makeRow({
        transaction_date: "2026-08-23",
        raw_description: INFERRED("Aug 23, 2026"),
        players: { name: "Dup Guy", position: "WR" },
      }),
      makeRow({
        transaction_date: "2026-08-22",
        raw_description: CARD("Aug 22, 2026 11:40 PM"),
        players: { name: "Later Guy", position: "TE" },
      }),
    ];
    const { transactions, feed_quality } = buildTransactionFeed(rows, 25);
    expect(transactions.map((t) => t.player)).toEqual(["Later Guy", "Dup Guy"]);
    expect(transactions.every((t) => t.source === "scraped")).toBe(true);
    expect(feed_quality.is_bulk_load).toBe(false);
  });

  test("applies the limit after ordering, so the page is the newest N", () => {
    const rows = [
      makeRow({ raw_description: CARD("Aug 22, 2026 1:00 AM"), players: { name: "Oldest", position: "WR" } }),
      makeRow({ raw_description: CARD("Aug 22, 2026 8:00 PM"), players: { name: "Newest", position: "WR" } }),
      makeRow({ raw_description: CARD("Aug 22, 2026 2:00 PM"), players: { name: "Middle", position: "WR" } }),
    ];
    const { transactions, count } = {
      ...buildTransactionFeed(rows, 2),
      count: 2,
    };
    expect(transactions.map((t) => t.player)).toEqual(["Newest", "Middle"]);
    expect(count).toBe(2);
  });

  test("assesses the page it returns, not the rows it was handed", () => {
    // 30 same-date rows fetched, but a page of 3 is not evidence of a bulk load
    // beyond what the caller can see.
    const rows = Array.from({ length: 30 }, (_, i) =>
      makeRow({
        raw_description: INFERRED("Aug 23, 2026"),
        transaction_date: "2026-08-23",
        players: { name: `P${i}`, position: "WR" },
      }),
    );
    const { transactions, feed_quality } = buildTransactionFeed(rows, 3);
    expect(transactions).toHaveLength(3);
    expect(feed_quality.inferred_count).toBe(3);
    expect(feed_quality.is_bulk_load).toBe(true);
  });
});
