/**
 * Free-agent upgrade verdicts — `web/lib/free-agent-upgrades.ts`.
 *
 * The page used to flag any free agent who beat the weakest player the viewer
 * held at his position. A dynasty bench of college stashes and handcuffs made
 * nearly every wire RB an "upgrade". These cases pin the replacement rule:
 * judge against the optimal starting lineup, and only call a bench pickup
 * when he beats the best backup and is close to starter quality.
 */

import { BENCH_FLOOR, classifyFreeAgents } from "@/lib/free-agent-upgrades";
import type { LineupPlayer } from "@/lib/lineup";

function p(
  player_id: string,
  position: string,
  projected_ppg: number,
  weekly_points: number | null = projected_ppg,
): LineupPlayer {
  return {
    player_id,
    name: player_id,
    position,
    nfl_team: "SF",
    ppg: 0,
    projected_ppg,
    weekly_points,
    weekly_opponent: null,
  };
}

/** A full starting nine plus a bench of stashes. */
function roster(): LineupPlayer[] {
  return [
    p("qb1", "QB", 20),
    p("qb2", "QB", 16),
    p("rb1", "RB", 15),
    p("rb2", "RB", 12),
    p("rb3", "RB", 10),
    p("wr1", "WR", 14),
    p("wr2", "WR", 11),
    p("te1", "TE", 9),
    p("k1", "K", 8),
    // Bench: a handcuff, a college stash, a rookie WR.
    p("rb_cuff", "RB", 3),
    p("rb_college", "RB", 0, null),
    p("wr_rookie", "WR", 4),
  ];
}

describe("classifyFreeAgents", () => {
  test("a free agent who only beats a stash is not flagged", () => {
    const v = classifyFreeAgents(roster(), [p("fa_rb", "RB", 5)], "projected");
    // 5 > the 3-point handcuff, but nowhere near the 10-point FLEX RB.
    expect(v.has("fa_rb")).toBe(false);
  });

  test("a free agent who cracks the lineup is a starter, with the gain and who he displaces", () => {
    const v = classifyFreeAgents(roster(), [p("fa_wr", "WR", 13)], "projected");
    const verdict = v.get("fa_wr");
    expect(verdict?.kind).toBe("starter");
    // He takes WR2 (11 → 13); wr2 slides to FLEX over rb3 (10 → 11).
    expect(verdict?.gain).toBeCloseTo(3);
    expect(verdict?.over?.player_id).toBe("rb3");
  });

  test("a near-starter who beats every backup is top bench", () => {
    // 8.5 ≥ 0.8 × 10 (the weakest starting RB) and beats the 3-point handcuff.
    expect(8.5).toBeGreaterThanOrEqual(BENCH_FLOOR * 10);
    const v = classifyFreeAgents(roster(), [p("fa_rb", "RB", 8.5)], "projected");
    expect(v.get("fa_rb")).toMatchObject({ kind: "bench", over: { player_id: "rb_cuff" } });
  });

  test("bench needs to beat the best backup, not the worst", () => {
    const deep = [...roster(), p("rb_vet", "RB", 9)];
    const v = classifyFreeAgents(deep, [p("fa_rb", "RB", 8.5)], "projected");
    expect(v.has("fa_rb")).toBe(false);
  });

  test("kickers are never bench pickups", () => {
    const v = classifyFreeAgents(roster(), [p("fa_k", "K", 7.9)], "projected");
    expect(v.has("fa_k")).toBe(false);
  });

  test("covering a starter's bye is flagged as a bye fill, not a permanent upgrade", () => {
    const team = roster().map((x) => (x.player_id === "te1" ? p("te1", "TE", 9, null) : x));
    const v = classifyFreeAgents(team, [p("fa_te", "TE", 6)], "weekly");
    expect(v.get("fa_te")).toMatchObject({ kind: "bye_fill", over: { player_id: "te1" } });
    // Season-long, the same TE is no upgrade at all.
    expect(classifyFreeAgents(team, [p("fa_te", "TE", 6)], "projected").has("fa_te")).toBe(false);
  });

  test("a tie keeps the player already rostered", () => {
    const v = classifyFreeAgents(roster(), [p("fa_rb", "RB", 10)], "projected");
    expect(v.get("fa_rb")?.kind).not.toBe("starter");
  });

  test("no roster means no verdicts", () => {
    expect(classifyFreeAgents([], [p("fa", "QB", 30)], "projected").size).toBe(0);
  });
});
