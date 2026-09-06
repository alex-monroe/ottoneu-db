/**
 * Team-as-an-object helpers — `web/lib/teams.ts`.
 *
 * Team names were display strings that appeared in a dozen tables and linked
 * nowhere. These pure helpers are what turn one into a destination, so the
 * cases that matter are the ones a URL round-trip can break: names with spaces
 * and punctuation, casing differences between scraped sources, and free agents
 * (which have no team page at all).
 */

import { sameTeamName, teamHref, toTeamGame } from "@/lib/teams";
import type { Matchup } from "@/lib/standings";

function makeMatchup(over: Partial<Matchup> = {}): Matchup {
  return {
    game_id: 1,
    season: 2026,
    week: 3,
    home_team_id: 10,
    home_team_name: "The Witchcraft",
    home_score: null,
    away_team_id: 20,
    away_team_name: "Team Rocket",
    away_score: null,
    status: "scheduled",
    game_type: "regular",
    starts_on: null,
    ends_on: null,
    status_label: null,
    ...over,
  };
}

describe("sameTeamName", () => {
  test("ignores case and surrounding whitespace", () => {
    // The roster CSV and the schedule export disagree about padding.
    expect(sameTeamName("The Witchcraft", "  the witchcraft ")).toBe(true);
  });

  test("distinguishes genuinely different teams", () => {
    expect(sameTeamName("The Witchcraft", "The Witchcrafts")).toBe(false);
  });

  test("null and undefined never match a real team", () => {
    expect(sameTeamName(null, "The Witchcraft")).toBe(false);
    expect(sameTeamName(undefined, "The Witchcraft")).toBe(false);
    // Two absent names are trivially equal; callers guard on the value itself.
    expect(sameTeamName(null, undefined)).toBe(true);
  });
});

describe("teamHref", () => {
  test("encodes spaces so the name survives the URL", () => {
    expect(teamHref("The Witchcraft")).toBe("/teams/The%20Witchcraft");
  });

  test("encodes punctuation that would otherwise split the path", () => {
    expect(teamHref("Slash/Burn")).toBe("/teams/Slash%2FBurn");
    expect(teamHref("Q&A?")).toBe("/teams/Q%26A%3F");
  });

  test("round-trips back to the original name", () => {
    for (const name of ["The Witchcraft", "Slash/Burn", "Q&A?", "Ünïcøde FC"]) {
      const segment = teamHref(name).replace("/teams/", "");
      expect(decodeURIComponent(segment)).toBe(name);
    }
  });

  test("trims stray whitespace rather than encoding it", () => {
    expect(teamHref("  The Witchcraft  ")).toBe("/teams/The%20Witchcraft");
  });
});

describe("toTeamGame", () => {
  test("returns null for a game the team is not in", () => {
    expect(toTeamGame(makeMatchup(), "Some Other Team")).toBeNull();
  });

  test("flips a home game into the team's point of view", () => {
    const g = toTeamGame(
      makeMatchup({ home_score: 120.5, away_score: 99.25, status: "final" }),
      "The Witchcraft",
    )!;
    expect(g.opponent).toBe("Team Rocket");
    expect(g.score).toBe(120.5);
    expect(g.opponentScore).toBe(99.25);
    expect(g.won).toBe(true);
  });

  test("flips an away game symmetrically", () => {
    const g = toTeamGame(
      makeMatchup({ home_score: 120.5, away_score: 99.25, status: "final" }),
      "Team Rocket",
    )!;
    expect(g.opponent).toBe("The Witchcraft");
    expect(g.score).toBe(99.25);
    expect(g.opponentScore).toBe(120.5);
    expect(g.won).toBe(false);
  });

  test("a lead in a live game is not a win", () => {
    const g = toTeamGame(
      makeMatchup({ home_score: 80, away_score: 20, status: "in_progress" }),
      "The Witchcraft",
    )!;
    expect(g.won).toBeNull();
  });

  test("a scheduled game has no result and no scores", () => {
    const g = toTeamGame(makeMatchup(), "The Witchcraft")!;
    expect(g.won).toBeNull();
    expect(g.score).toBeNull();
  });

  test("matches the team case-insensitively", () => {
    expect(toTeamGame(makeMatchup(), "the witchcraft")).not.toBeNull();
  });
});
