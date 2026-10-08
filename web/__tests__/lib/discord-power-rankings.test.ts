import {
  buildPowerRankingsMessage,
  buildVoteReminderMessage,
  discordMovement,
  postDiscordMessage,
  rankingsUrl,
  voteUrl,
} from "@/lib/discord-power-rankings";
import type { CommunityRankings, CommunityRow } from "@/lib/community-rankings";

function row(rank: number, teamName: string, movement: number | null): CommunityRow {
  return {
    rank,
    teamName,
    meanRank: rank,
    bestRank: rank,
    worstRank: rank,
    firstPlaceVotes: rank === 1 ? 1 : 0,
    hostMeanRank: rank,
    listenerMeanRank: null,
    previousRank: movement === null ? null : rank + movement,
    movement,
  };
}

function rankings(rows: CommunityRow[], hostBallots = 2, listenerBallots = 1): CommunityRankings {
  return { season: 2026, week: 4, rows, hostBallots, listenerBallots, unranked: [] };
}

describe("discordMovement", () => {
  it("shows climbs, falls, no change, and nothing without a prior week", () => {
    expect(discordMovement(3)).toBe("▲3");
    expect(discordMovement(-2)).toBe("▼2");
    expect(discordMovement(0)).toBe("—");
    expect(discordMovement(null)).toBe("");
  });
});

describe("rankingsUrl", () => {
  it("links the week's public page, tolerating a trailing slash", () => {
    expect(rankingsUrl("https://site.test/", 4)).toBe("https://site.test/power-rankings?week=4");
    expect(rankingsUrl("https://site.test", 4)).toBe("https://site.test/power-rankings?week=4");
  });
});

describe("buildPowerRankingsMessage", () => {
  it("lists every team in order with its movement, then the link", () => {
    const msg = buildPowerRankingsMessage(
      rankings([row(1, "Alpha", 2), row(2, "Bravo", -1), row(3, "Charlie", 0)]),
      "https://site.test",
    );
    const embed = msg!.embeds[0];
    expect(embed.title).toBe("📊 Week 4 Power Rankings");
    expect(embed.url).toBe("https://site.test/power-rankings?week=4");
    expect(embed.description).toBe(
      [
        "**1.** Alpha  ▲2",
        "**2.** Bravo  ▼1",
        "**3.** Charlie  —",
        "",
        "[Full rankings →](https://site.test/power-rankings?week=4)",
      ].join("\n"),
    );
    expect(embed.footer.text).toBe("2 host ballots · 1 listener ballot");
  });

  it("omits the movement marker when there is no published prior week", () => {
    const msg = buildPowerRankingsMessage(rankings([row(1, "Alpha", null)]), "https://site.test");
    expect(msg!.embeds[0].description.split("\n")[0]).toBe("**1.** Alpha");
  });

  it("returns null when nobody voted", () => {
    expect(buildPowerRankingsMessage(rankings([]), "https://site.test")).toBeNull();
  });

  it("carries nothing per-voter", () => {
    const json = JSON.stringify(
      buildPowerRankingsMessage(rankings([row(1, "Alpha", 1)]), "https://site.test"),
    );
    expect(json).not.toMatch(/userId|displayName|note|email/);
  });
});

describe("buildVoteReminderMessage", () => {
  it("links the ballot page and shows the deadline as a Discord timestamp", () => {
    const embed = buildVoteReminderMessage(5, "https://site.test/", "2026-10-08T13:00:00.000Z")
      .embeds[0];
    expect(voteUrl("https://site.test/")).toBe("https://site.test/power-rankings/vote");
    expect(embed.title).toBe("🗳️ Week 5 Power Rankings — get your vote in");
    expect(embed.url).toBe("https://site.test/power-rankings/vote");
    expect(embed.description).toBe(
      [
        "Voting closes <t:1791464400:F> (<t:1791464400:R>).",
        "",
        "[Submit your ballot →](https://site.test/power-rankings/vote)",
      ].join("\n"),
    );
  });

  it("leaves out the deadline when the week has no scheduled publish time", () => {
    const embed = buildVoteReminderMessage(5, "https://site.test", null).embeds[0];
    expect(embed.description).toBe("[Submit your ballot →](https://site.test/power-rankings/vote)");
  });
});

describe("postDiscordMessage", () => {
  const message = { embeds: [] };

  it("posts to the channel as the bot", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });
    await postDiscordMessage("123", "tok", message, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://discord.com/api/v10/channels/123/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bot tok" }),
        body: JSON.stringify(message),
      }),
    );
  });

  it("throws with Discord's reason on a non-2xx", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve("Missing Access") });
    await expect(
      postDiscordMessage("123", "tok", message, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow("Discord rejected the post (403): Missing Access");
  });
});
