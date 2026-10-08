/**
 * The weekly Discord post of the community power ranking.
 *
 * `.github/workflows/post-power-rankings.yml` runs `scripts/post-power-rankings.ts`
 * on Thursday morning, after the week has published itself
 * (`scheduledPublishAt` in `./community-rankings`). This module is the part of
 * that job worth testing: turning a `CommunityRankings` into a Discord message,
 * and sending it.
 *
 * The message carries the same public-safe fields the `/power-rankings` page
 * does — rank, team, movement — and nothing per-voter, because it is built
 * from `CommunityRow`, which has no per-voter fields to leak.
 *
 * It also builds the Wednesday reminder to vote
 * (`.github/workflows/post-vote-reminder.yml`, `scripts/post-vote-reminder.ts`),
 * which links the ballot page and the publish deadline.
 *
 * Sending goes through the Discord REST API as a bot (`Authorization: Bot …`)
 * rather than a channel webhook, so the league's existing bot account posts it
 * and the channel is just an ID.
 */

import type { CommunityRankings } from "./community-rankings";

const DISCORD_API = "https://discord.com/api/v10";

/** Embed accent — the site's blue. */
const EMBED_COLOR = 0x2563eb;

/** "▲2", "▼1", "—", or "" when there is no published prior week to compare to. */
export function discordMovement(movement: number | null): string {
  if (movement === null) return "";
  if (movement === 0) return "—";
  return movement > 0 ? `▲${movement}` : `▼${Math.abs(movement)}`;
}

/** The public page for one week. */
export function rankingsUrl(siteUrl: string, week: number): string {
  return `${siteUrl.replace(/\/+$/, "")}/power-rankings?week=${week}`;
}

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
 * Build the post: every team in order with its movement, then a link.
 *
 * Returns null when nobody has voted — there is no ranking to announce.
 */
export function buildPowerRankingsMessage(
  rankings: CommunityRankings,
  siteUrl: string,
): DiscordMessage | null {
  if (rankings.rows.length === 0) return null;

  const url = rankingsUrl(siteUrl, rankings.week);
  const lines = rankings.rows.map((row) => {
    const move = discordMovement(row.movement);
    return `**${row.rank}.** ${row.teamName}${move ? `  ${move}` : ""}`;
  });

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return {
    embeds: [
      {
        title: `📊 Week ${rankings.week} Power Rankings`,
        url,
        description: `${lines.join("\n")}\n\n[Full rankings →](${url})`,
        color: EMBED_COLOR,
        footer: {
          text: `${plural(rankings.hostBallots, "host ballot")} · ${plural(
            rankings.listenerBallots,
            "listener ballot",
          )}`,
        },
      },
    ],
  };
}

/** The listener ballot page. */
export function voteUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/power-rankings/vote`;
}

/**
 * The mid-week nudge to vote: a link to the ballot and, when the week has a
 * scheduled publish time, the deadline as a Discord timestamp (rendered in
 * each reader's own timezone).
 */
export function buildVoteReminderMessage(
  week: number,
  siteUrl: string,
  closesAt: string | null,
): DiscordMessage {
  const url = voteUrl(siteUrl);
  const unix = closesAt ? Math.floor(Date.parse(closesAt) / 1000) : null;
  const deadline =
    unix !== null && Number.isFinite(unix)
      ? `Voting closes <t:${unix}:F> (<t:${unix}:R>).\n\n`
      : "";
  return {
    embeds: [
      {
        title: `🗳️ Week ${week} Power Rankings — get your vote in`,
        url,
        description: `${deadline}[Submit your ballot →](${url})`,
        color: EMBED_COLOR,
        footer: { text: "Rankings post Thursday morning" },
      },
    ],
  };
}

/** Post a message to a channel as the bot. Throws on any non-2xx response. */
export async function postDiscordMessage(
  channelId: string,
  botToken: string,
  message: DiscordMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
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
}
