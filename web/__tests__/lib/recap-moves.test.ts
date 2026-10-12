/**
 * The recap's roster-move derivation (web/lib/recap-moves.ts).
 *
 * The transaction log stores one row per player, and the page is read out loud,
 * so what is worth pinning is anything that would put a false sentence on air:
 * one trade announced as four, last week's move in this week's list, a
 * reconciliation duplicate read out as a second add, or a guessed date stated
 * as fact.
 */

import { weekMoves, weekWindow, type MoveRow } from "@/lib/recap-moves";
import type { Matchup } from "@/lib/standings";

let nextId = 1;

function row(
  type: string,
  team: string,
  name: string,
  salary: number,
  clock: string | null,
  date: string,
  overrides: Partial<MoveRow> = {},
): MoveRow {
  return {
    transaction_date: date,
    transaction_type: type,
    team_name: team,
    from_team: null,
    salary,
    season: 2026,
    raw_description: clock ? `${clock} | ${team} | ${type} | $${salary}` : null,
    players: { name, position: "WR", ottoneu_id: nextId++, nfl_team: "CHI" },
    ...overrides,
  };
}

const FROM = "2026-09-30";
const TO = "2026-10-06";

describe("weekWindow", () => {
  const game = (starts_on: string | null, ends_on: string | null) =>
    ({ starts_on, ends_on }) as Matchup;

  it("spans the week's games", () => {
    expect(weekWindow([game(FROM, TO), game(FROM, TO)])).toEqual({ from: FROM, to: TO });
  });

  it("is null when the schedule carries no dates", () => {
    expect(weekWindow([game(null, null)])).toBeNull();
    expect(weekWindow([])).toBeNull();
  });
});

describe("weekMoves", () => {
  it("puts a trade's per-player rows back together as one trade with two sides", () => {
    const clock = "Oct 1, 2026 10:19 PM";
    const moves = weekMoves(
      [
        row("move (from Tinseltown)", "Gouda", "Michael Wilson", 21, clock, "2026-10-01"),
        row("move (from Tinseltown)", "Gouda", "Jameis Winston", 9, clock, "2026-10-01"),
        row("move (from Gouda)", "Tinseltown", "Kirk Cousins", 14, clock, "2026-10-01"),
      ],
      FROM,
      TO,
    );

    expect(moves.trades).toHaveLength(1);
    const [gouda, tinseltown] = moves.trades[0].sides;
    expect(gouda.teamName).toBe("Gouda");
    expect(gouda.received.map((m) => m.name)).toEqual(["Michael Wilson", "Jameis Winston"]);
    expect(tinseltown.received.map((m) => m.name)).toEqual(["Kirk Cousins"]);
    expect(moves.adds).toHaveLength(0);
    expect(moves.cuts).toHaveLength(0);
  });

  it("keeps a one-sided trade, with an empty other side", () => {
    const moves = weekMoves(
      [row("move (from B)", "A", "Solo", 5, "Oct 1, 2026 1:00 PM", "2026-10-01")],
      FROM,
      TO,
    );
    expect(moves.trades[0].sides.map((s) => s.received.length)).toEqual([1, 0]);
  });

  it("keeps two trades apart when the clock or the teams differ", () => {
    const moves = weekMoves(
      [
        row("move (from B)", "A", "One", 5, "Oct 1, 2026 1:00 PM", "2026-10-01"),
        row("move (from A)", "B", "Two", 5, "Oct 1, 2026 1:00 PM", "2026-10-01"),
        row("move (from B)", "A", "Three", 5, "Oct 1, 2026 9:30 PM", "2026-10-01"),
        row("move (from C)", "A", "Four", 5, "Oct 1, 2026 1:00 PM", "2026-10-01"),
      ],
      FROM,
      TO,
    );
    expect(moves.trades).toHaveLength(3);
    // Newest first.
    expect(moves.trades[0].sides.flatMap((s) => s.received.map((m) => m.name))).toEqual(["Three"]);
  });

  it("lists adds and cuts biggest salary first", () => {
    const moves = weekMoves(
      [
        row("add", "A", "Cheap", 1, "Oct 2, 2026 1:00 PM", "2026-10-02"),
        row("add", "B", "Pricey", 10, "Oct 3, 2026 1:00 PM", "2026-10-03"),
        row("cut", "A", "Small", 1, "Oct 2, 2026 1:05 PM", "2026-10-02"),
        row("cut", "C", "Big", 18, "Sep 30, 2026 12:09 AM", "2026-09-30"),
      ],
      FROM,
      TO,
    );
    expect(moves.adds.map((m) => m.name)).toEqual(["Pricey", "Cheap"]);
    expect(moves.cuts.map((m) => m.name)).toEqual(["Big", "Small"]);
    expect(moves.adds[0]).toMatchObject({ teamName: "B", salary: 10, at: "2026-10-03T13:00" });
  });

  it("includes both ends of the window and nothing outside it", () => {
    const moves = weekMoves(
      [
        row("add", "A", "Day before", 1, null, "2026-09-29"),
        row("add", "A", "First day", 1, null, FROM),
        row("add", "A", "Last day", 1, null, TO),
        row("add", "A", "Day after", 1, null, "2026-10-07"),
      ],
      FROM,
      TO,
    );
    expect(moves.adds.map((m) => m.name).sort()).toEqual(["First day", "Last day"]);
  });

  it("ignores rows that are not a move a team made", () => {
    const moves = weekMoves([row("increase", "A", "Arb Target", 3, null, "2026-10-01")], FROM, TO);
    expect(moves).toMatchObject({ trades: [], adds: [], cuts: [] });
  });

  describe("rows inferred by the roster reconciliation", () => {
    const inferred = (name: string, date: string, id: number) =>
      row("add", "A", name, 4, null, date, {
        raw_description: `${date} | A | add | $4 | inferred from /csv/rosters reconciliation`,
        players: { name, position: "RB", ottoneu_id: id, nfl_team: "WAS" },
      });

    it("drops one that restates a scraped move, even from before the window", () => {
      const scraped = row("add", "A", "Brian Robinson", 4, "Sep 29, 2026 10:05 PM", "2026-09-29", {
        players: { name: "Brian Robinson", position: "RB", ottoneu_id: 900, nfl_team: "WAS" },
      });
      const moves = weekMoves([scraped, inferred("Brian Robinson", "2026-09-30", 900)], FROM, TO);
      expect(moves.adds).toHaveLength(0);
    });

    it("keeps one that stands alone, marked as an approximate date", () => {
      const moves = weekMoves([inferred("Lone Wolf", "2026-10-01", 901)], FROM, TO);
      expect(moves.adds).toHaveLength(1);
      expect(moves.adds[0].approximate).toBe(true);
      expect(moves.adds[0].at).toBeNull();
    });
  });
});
