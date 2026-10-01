/**
 * Post a week's community power ranking to Discord.
 *
 *   npx tsx scripts/post-power-rankings.ts [--week N] [--dry-run]
 *
 * Run weekly by `.github/workflows/post-power-rankings.yml`, Thursday morning,
 * after the week publishes itself. With no `--week` it posts the week being
 * ranked right now.
 *
 * It never posts a week that is not public on the site — the same
 * `fetchPublicationStatuses` check the `/power-rankings` page makes — so a week
 * a host is holding back stays held. Once it is published, run the workflow by
 * hand to post it.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SECRET_KEY (the same reads the page makes), plus DISCORD_TOKEN and
 * DISCORD_CHANNEL_ID unless `--dry-run`. SITE_URL sets the link's origin.
 */

import { parseArgs } from "node:util";
import { getDisplayWeeks } from "../lib/nfl-week";
import { fetchPowerRankingContext } from "../lib/power-rankings";
import {
  fetchCommunityRankings,
  fetchPublicationStatuses,
} from "../lib/community-rankings";
import {
  buildPowerRankingsMessage,
  postDiscordMessage,
} from "../lib/discord-power-rankings";

const DEFAULT_SITE_URL = "https://sofa-db.vercel.app";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      week: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const requested = values.week ? Number.parseInt(values.week, 10) : undefined;
  const dryRun = values["dry-run"] ?? false;

  // The calendar read swallows errors, so a bad credential reads as an empty
  // calendar. A real calendar always resolves a season; fail loudly rather
  // than mistake a broken secret for the off-season.
  const display = await getDisplayWeeks();
  if (display.season === null) {
    console.error("Could not read the league calendar — check the Supabase secrets.");
    return 1;
  }
  // After the season there is no week being ranked; the weekly cron no-ops.
  if (requested === undefined && display.upcoming === null) {
    console.log("No NFL week in progress — nothing to post.");
    return 0;
  }

  const ctx = await fetchPowerRankingContext(requested);
  if (requested !== undefined && requested !== ctx.week) {
    console.error(`Week ${requested} is not a week of the ${ctx.season} season yet.`);
    return 1;
  }

  const status = (await fetchPublicationStatuses(ctx.season, [ctx.week]))[ctx.week];
  if (!status.isPublic) {
    // Not a failure: a host is holding it, or it is not Thursday yet.
    console.log(
      `Week ${ctx.week} is not public yet (${status.mode}). ` +
        "Publish it from /podcast, then run this workflow by hand.",
    );
    return 0;
  }

  const rankings = await fetchCommunityRankings(ctx.season, ctx.week, ctx.teams);
  const message = buildPowerRankingsMessage(
    rankings,
    process.env.SITE_URL || DEFAULT_SITE_URL,
  );
  if (!message) {
    console.error(`Week ${ctx.week} is public but has no submitted ballots — nothing to post.`);
    return 1;
  }

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
  console.log(`Posted week ${ctx.week} (${rankings.rows.length} teams) to Discord.`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
