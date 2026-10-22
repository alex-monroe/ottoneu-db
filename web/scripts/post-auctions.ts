/**
 * Post FA auctions to Discord: one post when an auction opens, another when it
 * closes with the winner, the price and every bid.
 *
 *   npx tsx scripts/post-auctions.ts [--dry-run] [--seed] [--max-age-days N]
 *
 * Run by `.github/workflows/post-auctions.yml` straight after each
 * `scrape_fa_market.py --auctions-only`, every ten minutes in season. This
 * replaced the standalone Railway bot (alex-monroe/ottoneu-discord-auction-bot),
 * which kept what it had announced in memory; here the `discord_posts` log
 * does that, so each run can start cold. Results that closed before
 * `--max-age-days` ago (default 1, site-clock days) are never posted.
 *
 * `--seed` records everything currently due as posted without sending it — run
 * it once at cut-over so the job does not repeat what the old bot already said.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SECRET_KEY, plus DISCORD_TOKEN and DISCORD_CHANNEL_ID unless
 * `--dry-run` or `--seed`. SITE_URL sets the links' origin.
 */

import { parseArgs } from "node:util";
import { siteUrlFromEnv } from "../lib/discord";
import {
  addDays,
  auctionsToPost,
  buildAuctionFinishedMessage,
  buildAuctionStartedMessage,
} from "../lib/discord-feed";
import {
  fetchOpenAuctions,
  fetchPostedIds,
  fetchRecentAuctionResults,
  seedFeedPost,
  sendFeedPost,
} from "../lib/discord-feed-data";
import { todayInLeagueTz } from "../lib/nfl-week";

const DEFAULT_MAX_AGE_DAYS = 1;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      seed: { type: "boolean", default: false },
      "max-age-days": { type: "string" },
    },
  });
  const dryRun = values["dry-run"] ?? false;
  const seed = values.seed ?? false;
  const maxAgeDays = values["max-age-days"]
    ? Number.parseInt(values["max-age-days"], 10)
    : DEFAULT_MAX_AGE_DAYS;
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
    console.error("--max-age-days must be a whole number of days.");
    return 1;
  }

  const now = new Date();
  const sinceDay = addDays(todayInLeagueTz(), -maxAgeDays);
  const [open, results] = await Promise.all([fetchOpenAuctions(now), fetchRecentAuctionResults(sinceDay)]);
  const candidates = auctionsToPost(open, results, new Set(), now, sinceDay);
  if (candidates.length === 0) {
    console.log(`No open auctions and no results since ${sinceDay}.`);
    return 0;
  }
  const posted = await fetchPostedIds(candidates.map((c) => c.id));
  const due = auctionsToPost(open, results, posted, now, sinceDay);
  if (due.length === 0) {
    console.log(`All ${candidates.length} auction post(s) already sent.`);
    return 0;
  }

  const siteUrl = siteUrlFromEnv();
  for (const post of due) {
    const name = post.kind === "started" ? post.auction.playerName : post.result.playerName;
    const outcome = seed
      ? await seedFeedPost(post.id)
      : await sendFeedPost(
          post.id,
          post.kind === "started"
            ? buildAuctionStartedMessage(post.auction, siteUrl)
            : buildAuctionFinishedMessage(post.result, siteUrl),
          { dryRun },
        );
    console.log(`${post.id.type} ${post.id.key} (${name}): ${outcome}`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
