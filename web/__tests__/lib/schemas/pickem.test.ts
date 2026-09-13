/**
 * Pick'em API input validation — `web/lib/schemas/pickem.ts`.
 *
 * Shape only: whether the week is open and the team plays in the game are
 * checked in the route against the live schedule.
 */

import { SavePickSchema, SetPickemNameSchema } from "@/lib/schemas/pickem";
import { NFL_REGULAR_SEASON_WEEKS } from "@/lib/config";

const VALID = { season: 2026, week: 2, gameId: 7286897, teamId: 42 };

describe("SavePickSchema", () => {
  test("accepts a pick", () => {
    expect(SavePickSchema.safeParse(VALID).success).toBe(true);
  });

  test("accepts null to clear a pick", () => {
    expect(SavePickSchema.safeParse({ ...VALID, teamId: null }).success).toBe(true);
  });

  test("requires the team field, rather than treating a missing one as a clear", () => {
    const { teamId: _omit, ...rest } = VALID;
    expect(SavePickSchema.safeParse(rest).success).toBe(false);
  });

  test("rejects weeks outside the regular season", () => {
    expect(SavePickSchema.safeParse({ ...VALID, week: 0 }).success).toBe(false);
    expect(
      SavePickSchema.safeParse({ ...VALID, week: NFL_REGULAR_SEASON_WEEKS + 1 }).success,
    ).toBe(false);
  });

  test("rejects unknown fields, so nobody can post picks for another user", () => {
    expect(SavePickSchema.safeParse({ ...VALID, userId: "someone" }).success).toBe(false);
  });
});

describe("SetPickemNameSchema", () => {
  test("accepts a name", () => {
    expect(SetPickemNameSchema.safeParse({ displayName: "Couch Coach" }).success).toBe(true);
  });

  test("rejects an unbounded name", () => {
    expect(SetPickemNameSchema.safeParse({ displayName: "x".repeat(500) }).success).toBe(false);
  });
});
