/**
 * Read side of `fa_market` — the open auctions and claimable waivers that
 * scripts/scrape_fa_market.py snapshots. See fa-market.ts for the pricing.
 */
import { LEAGUE_ID } from "./config";
import type { MarketKind, MarketListing } from "./fa-market";
import { supabase } from "./supabase";

/**
 * Listings whose window has not shut yet, soonest-closing first, plus when the
 * snapshot was taken (null when the table is empty).
 *
 * The table holds one row per player on the market — a few dozen at most — so
 * one bounded read is enough.
 */
export async function fetchOpenMarket(
  now: Date = new Date(),
): Promise<{ listings: MarketListing[]; scrapedAt: string | null }> {
  const { data, error } = await supabase
    .from("fa_market")
    .select(
      "kind, player_id, ottoneu_id, is_college, player_name, nfl_team, position, injury_status, min_bid, salary, ends_at, scraped_at",
    )
    .eq("league_id", LEAGUE_ID)
    .gt("ends_at", now.toISOString())
    .order("ends_at")
    .order("id")
    .limit(500); // pagination-safe: one row per player on the market, a few dozen
  if (error || !data) return { listings: [], scrapedAt: null };

  const scrapedAt = data.reduce<string | null>(
    (latest, r) => (latest == null || r.scraped_at > latest ? r.scraped_at : latest),
    null,
  );
  const listings: MarketListing[] = data.map((r) => ({
    kind: r.kind as MarketKind,
    player_id: r.player_id,
    ottoneu_id: r.ottoneu_id,
    is_college: r.is_college,
    player_name: r.player_name,
    nfl_team: r.nfl_team,
    position: r.position,
    injury_status: r.injury_status,
    min_bid: r.min_bid,
    salary: r.salary,
    ends_at: r.ends_at,
  }));
  return { listings, scrapedAt };
}
