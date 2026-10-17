/**
 * Post new league trades to Discord: a heads-up while a trade is pending
 * (Ottoneu's 48-hour veto window), then the trade once it processes.
 *
 *   npx tsx scripts/post-trades.ts [--dry-run] [--max-age-days N]
 *
 * Run by `.github/workflows/scrape-trade-history.yml` straight after each
 * four-hourly trade-history scrape. Each trade is posted at most once per
 * state — the `discord_posts` log is checked first and claimed before sending
 * — and only trades from the last `--max-age-days` (default 3) are considered,
 * so a first run or a long outage never floods the channel with old news.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SECRET_KEY, plus DISCORD_TOKEN and DISCORD_CHANNEL_ID unless
 * `--dry-run`. SITE_URL sets the links' origin.
 */

import { parseArgs } from "node:util";
import { siteUrlFromEnv } from "../lib/discord";
import { addDays, buildTradeMessage, tradesToPost } from "../lib/discord-feed";
import {
  fetchPostedIds,
  fetchProductionBook,
  fetchRecentTrades,
  sendFeedPost,
} from "../lib/discord-feed-data";
import { todayInLeagueTz } from "../lib/nfl-week";

const DEFAULT_MAX_AGE_DAYS = 3;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      "max-age-days": { type: "string" },
    },
  });
  const dryRun = values["dry-run"] ?? false;
  const maxAgeDays = values["max-age-days"]
    ? Number.parseInt(values["max-age-days"], 10)
    : DEFAULT_MAX_AGE_DAYS;
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
    console.error("--max-age-days must be a whole number of days.");
    return 1;
  }

  const today = todayInLeagueTz();
  const trades = await fetchRecentTrades(addDays(today, -maxAgeDays));
  const candidates = tradesToPost(trades, new Set(), today, maxAgeDays);
  if (candidates.length === 0) {
    console.log(`No pending or processed trades in the last ${maxAgeDays} days.`);
    return 0;
  }
  const posted = await fetchPostedIds(candidates.map((c) => c.id));
  const due = tradesToPost(trades, posted, today, maxAgeDays);
  if (due.length === 0) {
    console.log(`All ${candidates.length} recent trade post(s) already sent.`);
    return 0;
  }

  const book = await fetchProductionBook();
  const siteUrl = siteUrlFromEnv();
  for (const { id, trade } of due) {
    const outcome = await sendFeedPost(id, buildTradeMessage(trade, book, siteUrl), { dryRun });
    console.log(`${id.type} ${id.key} (${trade.teams.join(" ⇄ ")}): ${outcome}`);
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
