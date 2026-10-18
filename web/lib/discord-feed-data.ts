/**
 * Reads and the send behind the league Discord feed. All the judgement is in
 * `./discord-feed`; this file gathers rows, and owns the `discord_posts` log
 * that keeps every post to once.
 *
 * Server-only: the post log is written with the service key
 * (`getSupabaseAdmin`), and the jobs run in GitHub Actions, never in a page.
 */

import { LEAGUE_ID } from "./config";
import { fetchPlayerSetEndOfSeason } from "./data";
import {
  discordCredentials,
  postDiscordMessage,
  type DiscordMessage,
} from "./discord";
import { addDays, postIdString, productionBook, type FeedPostId, type ProductionBook } from "./discord-feed";
import { calculateEarnedValue } from "./earned-value";
import { fetchAllRows, getSupabaseAdmin, supabase } from "./supabase";
import { tradesFromHistory, type LeagueTrade, type TradeAssetRow, type TradeRow } from "./trades";

// ---------------------------------------------------------------------------
// The post log
// ---------------------------------------------------------------------------

/** Which of `ids` have already been posted, as `postIdString`s. */
export async function fetchPostedIds(ids: readonly FeedPostId[]): Promise<Set<string>> {
  const posted = new Set<string>();
  const types = [...new Set(ids.map((i) => i.type))];
  for (const type of types) {
    const keys = ids.filter((i) => i.type === type).map((i) => i.key);
    const { data, error } = await getSupabaseAdmin()
      .from("discord_posts")
      .select("post_key")
      .eq("league_id", LEAGUE_ID)
      .eq("post_type", type)
      .in("post_key", keys); // pagination-safe: bounded by the keys asked about
    // Failing closed: if the log cannot be read, nothing is safe to post.
    if (error) throw new Error(`Could not read discord_posts: ${error.message}`);
    for (const row of data ?? []) posted.add(postIdString({ type, key: row.post_key }));
  }
  return posted;
}

export type SendOutcome = "posted" | "dry-run" | "already-posted";

/**
 * Post one message, at most once ever.
 *
 * The log row is *claimed* before the post goes out: an insert that hits the
 * primary key means another run already has it, so this one stops. If Discord
 * then rejects the post, the claim is released so the next run retries. The
 * order matters — post-then-record would double-post whenever the record
 * failed after a successful send.
 *
 * `dryRun` prints the message and touches neither Discord nor the log.
 */
export async function sendFeedPost(
  id: FeedPostId,
  message: DiscordMessage,
  { dryRun }: { dryRun: boolean },
): Promise<SendOutcome> {
  if (dryRun) {
    console.log(`--- ${postIdString(id)} (dry run) ---`);
    console.log(JSON.stringify(message, null, 2));
    return "dry-run";
  }
  const creds = discordCredentials();
  if (!creds) throw new Error("DISCORD_TOKEN and DISCORD_CHANNEL_ID must be set.");

  const admin = getSupabaseAdmin();
  const claim = await admin
    .from("discord_posts")
    .insert({ league_id: LEAGUE_ID, post_type: id.type, post_key: id.key });
  if (claim.error) {
    // 23505 = unique_violation: already claimed by an earlier or concurrent run.
    if (claim.error.code === "23505") return "already-posted";
    throw new Error(`Could not record ${postIdString(id)}: ${claim.error.message}`);
  }

  let messageId: string | null;
  try {
    messageId = await postDiscordMessage(creds.channelId, creds.token, message);
  } catch (err) {
    await admin
      .from("discord_posts")
      .delete()
      .eq("league_id", LEAGUE_ID)
      .eq("post_type", id.type)
      .eq("post_key", id.key);
    throw err;
  }
  if (messageId) {
    await admin
      .from("discord_posts")
      .update({ discord_message_id: messageId })
      .eq("league_id", LEAGUE_ID)
      .eq("post_type", id.type)
      .eq("post_key", id.key);
  }
  return "posted";
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

/**
 * Trade-history trades agreed on or after `since` (`YYYY-MM-DD`), with their
 * assets. A trade processes 48 hours after it is agreed, so reading by
 * `accepted_at` with a margin covers every trade processed since, too.
 */
export async function fetchRecentTrades(since: string): Promise<LeagueTrade[]> {
  const from = addDays(since, -7);
  const trades = (await fetchAllRows((lo, hi) =>
    supabase
      .from("trades")
      .select("trade_id, season, accepted_at, processed_at, status, offered_by_team_name, offered_to_team_name")
      .eq("league_id", LEAGUE_ID)
      .gte("accepted_at", from)
      // stable-order: trade_id is unique within a league (PK league_id, trade_id)
      .order("trade_id")
      .range(lo, hi),
  )) as TradeRow[];
  if (trades.length === 0) return [];

  const assets = (await fetchAllRows((lo, hi) =>
    supabase
      .from("trade_assets")
      .select("trade_id, asset_type, from_team_name, to_team_name, ottoneu_id, is_college, player_id, player_name, position, amount")
      .eq("league_id", LEAGUE_ID)
      .in("trade_id", trades.map((t) => t.trade_id))
      // stable-order: (trade_id, asset_key) is the PK within a league
      .order("trade_id")
      .order("asset_key")
      .range(lo, hi),
  )) as TradeAssetRow[];
  return tradesFromHistory(trades, assets);
}

/**
 * The value read's inputs: this season's production and earned value, over
 * the live stat window — the same numbers `/value`'s earned tab and the MCP
 * `get_earned_value` tool show. Never the preseason projection (#748).
 */
export async function fetchProductionBook(): Promise<ProductionBook> {
  const { players, window } = await fetchPlayerSetEndOfSeason();
  return productionBook(players, calculateEarnedValue(players, window), window);
}
