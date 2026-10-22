/**
 * Shared Discord plumbing for every post the site makes to the league server:
 * the message shape, the link tagging, and the send.
 *
 * Every post goes through the Discord REST API as the league's existing bot
 * (`Authorization: Bot …`, token in `DISCORD_TOKEN`) to a channel id in
 * `DISCORD_CHANNEL_ID` — one bot, not a webhook per feature. The posts
 * themselves are built in `./discord-power-rankings` (weekly ranking, vote
 * reminder) and `./discord-feed` (trades, daily moves, pick'em, FA auctions).
 *
 * ## Every link is tagged
 *
 * Discord is the main way the league finds the site, so every link a post
 * carries goes through {@link discordLink}, which adds
 * `utm_source=discord&utm_campaign=<post type>`. Vercel Analytics reports page
 * views by those query parameters, which is how a post's pull is measured.
 */

const DISCORD_API = "https://discord.com/api/v10";

/** Embed accent — the site's blue. */
export const EMBED_COLOR = 0x2563eb;

/** Discord's cap on an embed description. */
export const EMBED_DESCRIPTION_LIMIT = 4096;

/** Where links point when `SITE_URL` is not set. */
export const DEFAULT_SITE_URL = "https://sofa-db.vercel.app";

export interface DiscordEmbed {
  title: string;
  url: string;
  description: string;
  color: number;
  footer: { text: string };
}

export interface DiscordMessage {
  embeds: DiscordEmbed[];
}

/**
 * The kind of post, which is also its `utm_campaign`. One list so the
 * analytics campaigns and the posts that produce them cannot drift apart.
 */
export type DiscordCampaign =
  | "power_rankings"
  | "vote_reminder"
  | "trade_pending"
  | "trade_processed"
  | "moves_digest"
  | "pickem_results"
  | "pickem_reminder"
  | "auction_started"
  | "auction_finished";

/** The site origin for links: `SITE_URL`, else the production site. */
export function siteUrlFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return (env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

/**
 * A site link tagged for analytics. `path` may carry its own query string
 * (`/power-rankings?week=4`); the UTM parameters are appended after it.
 */
export function discordLink(siteUrl: string, path: string, campaign: DiscordCampaign): string {
  const url = new URL(path, `${siteUrl.replace(/\/+$/, "")}/`);
  url.searchParams.set("utm_source", "discord");
  url.searchParams.set("utm_campaign", campaign);
  return url.toString();
}

/** A Discord timestamp tag, rendered in each reader's own timezone. */
export function discordTimestamp(at: Date | string, style: "F" | "R" | "f" | "t" = "F"): string | null {
  const ms = typeof at === "string" ? Date.parse(at) : at.getTime();
  if (!Number.isFinite(ms)) return null;
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

/**
 * Trim lines to fit an embed description, ending with a note of how many were
 * left off. Whole lines only, so a post never ends mid-name.
 */
export function fitLines(lines: readonly string[], limit = EMBED_DESCRIPTION_LIMIT, tail = ""): string {
  const suffix = tail ? `\n\n${tail}` : "";
  const full = lines.join("\n") + suffix;
  if (full.length <= limit) return full;
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const note = `…and ${lines.length - i} more`;
    const candidate = [...kept, lines[i]];
    // Leave room for the "and N more" line that will follow if anything is cut.
    if ([...candidate, `…and ${lines.length - i - 1} more`].join("\n").length + suffix.length > limit) {
      return [...kept, note].join("\n") + suffix;
    }
    kept.push(lines[i]);
  }
  return kept.join("\n") + suffix;
}

/**
 * Post a message to a channel as the bot. Throws on any non-2xx response.
 * Returns the new message's id (null if Discord's reply carried none).
 */
export async function postDiscordMessage(
  channelId: string,
  botToken: string,
  message: DiscordMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const res = await fetchImpl(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Discord rejected the post (${res.status}): ${detail}`);
  }
  // The id is a convenience for the post log, never worth failing a sent post over.
  let body: { id?: unknown } | null = null;
  try {
    body = (await res.json()) as { id?: unknown } | null;
  } catch {
    body = null;
  }
  return typeof body?.id === "string" ? body.id : null;
}

/** The bot credentials, or null when either is missing. */
export function discordCredentials(
  env: Readonly<Record<string, string | undefined>> = process.env,
): { token: string; channelId: string } | null {
  const token = env.DISCORD_TOKEN;
  const channelId = env.DISCORD_CHANNEL_ID;
  return token && channelId ? { token, channelId } : null;
}
