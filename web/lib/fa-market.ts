/**
 * The open free-agent market — active auctions and claimable waivers — priced
 * for the viewer.
 *
 * `fa_market` (scripts/scrape_fa_market.py) says who is on the block and when
 * the window shuts. This module says what each one is worth *to you*: the
 * player's value on this season's production, scaled by whether he would
 * actually play for your roster, and capped by the cap room you have.
 *
 * ## Why the suggested bid is just your value
 *
 * Ottoneu FA auctions are sealed second-price (Vickrey): the high bidder wins
 * and pays the second-highest bid + $1. In that format bidding your true value
 * is the dominant strategy — shading down only risks losing a player you would
 * have been happy to pay for, and you never pay your own bid unless someone
 * else bid nearly as much. So the suggested maximum is the value, not a guess
 * at what others will bid.
 *
 * ## Value: this season's production, on the full-season scale
 *
 * The preseason model is withheld in season (#748), so a pickup is priced on
 * what he has actually done: `computeEarnedValue` run over the current
 * season's points with no stat window. Without a window the closed-economy pot
 * is the full distributable cap, so the dollars come out on the *full-season*
 * scale — what his production to date is worth as a season's salary. That is
 * the right unit to set against a bid or a claim, because an Ottoneu salary is
 * an annual price, not a prorated one.
 *
 * ## Fit: the same lineup test as the free-agent table
 *
 * League value is what he is worth to an average roster. To yours he is worth
 * that only if he plays: `classifyFreeAgents` (free-agent-upgrades.ts) on
 * season PPG says whether he would start, cover a bye, be your first man off
 * the bench, or not dress at all, and {@link FIT_WEIGHT} discounts the value
 * accordingly.
 */
import { MIN_PLAYER_SALARY } from "./config";
import type { UpgradeKind } from "./free-agent-upgrades";

export type MarketKind = "auction" | "waiver";

/** One `fa_market` row, as the page reads it. */
export interface MarketListing {
  kind: MarketKind;
  player_id: string | null;
  ottoneu_id: number;
  is_college: boolean;
  player_name: string;
  nfl_team: string | null;
  position: string | null;
  injury_status: string | null;
  min_bid: number | null;
  salary: number | null;
  /** ISO instant the auction closes / the claim window shuts. */
  ends_at: string;
}

/** How a listed player fits the viewer's roster. `unknown` = no viewer team. */
export type MarketFit = UpgradeKind | "none" | "unknown";

/**
 * Share of a player's league value he is worth to you, by fit.
 *
 * A starter is worth all of it. A top backup plays only when someone is hurt
 * or on bye, so roughly half. A bye fill is a one-week streamer. A player who
 * would not dress still has some value — trade bait, injury cover further down
 * the line — but little. With no viewer team there is nothing to fit against,
 * so the league value stands.
 */
export const FIT_WEIGHT: Record<MarketFit, number> = {
  starter: 1,
  bench: 0.5,
  bye_fill: 0.25,
  none: 0.2,
  unknown: 1,
};

export const FIT_LABEL: Record<MarketFit, string> = {
  starter: "Starter",
  bench: "Top bench",
  bye_fill: "Bye fill",
  none: "Wouldn't start",
  unknown: "—",
};

/** Hours until `endsAt`, never negative. */
export function hoursLeft(endsAt: string, now: number): number {
  return Math.max(0, (Date.parse(endsAt) - now) / 3_600_000);
}

/** "5h 12m", "42m", or "closed". */
export function formatTimeLeft(endsAt: string, now: number): string {
  const mins = Math.floor(hoursLeft(endsAt, now) * 60);
  if (mins <= 0) return "closed";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** What he is worth to the viewer: league value × fit weight. Null if unpriced. */
export function valueToYou(leagueValue: number | null, fit: MarketFit): number | null {
  if (leagueValue == null) return null;
  return leagueValue * FIT_WEIGHT[fit];
}

export type BidAdvice =
  /** Bid up to `maxBid`. */
  | { action: "bid"; maxBid: number; cappedByRoom: boolean }
  /** Worth less to you than the minimum bid. */
  | { action: "pass"; maxBid: number }
  /** You cannot cover even the minimum bid. */
  | { action: "no_room" }
  /** No production to price (college prospect, kicker, no games yet). */
  | { action: "unpriced" };

/**
 * The most to bid in a Vickrey auction: your value (see the module doc),
 * rounded down to whole dollars, capped at your cap room.
 */
export function suggestMaxBid(input: {
  value: number | null;
  minBid: number | null;
  capRoom: number | null;
}): BidAdvice {
  const minBid = input.minBid ?? MIN_PLAYER_SALARY;
  if (input.capRoom != null && input.capRoom < minBid) return { action: "no_room" };
  if (input.value == null) return { action: "unpriced" };
  const worth = Math.max(0, Math.floor(input.value));
  if (worth < minBid) return { action: "pass", maxBid: worth };
  const cappedByRoom = input.capRoom != null && input.capRoom < worth;
  return { action: "bid", maxBid: cappedByRoom ? input.capRoom! : worth, cappedByRoom };
}

export type ClaimAdvice =
  /** Worth more to you than the salary a claim pays. `margin` = value − salary. */
  | { action: "claim"; margin: number }
  /** Costs more than he is worth to you. */
  | { action: "pass"; margin: number }
  | { action: "no_room" }
  | { action: "unpriced" };

/**
 * A waiver claim has no bidding: the claimer pays the full salary he was cut
 * at. So the question is only whether that salary is below his value to you,
 * and whether it fits under your cap.
 */
export function adviseClaim(input: {
  value: number | null;
  salary: number | null;
  capRoom: number | null;
}): ClaimAdvice {
  const salary = input.salary ?? MIN_PLAYER_SALARY;
  if (input.capRoom != null && input.capRoom < salary) return { action: "no_room" };
  if (input.value == null) return { action: "unpriced" };
  const margin = Math.round(input.value - salary);
  return margin > 0 ? { action: "claim", margin } : { action: "pass", margin };
}

/** A listing with everything the board needs, serializable for a client component. */
export interface MarketBoardRow extends MarketListing {
  /** Season PPG and games so far (null with no `players` row or no stats). */
  ppg: number | null;
  games_played: number | null;
  /** Earned value on the full-season scale (module doc). Null when unpriced. */
  league_value: number | null;
  fit: MarketFit;
  /** The displaced starter / best backup, for the fit tooltip. */
  fit_over: string | null;
  /** `league_value × FIT_WEIGHT[fit]`. */
  value_to_you: number | null;
}

/**
 * Join listings to their value and fit. `earned` and `stats` are keyed by
 * `players.id`; `verdicts` is `classifyFreeAgents` output (absent = would not
 * play). `hasViewer` false means there is no roster to fit against.
 */
export function buildBoardRows(
  listings: MarketListing[],
  earned: Map<string, number>,
  stats: Map<string, { ppg: number; games_played: number }>,
  verdicts: Map<string, { kind: UpgradeKind; over: { name: string } | null }>,
  hasViewer: boolean,
): MarketBoardRow[] {
  return listings.map((l) => {
    const id = l.player_id;
    const v = id ? verdicts.get(id) : undefined;
    const fit: MarketFit = !hasViewer ? "unknown" : v ? v.kind : "none";
    const leagueValue = id ? (earned.get(id) ?? null) : null;
    const s = id ? stats.get(id) : undefined;
    return {
      ...l,
      ppg: s?.ppg ?? null,
      games_played: s?.games_played ?? null,
      league_value: leagueValue,
      fit,
      fit_over: v?.over?.name ?? null,
      value_to_you: valueToYou(leagueValue, fit),
    };
  });
}

/** Listings still open at `now`, soonest-closing first. */
export function openListings<T extends Pick<MarketListing, "ends_at">>(rows: T[], now: number): T[] {
  return rows
    .filter((r) => Date.parse(r.ends_at) > now)
    .sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at));
}
