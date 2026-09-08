/**
 * Team week snapshots — `web/lib/team-snapshot.ts`.
 *
 * This is the number that goes on a power-ranking row next to a team's record,
 * so the properties worth pinning are the ones that would make it lie: that the
 * total really is the *optimal* lineup rather than whoever happened to be first
 * in the roster array, that a bye never gets optimised into a starting slot
 * (and never gets scored as a zero-point starter), and that the bench is
 * ordered the way you scan it — best available first, byes at the bottom where
 * they belong.
 */

import { buildTeamWeekSnapshot } from "@/lib/team-snapshot";
import type { LineupPlayer } from "@/lib/lineup";
import type { LineupTeam } from "@/lib/lineup-data";

function player(
  id: string,
  position: string,
  weekly: number | null,
  extra: Partial<LineupPlayer> = {},
): LineupPlayer {
  return {
    player_id: id,
    name: id,
    position,
    nfl_team: "SF",
    ppg: 0,
    projected_ppg: 0,
    weekly_points: weekly,
    weekly_opponent: weekly == null ? null : "@LAR",
    ...extra,
  };
}

/**
 * Exactly nine players, all of whom play this week — one per slot, so anything
 * passed in `extras` has to earn its way in rather than filling a hole.
 * Totals 112: 20 + 14 + 12 + 13 + 11 + 9 + 10 (FLEX) + 15 (SUPERFLEX) + 8.
 */
function roster(...extras: LineupPlayer[]): LineupTeam {
  return {
    team_name: "Alpha",
    players: [
      player("qb1", "QB", 20),
      player("qb2", "QB", 15),
      player("rb1", "RB", 14),
      player("rb2", "RB", 12),
      player("wr1", "WR", 13),
      player("wr2", "WR", 11),
      player("wr3", "WR", 10),
      player("te1", "TE", 9),
      player("k1", "K", 8),
      ...extras,
    ],
  };
}

const FULL_TOTAL = 112;

describe("buildTeamWeekSnapshot", () => {
  test("fills every slot and totals the starters", () => {
    const snap = buildTeamWeekSnapshot(roster());

    expect(snap.starters).toHaveLength(9);
    expect(snap.starters.every((s) => s.player !== null)).toBe(true);
    expect(snap.projectedPoints).toBeCloseTo(FULL_TOTAL, 5);
    expect(snap.bench).toHaveLength(0);
  });

  test("the total is the optimal lineup, not the roster order", () => {
    // A better RB sits at the end of the array. A naive fill would leave him on
    // the bench and under-report the team by the difference.
    const withBetterRb = buildTeamWeekSnapshot(roster(player("rb3", "RB", 25)));
    const starterIds = withBetterRb.starters.map((s) => s.player?.playerId);

    expect(starterIds).toContain("rb3");
    // rb3 takes an RB slot, rb2 slides into FLEX, and the weakest flex-eligible
    // starter (wr3, 10) is the one who drops out.
    expect(withBetterRb.bench.map((p) => p.playerId)).toEqual(["wr3"]);
    expect(withBetterRb.projectedPoints).toBeCloseTo(FULL_TOTAL - 10 + 25, 5);
  });

  test("a player on bye never starts ahead of one who plays", () => {
    // Season-long he is the best receiver on the roster; this week he has no row.
    const star = player("wr_bye", "WR", null);
    const snap = buildTeamWeekSnapshot(roster(star));

    const starterIds = snap.starters.map((s) => s.player?.playerId);
    expect(starterIds).not.toContain("wr_bye");
    expect(snap.bench.map((p) => p.playerId)).toEqual(["wr_bye"]);
    expect(snap.benchUnprojected).toBe(1);
  });

  test("a missing forecast is null, not zero", () => {
    const snap = buildTeamWeekSnapshot(roster(player("wr_bye", "WR", null)));
    const bye = snap.bench.find((p) => p.playerId === "wr_bye");

    // The UI prints "—" for null and "0.0" for zero, which are different claims.
    expect(bye?.points).toBeNull();
    expect(bye?.opponent).toBeNull();
  });

  test("bench is best-first with the byes last regardless of how good they are", () => {
    const snap = buildTeamWeekSnapshot(
      roster(
        player("bench_bye", "WR", null),
        player("bench_low", "WR", 2),
        player("bench_mid", "WR", 6),
      ),
    );

    // wr1/wr2 hold the WR slots; the extras fill FLEX and then bench out.
    expect(snap.bench.map((p) => p.playerId)).toEqual([
      "bench_mid",
      "bench_low",
      "bench_bye",
    ]);
    expect(snap.bench.at(-1)?.points).toBeNull();
  });

  test("an unfillable slot is reported rather than silently skipped", () => {
    const kickerless: LineupTeam = {
      team_name: "Alpha",
      players: roster().players.filter((p) => p.position !== "K"),
    };
    const snap = buildTeamWeekSnapshot(kickerless);

    const k = snap.starters.find((s) => s.slot === "K");
    expect(k).toBeDefined();
    expect(k?.player).toBeNull();
    expect(snap.projectedPoints).toBeCloseTo(FULL_TOTAL - 8, 5);
  });

  test("a bye still starts when the slot has nobody else — that is a real lineup", () => {
    // Nine slots, and the only flex-eligible body left is on bye. A real team in
    // this position starts him and scores nothing for the slot, so the snapshot
    // says so rather than pretending the slot is empty.
    const thin: LineupTeam = {
      team_name: "Thin",
      players: [
        player("qb1", "QB", 20),
        player("qb2", "QB", 15),
        player("rb1", "RB", 14),
        player("rb2", "RB", 12),
        player("wr1", "WR", 13),
        player("wr2", "WR", 11),
        player("te1", "TE", 9),
        player("k1", "K", 8),
        player("flex_bye", "WR", null),
      ],
    };
    const snap = buildTeamWeekSnapshot(thin);
    const flex = snap.starters.find((s) => s.slot === "FLEX");

    expect(flex?.player?.playerId).toBe("flex_bye");
    expect(flex?.player?.points).toBeNull();
    expect(snap.projectedPoints).toBeCloseTo(102, 5);
    expect(snap.bench).toEqual([]);
  });

  test("an empty roster projects zero rather than throwing", () => {
    const snap = buildTeamWeekSnapshot({ team_name: "Empty", players: [] });

    expect(snap.projectedPoints).toBe(0);
    expect(snap.starters.every((s) => s.player === null)).toBe(true);
    expect(snap.bench).toEqual([]);
  });
});
