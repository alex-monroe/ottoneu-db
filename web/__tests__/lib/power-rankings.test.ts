/**
 * Power-rankings consolidation — `web/lib/power-rankings.ts`.
 *
 * The whole feature rests on two people's orderings folding into one, live, on
 * air. So the properties worth pinning are the ones a wrong answer would be
 * embarrassing about: that the result is a total order with no gaps, that it is
 * deterministic (the reveal page re-renders mid-episode and must not reshuffle),
 * that a draft ballot cannot leak into it, and that the movement arrows point
 * the way a viewer reads them.
 */

import {
  consolidate,
  biggestDisagreement,
  isCompleteBallot,
  movementLabel,
  submittedOnly,
  type Ballot,
} from "@/lib/power-rankings";

const TEAMS = ["Alpha", "Bravo", "Charlie", "Delta"];

/** A submitted ballot listing `order` best-first. */
function ballot(
  userId: string,
  order: string[],
  notes: Record<string, string> = {},
  submittedAt: string | null = "2026-09-08T12:00:00Z",
): Ballot {
  return {
    userId,
    displayName: userId,
    submittedAt,
    entries: order.map((teamName, i) => ({
      teamName,
      rank: i + 1,
      note: notes[teamName] ?? null,
    })),
  };
}

describe("consolidate", () => {
  test("a single ballot is its own consolidated order", () => {
    const rows = consolidate([ballot("alex", TEAMS)], TEAMS);
    expect(rows.map((r) => r.teamName)).toEqual(TEAMS);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(rows.every((r) => r.spread === 0)).toBe(true);
  });

  test("two ballots average to the middle", () => {
    const rows = consolidate(
      [
        ballot("alex", ["Alpha", "Bravo", "Charlie", "Delta"]),
        ballot("wads", ["Bravo", "Alpha", "Delta", "Charlie"]),
      ],
      TEAMS,
    );
    // Alpha (1,2) and Bravo (2,1) both average 1.5; Charlie (3,4) and Delta
    // (4,3) both average 3.5.
    expect(rows.map((r) => r.meanRank)).toEqual([1.5, 1.5, 3.5, 3.5]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  test("ties break towards conviction, not consensus", () => {
    // Alpha (1,3), Bravo (2,2) and Charlie (3,1) all average 2.0. Bravo is the
    // team both hosts agreed on; Alpha and Charlie each had somebody willing to
    // call them the best in the league. The two with a first-place vote take
    // the higher slots.
    const rows = consolidate(
      [
        ballot("alex", ["Alpha", "Bravo", "Charlie", "Delta"]),
        ballot("wads", ["Charlie", "Bravo", "Alpha", "Delta"]),
      ],
      TEAMS,
    );
    const byName = new Map(rows.map((r) => [r.teamName, r]));
    expect(byName.get("Alpha")!.meanRank).toBe(2);
    expect(byName.get("Bravo")!.meanRank).toBe(2);
    expect(byName.get("Charlie")!.meanRank).toBe(2);
    expect(byName.get("Bravo")!.rank).toBe(3);
    expect(byName.get("Bravo")!.bestRank).toBe(2);
    // Alpha and Charlie are identical down to the last numeric tiebreak, so the
    // name settles it — arbitrary, but stable, which is the property that
    // matters when the page re-renders mid-episode.
    expect(rows.map((r) => r.teamName)).toEqual(["Alpha", "Charlie", "Bravo", "Delta"]);
  });

  test("the order is deterministic — re-running mid-episode cannot reshuffle it", () => {
    // Two teams identical on every tiebreak but the name.
    const ballots = [
      ballot("alex", ["Alpha", "Bravo", "Charlie", "Delta"]),
      ballot("wads", ["Bravo", "Alpha", "Charlie", "Delta"]),
    ];
    const first = consolidate(ballots, TEAMS).map((r) => r.teamName);
    const again = consolidate([...ballots].reverse(), TEAMS).map((r) => r.teamName);
    expect(again).toEqual(first);
    expect(first[0]).toBe("Alpha"); // name is the last resort, and it is stable
  });

  test("ranks are contiguous 1..n with no gaps or duplicates", () => {
    const rows = consolidate(
      [
        ballot("alex", ["Delta", "Charlie", "Bravo", "Alpha"]),
        ballot("wads", ["Charlie", "Delta", "Alpha", "Bravo"]),
      ],
      TEAMS,
    );
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(new Set(rows.map((r) => r.teamName)).size).toBe(TEAMS.length);
  });

  test("records each host's own placement, for the argument on air", () => {
    const rows = consolidate(
      [
        ballot("alex", ["Alpha", "Bravo", "Charlie", "Delta"], { Delta: "still not sold" }),
        ballot("wads", ["Delta", "Alpha", "Bravo", "Charlie"]),
      ],
      TEAMS,
    );
    const delta = rows.find((r) => r.teamName === "Delta")!;
    expect(delta.votes).toEqual([
      { userId: "alex", displayName: "alex", rank: 4, note: "still not sold" },
      { userId: "wads", displayName: "wads", rank: 1, note: null },
    ]);
    expect(delta.bestRank).toBe(1);
    expect(delta.worstRank).toBe(4);
    expect(delta.spread).toBe(3);
  });

  test("a team nobody ranked is dropped rather than invented a slot", () => {
    // Echo joined the league after the ballots were locked.
    const teams = [...TEAMS, "Echo"];
    const rows = consolidate([ballot("alex", TEAMS)], teams);
    expect(rows.map((r) => r.teamName)).not.toContain("Echo");
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  test("a team that has since left the league is ignored", () => {
    const rows = consolidate([ballot("alex", [...TEAMS, "Foxtrot"])], TEAMS);
    expect(rows.map((r) => r.teamName)).toEqual(TEAMS);
  });

  test("scores a team on the ballots that ranked it, not on ballot count", () => {
    // One host left Delta off entirely; the other had it second.
    const partial: Ballot = {
      userId: "wads",
      displayName: "wads",
      submittedAt: "2026-09-08T12:00:00Z",
      entries: [
        { teamName: "Alpha", rank: 1, note: null },
        { teamName: "Delta", rank: 2, note: null },
      ],
    };
    const rows = consolidate([ballot("alex", TEAMS), partial], TEAMS);
    const delta = rows.find((r) => r.teamName === "Delta")!;
    expect(delta.votes).toHaveLength(2);
    expect(delta.meanRank).toBe(3); // (4 + 2) / 2
    const charlie = rows.find((r) => r.teamName === "Charlie")!;
    expect(charlie.votes).toHaveLength(1);
    expect(charlie.meanRank).toBe(3); // only alex ranked it, at 3
  });
});

describe("movement against last week", () => {
  const LAST_WEEK = ["Alpha", "Bravo", "Charlie", "Delta"];

  test("positive movement means the team climbed", () => {
    const rows = consolidate(
      [ballot("alex", ["Delta", "Alpha", "Bravo", "Charlie"])],
      TEAMS,
      LAST_WEEK,
    );
    const delta = rows.find((r) => r.teamName === "Delta")!;
    expect(delta.previousRank).toBe(4);
    expect(delta.rank).toBe(1);
    expect(delta.movement).toBe(3);
    expect(movementLabel(delta.movement)).toBe("+3");
  });

  test("negative movement means the team fell", () => {
    const rows = consolidate(
      [ballot("alex", ["Delta", "Alpha", "Bravo", "Charlie"])],
      TEAMS,
      LAST_WEEK,
    );
    const alpha = rows.find((r) => r.teamName === "Alpha")!;
    expect(alpha.movement).toBe(-1);
    expect(movementLabel(alpha.movement)).toBe("−1");
  });

  test("no prior week leaves movement null rather than zero", () => {
    // "Held steady" and "we have never ranked this before" are different
    // claims, and the reveal renders them differently.
    const rows = consolidate([ballot("alex", TEAMS)], TEAMS);
    expect(rows.every((r) => r.movement === null)).toBe(true);
    expect(rows.every((r) => r.previousRank === null)).toBe(true);
    expect(movementLabel(null)).toBe("new");
  });

  test("a team absent from last week's order is new, not unmoved", () => {
    const rows = consolidate([ballot("alex", TEAMS)], TEAMS, ["Alpha", "Bravo", "Charlie"]);
    const delta = rows.find((r) => r.teamName === "Delta")!;
    expect(delta.previousRank).toBeNull();
    expect(delta.movement).toBeNull();
    expect(movementLabel(0)).toBe("—");
  });
});

describe("drafts stay private", () => {
  test("submittedOnly drops ballots that were never locked in", () => {
    const locked = ballot("alex", TEAMS);
    const draft = ballot("wads", [...TEAMS].reverse(), {}, null);
    expect(submittedOnly([locked, draft])).toEqual([locked]);
  });

  test("a draft cannot change the consolidated order", () => {
    const locked = ballot("alex", TEAMS);
    const draft = ballot("wads", [...TEAMS].reverse(), {}, null);
    const counted = consolidate(submittedOnly([locked, draft]), TEAMS);
    expect(counted.map((r) => r.teamName)).toEqual(TEAMS);
    expect(counted.every((r) => r.votes.length === 1)).toBe(true);
  });
});

describe("biggestDisagreement", () => {
  test("finds the widest split", () => {
    const rows = consolidate(
      [
        ballot("alex", ["Alpha", "Bravo", "Charlie", "Delta"]),
        ballot("wads", ["Delta", "Charlie", "Bravo", "Alpha"]),
      ],
      TEAMS,
    );
    const split = biggestDisagreement(rows)!;
    expect(split.spread).toBe(3);
    expect(["Alpha", "Delta"]).toContain(split.teamName);
  });

  test("returns null when the hosts agreed on everything", () => {
    const rows = consolidate(
      [ballot("alex", TEAMS), ballot("wads", TEAMS)],
      TEAMS,
    );
    expect(biggestDisagreement(rows)).toBeNull();
  });

  test("returns null for a single ballot, which cannot disagree with itself", () => {
    expect(biggestDisagreement(consolidate([ballot("alex", TEAMS)], TEAMS))).toBeNull();
  });
});

describe("isCompleteBallot", () => {
  test("accepts a permutation of the league", () => {
    expect(isCompleteBallot(["Delta", "Alpha", "Charlie", "Bravo"], TEAMS)).toBe(true);
  });

  test("rejects a missing team", () => {
    expect(isCompleteBallot(["Alpha", "Bravo", "Charlie"], TEAMS)).toBe(false);
  });

  test("rejects a duplicate, even at the right length", () => {
    expect(isCompleteBallot(["Alpha", "Alpha", "Bravo", "Charlie"], TEAMS)).toBe(false);
  });

  test("rejects a team that is not in the league", () => {
    expect(isCompleteBallot(["Alpha", "Bravo", "Charlie", "Echo"], TEAMS)).toBe(false);
  });

  test("rejects an empty ballot", () => {
    expect(isCompleteBallot([], TEAMS)).toBe(false);
  });
});
