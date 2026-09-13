/**
 * Community power rankings — `web/lib/community-rankings.ts`.
 *
 * Three promises worth pinning: a listener's vote never reaches the podcast
 * reveal; the public ranking carries nothing per-voter; and a week goes public
 * on Thursday morning *Eastern*, on both sides of the end of daylight saving.
 */

import * as fs from "fs";
import * as path from "path";
import {
  communityRows,
  formatLeagueTime,
  leagueTzInstant,
  listenerVotingOpen,
  publicationStatus,
  scheduledPublishAt,
} from "@/lib/community-rankings";
import { consolidate, type Ballot, type VoterKind } from "@/lib/power-rankings";
import { seasonAnchor } from "@/lib/nfl-week";

const TEAMS = ["Alpha", "Bravo", "Charlie", "Delta"];

function ballot(userId: string, voterKind: VoterKind, order: string[]): Ballot {
  return {
    userId,
    displayName: userId,
    voterKind,
    submittedAt: "2026-09-15T12:00:00Z",
    entries: order.map((teamName, i) => ({
      teamName,
      rank: i + 1,
      note: `${userId} on ${teamName}`,
    })),
  };
}

// 2026: Ottoneu records Wednesday 2026-09-09; Week 1 opens Tuesday 2026-09-08.
const ANCHOR_2026 = "2026-09-08";

describe("the Thursday-morning schedule", () => {
  test("Week 1 publishes on its Thursday at 09:00 Eastern (EDT, UTC−4)", () => {
    expect(scheduledPublishAt(ANCHOR_2026, 1).toISOString()).toBe("2026-09-10T13:00:00.000Z");
  });

  test("each week is seven days on", () => {
    expect(scheduledPublishAt(ANCHOR_2026, 2).toISOString()).toBe("2026-09-17T13:00:00.000Z");
    expect(scheduledPublishAt(ANCHOR_2026, 8).toISOString()).toBe("2026-10-29T13:00:00.000Z");
  });

  test("after daylight saving ends it is still 09:00 local — 14:00 UTC", () => {
    // DST ends Sunday 2026-11-01.
    expect(scheduledPublishAt(ANCHOR_2026, 9).toISOString()).toBe("2026-11-05T14:00:00.000Z");
    expect(scheduledPublishAt(ANCHOR_2026, 18).toISOString()).toBe("2027-01-07T14:00:00.000Z");
  });

  test("leagueTzInstant is right on the day the clocks change", () => {
    expect(leagueTzInstant("2026-11-01", 9).toISOString()).toBe("2026-11-01T14:00:00.000Z");
    expect(leagueTzInstant("2027-03-14", 9).toISOString()).toBe("2027-03-14T13:00:00.000Z");
  });

  test("the anchor comes from the season's own calendar row", () => {
    const rows = [
      { season: 2025, regular_season_start: "2025-09-04" },
      { season: 2026, regular_season_start: "2026-09-09" },
    ];
    expect(seasonAnchor(rows, 2026)).toBe(ANCHOR_2026);
    expect(seasonAnchor(rows, 2024)).toBeNull();
  });

  test("formats a publish time the way a listener reads it", () => {
    expect(formatLeagueTime("2026-09-17T13:00:00.000Z")).toBe("Thu, Sep 17, 9:00 AM ET");
  });
});

describe("publicationStatus", () => {
  const thursday = scheduledPublishAt(ANCHOR_2026, 2);
  const wednesday = new Date("2026-09-16T20:00:00Z");
  const friday = new Date("2026-09-18T12:00:00Z");

  test("no override: private until Thursday morning, public after", () => {
    expect(publicationStatus(null, thursday, wednesday)).toMatchObject({
      mode: "scheduled",
      isPublic: false,
      publicAt: thursday.toISOString(),
    });
    expect(publicationStatus(null, thursday, friday).isPublic).toBe(true);
  });

  test("published by hand is public before Thursday", () => {
    const status = publicationStatus(
      { publishedAt: "2026-09-16T01:00:00Z", held: false },
      thursday,
      wednesday,
    );
    expect(status).toMatchObject({ mode: "published", isPublic: true });
  });

  test("held stays private after Thursday", () => {
    const status = publicationStatus({ publishedAt: null, held: true }, thursday, friday);
    expect(status).toMatchObject({ mode: "held", isPublic: false, publicAt: null });
  });

  test("with no calendar date it fails closed rather than guessing", () => {
    expect(publicationStatus(null, null, friday).isPublic).toBe(false);
  });

  test("listeners vote only on the current week, and only while it is private", () => {
    const open = publicationStatus(null, thursday, wednesday);
    const closed = publicationStatus(null, thursday, friday);
    expect(listenerVotingOpen(2, 2, open)).toBe(true);
    expect(listenerVotingOpen(2, 2, closed)).toBe(false);
    expect(listenerVotingOpen(1, 2, open)).toBe(false);
  });
});

describe("communityRows", () => {
  const ballots = [
    ballot("alex", "host", ["Alpha", "Bravo", "Charlie", "Delta"]),
    ballot("wads", "host", ["Bravo", "Alpha", "Charlie", "Delta"]),
    ballot("fan1", "listener", ["Delta", "Charlie", "Bravo", "Alpha"]),
    ballot("fan2", "listener", ["Delta", "Charlie", "Alpha", "Bravo"]),
  ];

  test("counts every ballot, hosts and listeners alike", () => {
    const rows = communityRows(ballots, TEAMS);
    // Delta: 4,4,1,1 = 2.5 — listeners pulled it level with the hosts' picks.
    const byName = new Map(rows.map((r) => [r.teamName, r]));
    expect(byName.get("Delta")!.meanRank).toBe(2.5);
    expect(byName.get("Delta")!.firstPlaceVotes).toBe(2);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  test("splits the average by who voted", () => {
    const delta = communityRows(ballots, TEAMS).find((r) => r.teamName === "Delta")!;
    expect(delta.hostMeanRank).toBe(4);
    expect(delta.listenerMeanRank).toBe(1);
  });

  test("a group with no ballots averages to null, not zero", () => {
    const rows = communityRows(ballots.slice(0, 2), TEAMS);
    expect(rows.every((r) => r.listenerMeanRank === null)).toBe(true);
  });

  test("listener ballots are what separate it from the reveal", () => {
    const hostsOnly = consolidate(ballots.slice(0, 2), TEAMS).map((r) => r.teamName);
    const everyone = communityRows(ballots, TEAMS).map((r) => r.teamName);
    expect(everyone).not.toEqual(hostsOnly);
  });

  test("a row carries no names, ids or notes — it is published", () => {
    const [row] = communityRows(ballots, TEAMS, TEAMS);
    expect(Object.keys(row).sort()).toEqual([
      "bestRank",
      "firstPlaceVotes",
      "hostMeanRank",
      "listenerMeanRank",
      "meanRank",
      "movement",
      "previousRank",
      "rank",
      "teamName",
      "worstRank",
    ]);
    const serialised = JSON.stringify(communityRows(ballots, TEAMS));
    for (const who of ["alex", "wads", "fan1", "fan2"]) {
      expect(serialised).not.toContain(who);
    }
  });
});

/**
 * Listener votes stay out of the reveal because `fetchBallots` defaults to host
 * ballots and only the community ranking asks for everyone. Both halves are
 * one-word changes a future feature could make without noticing, so they are
 * pinned at the source.
 */
describe("listener ballots stay out of the reveal", () => {
  const WEB = path.join(__dirname, "..", "..");
  const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf-8");

  test("fetchBallots defaults to hosts and filters on voter_kind", () => {
    const source = read("lib/power-rankings.ts");
    expect(source).toContain('scope: BallotScope = "hosts"');
    expect(source).toContain('ballotQuery.eq("voter_kind", "host")');
  });

  test("fetchWeekRankings — the reveal — never widens the scope", () => {
    const source = read("lib/power-rankings.ts");
    const start = source.indexOf("export const fetchWeekRankings");
    const body = source.slice(start, source.indexOf("\n);", start));
    expect(body).toContain("fetchBallots(season, week)");
    expect(body).not.toContain('"everyone"');
  });

  test("only the community ranking reads everyone's ballots", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(WEB, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name) && /fetchBallots\([^)]*"everyone"/.test(read(rel))) {
          offenders.push(rel);
        }
      }
    };
    walk("app");
    walk("lib");
    walk("components");
    expect(offenders).toEqual([path.join("lib", "community-rankings.ts")]);
  });

  test("saving a ballot requires saying which kind it is", () => {
    expect(read("app/api/podcast/power-rankings/route.ts")).toContain('voterKind: "host"');
    expect(read("app/api/power-rankings/ballot/route.ts")).toContain('voterKind: "listener"');
  });
});
