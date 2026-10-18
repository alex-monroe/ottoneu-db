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
 * Sending goes through the shared bot plumbing in `./discord`, and every link
 * is UTM-tagged there (`utm_campaign=power_rankings` / `vote_reminder`).
 */

import type { CommunityRankings } from "./community-rankings";
import {
  discordLink,
  discordTimestamp,
  EMBED_COLOR,
  postDiscordMessage,
  type DiscordEmbed,
  type DiscordMessage,
} from "./discord";

// The send and the message shape moved to ./discord when the league feed
// (./discord-feed) started posting too; re-exported so existing callers hold.
export { postDiscordMessage };
export type { DiscordEmbed, DiscordMessage };

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

  const url = discordLink(siteUrl, `/power-rankings?week=${rankings.week}`, "power_rankings");
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
  const url = discordLink(siteUrl, "/power-rankings/vote", "vote_reminder");
  const full = closesAt ? discordTimestamp(closesAt, "F") : null;
  const deadline = full
    ? `Voting closes ${full} (${discordTimestamp(closesAt as string, "R")}).\n\n`
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
