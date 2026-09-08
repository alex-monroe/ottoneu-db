/**
 * Week-aware lineup scoring — the `weekly` metric in `web/lib/lineup.ts`.
 *
 * `/lineup` scored by the season-long model or last season's PPG, on a page
 * whose entire purpose is setting THIS week's lineup, while the per-game
 * numbers sat unused in `weekly_projections`. The cases that matter here are
 * the ones the old two-metric code could not express: a player on bye (no row
 * for that week) must be distinguishable from one forecast to score zero, and
 * must never be optimised into a starting slot ahead of someone who plays.
 */

import {
  getMetricScore,
  hasWeeklyData,
  optimizeLineup,
  lineupTotal,
  type LineupPlayer,
} from "@/lib/lineup";

function player(over: Partial<LineupPlayer> & { player_id: string; position: string }): LineupPlayer {
  return {
    name: over.player_id,
    nfl_team: "SF",
    ppg: 0,
    projected_ppg: 0,
    weekly_points: null,
    weekly_opponent: null,
    ...over,
  } as LineupPlayer;
}

describe("weekly metric", () => {
  test("scores by the week's projection, not the season average", () => {
    const p = player({ player_id: "a", position: "RB", ppg: 20, projected_ppg: 18, weekly_points: 7.5 });
    expect(getMetricScore(p, "weekly")).toBe(7.5);
    expect(getMetricScore(p, "projected")).toBe(18);
    expect(getMetricScore(p, "last_season")).toBe(20);
  });

  test("a bye scores zero but is not the same as a zero forecast", () => {
    const bye = player({ player_id: "bye", position: "RB", weekly_points: null });
    const zero = player({ player_id: "zero", position: "RB", weekly_points: 0 });

    expect(getMetricScore(bye, "weekly")).toBe(0);
    expect(getMetricScore(zero, "weekly")).toBe(0);
    // The distinction the UI needs to print "BYE" rather than "0.0".
    expect(hasWeeklyData(bye)).toBe(false);
    expect(hasWeeklyData(zero)).toBe(true);
  });

  test("a bye never beats a player who is actually playing", () => {
    // Season-long, the bye player is far better — which is exactly how the old
    // metrics would have started him.
    const star = player({ player_id: "star", position: "RB", ppg: 25, projected_ppg: 24, weekly_points: null });
    const filler = player({ player_id: "filler", position: "RB", ppg: 4, projected_ppg: 5, weekly_points: 9 });

    const weekly = optimizeLineup([star, filler], "weekly");
    expect(weekly.RB1).toBe("filler");

    const seasonal = optimizeLineup([star, filler], "projected");
    expect(seasonal.RB1).toBe("star");
  });

  test("lineup total sums the week's points", () => {
    const players = [
      player({ player_id: "qb", position: "QB", weekly_points: 20 }),
      player({ player_id: "rb", position: "RB", weekly_points: 10 }),
      player({ player_id: "bye", position: "RB", weekly_points: null }),
    ];
    const lineup = optimizeLineup(players, "weekly");
    const total = lineupTotal(lineup, new Map(players.map((p) => [p.player_id, p])), "weekly");
    // QB 20 + RB 10 + the bye contributing nothing, plus superflex reuse rules.
    expect(total).toBeGreaterThanOrEqual(30);
    expect(Number.isFinite(total)).toBe(true);
  });

  test("players with no weekly row at all still produce a valid lineup", () => {
    const players = [
      player({ player_id: "qb", position: "QB", ppg: 18 }),
      player({ player_id: "rb", position: "RB", ppg: 12 }),
    ];
    const lineup = optimizeLineup(players, "weekly");
    expect(lineup.QB).toBe("qb");
    expect(lineup.RB1).toBe("rb");
  });
});
