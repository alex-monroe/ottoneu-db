/**
 * Ballot API input validation — `web/lib/schemas/power-ranking.ts`.
 *
 * The schema's job stops at shape. Whether an order is a *complete* ranking of
 * the current league is checked in the route against the live team list
 * (`isCompleteBallot`), because the schema cannot know who is in the league —
 * these tests pin that division so neither side is assumed to cover the other.
 */

import { SaveBallotSchema, MAX_NOTE_LENGTH } from "@/lib/schemas/power-ranking";
import { NFL_REGULAR_SEASON_WEEKS } from "@/lib/config";

const VALID = {
  season: 2026,
  week: 3,
  order: ["Alpha", "Bravo"],
  submit: false,
};

describe("SaveBallotSchema", () => {
  test("accepts a draft with a partial order", () => {
    const parsed = SaveBallotSchema.safeParse(VALID);
    expect(parsed.success).toBe(true);
  });

  test("accepts an empty order — a draft may have nothing placed yet", () => {
    expect(SaveBallotSchema.safeParse({ ...VALID, order: [] }).success).toBe(true);
  });

  test("does not enforce completeness — that is the route's job", () => {
    // A one-team "ranking" of a twelve-team league parses fine here and is
    // rejected on submit by isCompleteBallot.
    const parsed = SaveBallotSchema.safeParse({ ...VALID, order: ["Alpha"], submit: true });
    expect(parsed.success).toBe(true);
  });

  test("rejects a week outside the regular season", () => {
    expect(SaveBallotSchema.safeParse({ ...VALID, week: 0 }).success).toBe(false);
    expect(
      SaveBallotSchema.safeParse({ ...VALID, week: NFL_REGULAR_SEASON_WEEKS + 1 }).success,
    ).toBe(false);
    expect(SaveBallotSchema.safeParse({ ...VALID, week: 2.5 }).success).toBe(false);
  });

  test("rejects a missing submit flag — locking in must be explicit", () => {
    expect(
      SaveBallotSchema.safeParse({ season: 2026, week: 3, order: ["Alpha"] }).success,
    ).toBe(false);
  });

  test("trims team names and rejects blank ones", () => {
    const parsed = SaveBallotSchema.safeParse({ ...VALID, order: ["  Alpha  "] });
    expect(parsed.success && parsed.data.order[0]).toBe("Alpha");
    expect(SaveBallotSchema.safeParse({ ...VALID, order: ["   "] }).success).toBe(false);
  });

  test("caps a note at a sentence, not an essay", () => {
    const ok = { ...VALID, notes: { Alpha: "x".repeat(MAX_NOTE_LENGTH) } };
    expect(SaveBallotSchema.safeParse(ok).success).toBe(true);
    const tooLong = { ...VALID, notes: { Alpha: "x".repeat(MAX_NOTE_LENGTH + 1) } };
    expect(SaveBallotSchema.safeParse(tooLong).success).toBe(false);
  });

  test("notes are optional", () => {
    expect(SaveBallotSchema.safeParse({ ...VALID, notes: undefined }).success).toBe(true);
  });
});
