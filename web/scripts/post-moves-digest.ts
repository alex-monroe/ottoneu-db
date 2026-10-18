/**
 * Post one day's adds and cuts to Discord, grouped by team.
 *
 *   npx tsx scripts/post-moves-digest.ts [--date YYYY-MM-DD] [--dry-run]
 *
 * Run daily by `.github/workflows/post-moves-digest.yml`, after the overnight
 * player-card scrape has written the previous day's moves. With no `--date` it
 * posts yesterday (America/New_York). Only scraped `transactions` rows count —
 * an inferred row's date is a reconciliation run, not the move. A day with no
 * moves posts nothing; a day already posted is skipped (`discord_posts`).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SECRET_KEY, plus DISCORD_TOKEN and DISCORD_CHANNEL_ID unless
 * `--dry-run`. SITE_URL sets the link's origin.
 */

import { parseArgs } from "node:util";
import { siteUrlFromEnv } from "../lib/discord";
import { addDays, buildMovesDigestMessage, postIdString, type FeedPostId } from "../lib/discord-feed";
import { fetchPostedIds, sendFeedPost } from "../lib/discord-feed-data";
import { todayInLeagueTz } from "../lib/nfl-week";
import { fetchWeekMoves } from "../lib/recap-moves";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      date: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const dryRun = values["dry-run"] ?? false;
  const day = values.date ?? addDays(todayInLeagueTz(), -1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    console.error("--date must be YYYY-MM-DD.");
    return 1;
  }

  const id: FeedPostId = { type: "moves_digest", key: day };
  if (!dryRun && (await fetchPostedIds([id])).has(postIdString(id))) {
    console.log(`The ${day} digest was already posted.`);
    return 0;
  }

  const message = buildMovesDigestMessage(day, await fetchWeekMoves(day, day), siteUrlFromEnv());
  if (!message) {
    console.log(`No scraped adds or cuts on ${day} — nothing to post.`);
    return 0;
  }
  console.log(`moves_digest ${day}: ${await sendFeedPost(id, message, { dryRun })}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
