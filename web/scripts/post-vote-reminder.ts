/**
 * Remind the league Discord to vote in this week's power rankings.
 *
 *   npx tsx scripts/post-vote-reminder.ts [--dry-run]
 *
 * Run weekly by `.github/workflows/post-vote-reminder.yml`, Wednesday at noon
 * Pacific — the day before the week publishes itself Thursday morning.
 *
 * It only posts while listener voting is open — the same `listenerVotingOpen`
 * check the `/power-rankings/vote` page makes — so it stays quiet in the
 * off-season and once a host has published the week early.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SECRET_KEY, plus DISCORD_TOKEN and DISCORD_CHANNEL_ID unless
 * `--dry-run`. SITE_URL sets the link's origin.
 */

import { parseArgs } from "node:util";
import { getDisplayWeeks } from "../lib/nfl-week";
import { fetchPowerRankingContext } from "../lib/power-rankings";
import { fetchPublicationStatus, listenerVotingOpen } from "../lib/community-rankings";
import { buildVoteReminderMessage, postDiscordMessage } from "../lib/discord-power-rankings";

const DEFAULT_SITE_URL = "https://sofa-db.vercel.app";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { "dry-run": { type: "boolean", default: false } },
  });
  const dryRun = values["dry-run"] ?? false;

  // The calendar read swallows errors, so a bad credential reads as an empty
  // calendar. Fail loudly rather than mistake a broken secret for the off-season.
  const display = await getDisplayWeeks();
  if (display.season === null) {
    console.error("Could not read the league calendar — check the Supabase secrets.");
    return 1;
  }
  if (display.upcoming === null) {
    console.log("No NFL week in progress — no vote to remind about.");
    return 0;
  }

  const ctx = await fetchPowerRankingContext();
  const status = await fetchPublicationStatus(ctx.season, ctx.week);
  if (!listenerVotingOpen(ctx.week, ctx.week, status)) {
    console.log(`Week ${ctx.week} voting is closed (${status.mode}) — nothing to post.`);
    return 0;
  }

  const message = buildVoteReminderMessage(
    ctx.week,
    process.env.SITE_URL || DEFAULT_SITE_URL,
    status.scheduledAt,
  );

  if (dryRun) {
    console.log(JSON.stringify(message, null, 2));
    return 0;
  }

  const token = process.env.DISCORD_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!token || !channelId) {
    console.error("DISCORD_TOKEN and DISCORD_CHANNEL_ID must be set.");
    return 1;
  }
  await postDiscordMessage(channelId, token, message);
  console.log(`Posted the week ${ctx.week} vote reminder to Discord.`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
