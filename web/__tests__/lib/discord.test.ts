import {
  discordCredentials,
  discordLink,
  discordTimestamp,
  fitLines,
  postDiscordMessage,
  siteUrlFromEnv,
} from "@/lib/discord";

describe("discordLink", () => {
  it("tags a path with the Discord source and the post's campaign", () => {
    expect(discordLink("https://site.test/", "/trades", "trade_processed")).toBe(
      "https://site.test/trades?utm_source=discord&utm_campaign=trade_processed",
    );
  });

  it("keeps a query string the path already carries", () => {
    expect(discordLink("https://site.test", "/pickem?week=7", "pickem_reminder")).toBe(
      "https://site.test/pickem?week=7&utm_source=discord&utm_campaign=pickem_reminder",
    );
  });
});

describe("siteUrlFromEnv", () => {
  it("uses SITE_URL without a trailing slash, else the production site", () => {
    expect(siteUrlFromEnv({ SITE_URL: "https://preview.test/" })).toBe(
      "https://preview.test",
    );
    expect(siteUrlFromEnv({})).toBe("https://sofa-db.vercel.app");
  });
});

describe("discordCredentials", () => {
  it("needs both the token and the channel", () => {
    expect(discordCredentials({ DISCORD_TOKEN: "t" })).toBeNull();
    expect(
      discordCredentials({ DISCORD_TOKEN: "t", DISCORD_CHANNEL_ID: "c" }),
    ).toEqual({ token: "t", channelId: "c" });
  });
});

describe("discordTimestamp", () => {
  it("renders a Discord time tag, or null for an unparseable time", () => {
    expect(discordTimestamp("2026-10-22T00:00:00.000Z", "R")).toBe("<t:1792627200:R>");
    expect(discordTimestamp("not a date")).toBeNull();
  });
});

describe("fitLines", () => {
  it("returns everything when it fits", () => {
    expect(fitLines(["a", "b"], 100, "tail")).toBe("a\nb\n\ntail");
  });

  it("cuts whole lines and says how many were left off, keeping the tail", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const out = fitLines(lines, 40, "T");
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("\n\nT")).toBe(true);
    expect(out).toMatch(/…and \d+ more/);
    expect(out.startsWith("line 0\n")).toBe(true);
  });
});

describe("postDiscordMessage", () => {
  it("returns the new message id", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: "999" }) });
    await expect(
      postDiscordMessage("123", "tok", { embeds: [] }, fetchImpl as unknown as typeof fetch),
    ).resolves.toBe("999");
  });

  it("does not fail a sent post over an unreadable reply", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new Error("x")) });
    await expect(
      postDiscordMessage("123", "tok", { embeds: [] }, fetchImpl as unknown as typeof fetch),
    ).resolves.toBeNull();
  });
});
