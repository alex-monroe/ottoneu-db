/**
 * NFL bye-week lookup (web/lib/nfl-byes.ts) and the checked-in table behind it.
 */

import { NFL_BYE_WEEKS } from "@/lib/data/nfl-bye-weeks";
import { DIVISIONS } from "@/lib/nfl-divisions";
import { byeWeek, hasByeWeeks, isOnBye } from "@/lib/nfl-byes";
import { NFL_REGULAR_SEASON_WEEKS } from "@/lib/config";

const CODES = DIVISIONS.flatMap((d) => d.teams.map((t) => t.code)).sort();

describe("NFL_BYE_WEEKS", () => {
  it.each(Object.keys(NFL_BYE_WEEKS).map(Number))("%i lists every team exactly once", (season) => {
    const table = NFL_BYE_WEEKS[season];
    expect(Object.keys(table).sort()).toEqual(CODES);
    for (const week of Object.values(table)) {
      expect(week).toBeGreaterThanOrEqual(2);
      expect(week).toBeLessThan(NFL_REGULAR_SEASON_WEEKS);
    }
  });
});

describe("byeWeek", () => {
  it("reads the nflverse code directly", () => {
    expect(byeWeek(2026, "KC")).toBe(5);
    expect(isOnBye(2026, "KC", 5)).toBe(true);
    expect(isOnBye(2026, "KC", 6)).toBe(false);
  });

  it("maps the roster's Ottoneu spellings onto it", () => {
    expect(byeWeek(2026, "JAC")).toBe(byeWeek(2026, "JAX"));
    expect(byeWeek(2026, "jac")).toBe(7);
  });

  it("has no bye for a free agent, an unknown team, or an unknown season", () => {
    expect(byeWeek(2026, "FA")).toBeNull();
    expect(byeWeek(2026, "")).toBeNull();
    expect(byeWeek(2026, null)).toBeNull();
    expect(byeWeek(1999, "KC")).toBeNull();
    expect(hasByeWeeks(1999)).toBe(false);
    expect(hasByeWeeks(2026)).toBe(true);
  });
});
