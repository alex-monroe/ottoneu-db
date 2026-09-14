/**
 * The community power ranking: every vote, hosts and listeners, in one public
 * order.
 *
 * The podcast reveal (`./power-rankings`) consolidates the hosts' ballots and
 * nobody else's. Signed-in listeners can cast a ballot too, and this module is
 * the only place those ballots are counted. It owns three things:
 *
 * 1. **The consolidation**, which is the reveal's own `consolidate` — the same
 *    mean rank and conviction tiebreak — run over every submitted ballot, then
 *    reduced to a row with **no per-voter fields at all**. The result is public,
 *    and listeners never agreed to have their names or orderings shown, so the
 *    row carries counts and averages only. Host on-air notes do not travel
 *    either: they are read out on the show, and the page should not publish
 *    them ahead of the episode.
 *
 * 2. **When it goes public.** A week publishes itself at **Thursday 09:00
 *    America/New_York** of the week being ranked — after the hosts have had
 *    Tuesday and Wednesday to record, before Thursday night's kickoff makes the
 *    ranking stale. A host can override that per week from `/podcast`: publish
 *    early, hold it back past Thursday, or return it to the schedule. The
 *    override is a row in `power_ranking_publications`; no row means "on the
 *    schedule", so an ordinary week writes nothing.
 *
 * 3. **When listeners may vote.** Only on the upcoming week, and only until
 *    that week is public. A ballot changed after publication would silently
 *    rewrite a ranking people have already read.
 */

import { cache } from "react";
import { LEAGUE_ID } from "./config";
import { getSupabaseAdmin } from "./supabase";
import { getSeasonAnchor, LEAGUE_TZ } from "./nfl-week";
import {
  consolidate,
  fetchBallots,
  submittedOnly,
  type Ballot,
} from "./power-rankings";

// ---------------------------------------------------------------------------
// The publication schedule (pure)
// ---------------------------------------------------------------------------

/** Days from a week's opening Tuesday to its Thursday. */
const TUESDAY_TO_THURSDAY = 2;

/** Local hour, in the league's timezone, that a week goes public on Thursday. */
export const AUTO_PUBLISH_HOUR = 9;

const MS_PER_DAY = 86_400_000;

/** Minutes the league's timezone is ahead of UTC at `instant` (negative in the US). */
function leagueTzOffsetMinutes(instant: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: LEAGUE_TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant that is `hour`:00 on `date` (YYYY-MM-DD) in the league's timezone.
 *
 * Computed through `Intl` rather than a fixed −5h because the season crosses
 * the end of daylight saving time in early November: 09:00 ET is 13:00 UTC in
 * September and 14:00 UTC in December.
 */
export function leagueTzInstant(date: string, hour: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  let instant = guess - leagueTzOffsetMinutes(new Date(guess)) * 60_000;
  // The guess can sit on the other side of a DST change from the answer;
  // one correction with the offset at the corrected instant settles it.
  const settled = leagueTzOffsetMinutes(new Date(instant));
  instant = guess - settled * 60_000;
  return new Date(instant);
}

/**
 * When week `week`'s community ranking goes public if nobody overrides it:
 * that week's Thursday at {@link AUTO_PUBLISH_HOUR}, league time.
 *
 * @param anchor Week 1's opening Tuesday (`seasonAnchor` in `./nfl-week`).
 */
export function scheduledPublishAt(anchor: string, week: number): Date {
  const thursday = new Date(
    Date.parse(`${anchor}T00:00:00Z`) + (7 * (week - 1) + TUESDAY_TO_THURSDAY) * MS_PER_DAY,
  )
    .toISOString()
    .slice(0, 10);
  return leagueTzInstant(thursday, AUTO_PUBLISH_HOUR);
}

/** "Thu, Sep 17, 9:00 AM ET" — a publication time as a listener reads it. */
export function formatLeagueTime(iso: string): string {
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: LEAGUE_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
  return `${text} ET`;
}

/** A host's override for one week. No row = on the schedule. */
export interface PublicationOverride {
  /** Set when a host published it early. */
  publishedAt: string | null;
  /** True when a host held it back past the schedule. */
  held: boolean;
}

/**
 * - `scheduled` — no override; public from Thursday morning.
 * - `published` — a host published it by hand.
 * - `held` — a host is holding it back; Thursday passes without it going out.
 */
export type PublicationMode = "scheduled" | "published" | "held";

export interface PublicationStatus {
  mode: PublicationMode;
  /** Whether anybody may see the ranking right now. */
  isPublic: boolean;
  /** When it went, or will go, public. Null while held. */
  publicAt: string | null;
  /** The Thursday-morning time, whatever the override. Null with no calendar. */
  scheduledAt: string | null;
}

/**
 * Resolve one week's visibility. Pure.
 *
 * With no calendar date for the season there is no Thursday to publish on, so
 * a scheduled week stays private until a host publishes it — failing closed
 * rather than guessing a date.
 */
export function publicationStatus(
  override: PublicationOverride | null,
  scheduledAt: Date | null,
  now: Date,
): PublicationStatus {
  const scheduled = scheduledAt?.toISOString() ?? null;
  if (override?.publishedAt) {
    return {
      mode: "published",
      isPublic: Date.parse(override.publishedAt) <= now.getTime(),
      publicAt: override.publishedAt,
      scheduledAt: scheduled,
    };
  }
  if (override?.held) {
    return { mode: "held", isPublic: false, publicAt: null, scheduledAt: scheduled };
  }
  return {
    mode: "scheduled",
    isPublic: scheduledAt !== null && scheduledAt.getTime() <= now.getTime(),
    publicAt: scheduled,
    scheduledAt: scheduled,
  };
}

/**
 * Whether a listener may still cast or change a ballot for `week`.
 *
 * Only the week being ranked right now — a past week's ranking is settled — and
 * only until it is public.
 */
export function listenerVotingOpen(
  week: number,
  currentWeek: number,
  status: PublicationStatus,
): boolean {
  return week === currentWeek && !status.isPublic;
}

// ---------------------------------------------------------------------------
// Consolidation (pure)
// ---------------------------------------------------------------------------

/**
 * One team's line in the community ranking.
 *
 * Deliberately has no `votes` array, no names and no notes — see the module
 * header. `community-rankings.test.ts` pins the exact key set, so adding a
 * per-voter field is a test failure rather than a quiet leak.
 */
export interface CommunityRow {
  /** Consolidated position, 1 = best. */
  rank: number;
  teamName: string;
  /** Average position across every ballot that ranked this team. */
  meanRank: number;
  bestRank: number;
  worstRank: number;
  /** How many ballots put this team first. */
  firstPlaceVotes: number;
  /** The hosts' average on their own, or null with no host ballot. */
  hostMeanRank: number | null;
  /** The listeners' average on their own, or null with no listener ballot. */
  listenerMeanRank: number | null;
  /** Last published week's community position, or null. */
  previousRank: number | null;
  /** `previousRank - rank`: positive climbed, negative fell, null = no prior week. */
  movement: number | null;
}

/** Mean of a list, or null when it is empty. */
function meanOrNull(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Fold every ballot — any kind — into the community order.
 *
 * @param ballots Callers pass submitted ballots only, as for `consolidate`.
 * @param previousOrder Last week's community order, best first; pass it only
 *        when last week is public, or the movement arrows would give away a
 *        held week's order.
 */
export function communityRows(
  ballots: readonly Ballot[],
  teams: readonly string[],
  previousOrder: readonly string[] = [],
): CommunityRow[] {
  const kindOf = new Map(ballots.map((b) => [b.userId, b.voterKind] as const));
  return consolidate(ballots, teams, previousOrder).map((row) => {
    const ranksBy = (kind: "host" | "listener") =>
      row.votes.filter((v) => kindOf.get(v.userId) === kind).map((v) => v.rank);
    return {
      rank: row.rank,
      teamName: row.teamName,
      meanRank: row.meanRank,
      bestRank: row.bestRank,
      worstRank: row.worstRank,
      firstPlaceVotes: row.votes.filter((v) => v.rank === 1).length,
      hostMeanRank: meanOrNull(ranksBy("host")),
      listenerMeanRank: meanOrNull(ranksBy("listener")),
      previousRank: row.previousRank,
      movement: row.movement,
    };
  });
}

// ---------------------------------------------------------------------------
// Reads / writes
// ---------------------------------------------------------------------------

/**
 * Visibility for every week in `weeks` of one season, from one query.
 * React-cached: the public page, the vote page and the hub all ask.
 */
export const fetchPublicationStatuses = cache(
  async (
    season: number,
    weeks: readonly number[],
    now: Date = new Date(),
  ): Promise<Record<number, PublicationStatus>> => {
    const [{ data }, anchor] = await Promise.all([
      getSupabaseAdmin()
        .from("power_ranking_publications")
        .select("week, published_at, held")
        .eq("league_id", LEAGUE_ID)
        .eq("season", season), // pagination-safe: at most one row per NFL week
      getSeasonAnchor(season),
    ]);
    const overrides = new Map(
      (data ?? []).map((r) => [r.week, { publishedAt: r.published_at, held: r.held }] as const),
    );
    const out: Record<number, PublicationStatus> = {};
    for (const week of weeks) {
      out[week] = publicationStatus(
        overrides.get(week) ?? null,
        anchor ? scheduledPublishAt(anchor, week) : null,
        now,
      );
    }
    return out;
  },
);

export async function fetchPublicationStatus(
  season: number,
  week: number,
): Promise<PublicationStatus> {
  const statuses = await fetchPublicationStatuses(season, [week]);
  return statuses[week];
}

export type PublicationAction = "publish" | "hold" | "schedule";

/** Apply a host's publish / hold / back-to-schedule decision for one week. */
export async function setPublication(
  season: number,
  week: number,
  action: PublicationAction,
  userId: string,
): Promise<void> {
  const db = getSupabaseAdmin();
  if (action === "schedule") {
    const { error } = await db
      .from("power_ranking_publications")
      .delete()
      .eq("league_id", LEAGUE_ID)
      .eq("season", season)
      .eq("week", week);
    if (error) throw new Error(error.message);
    return;
  }
  const now = new Date().toISOString();
  const { error } = await db.from("power_ranking_publications").upsert(
    {
      league_id: LEAGUE_ID,
      season,
      week,
      published_at: action === "publish" ? now : null,
      held: action === "hold",
      updated_by: userId,
      updated_at: now,
    },
    { onConflict: "league_id,season,week" },
  );
  if (error) throw new Error(error.message);
}

/** How many listener ballots a week has, without reading whose they are. */
export async function countListenerBallots(
  season: number,
  week: number,
): Promise<{ submitted: number; drafts: number }> {
  const db = getSupabaseAdmin();
  const base = () =>
    db
      .from("power_ranking_ballots")
      .select("id", { count: "exact", head: true })
      .eq("league_id", LEAGUE_ID)
      .eq("season", season)
      .eq("week", week)
      .eq("voter_kind", "listener");
  const [submitted, drafts] = await Promise.all([
    base().not("submitted_at", "is", null),
    base().is("submitted_at", null),
  ]);
  return { submitted: submitted.count ?? 0, drafts: drafts.count ?? 0 };
}

export interface CommunityRankings {
  season: number;
  week: number;
  rows: CommunityRow[];
  hostBallots: number;
  listenerBallots: number;
  /** Teams on the roster list that no submitted ballot ranked. */
  unranked: string[];
}

/**
 * The community ranking for one week. Does **not** check publication — the
 * page decides who may see an unpublished week (hosts, as a preview).
 */
export const fetchCommunityRankings = cache(
  async (season: number, week: number, teams: readonly string[]): Promise<CommunityRankings> => {
    const priorWeek = week - 1;
    const [current, prior, priorStatus] = await Promise.all([
      fetchBallots(season, week, "everyone"),
      priorWeek >= 1 ? fetchBallots(season, priorWeek, "everyone") : Promise.resolve([]),
      priorWeek >= 1 ? fetchPublicationStatus(season, priorWeek) : Promise.resolve(null),
    ]);

    const submitted = submittedOnly(current);
    const previousOrder = priorStatus?.isPublic
      ? consolidate(submittedOnly(prior), teams).map((r) => r.teamName)
      : [];
    const rows = communityRows(submitted, teams, previousOrder);
    const ranked = new Set(rows.map((r) => r.teamName));

    return {
      season,
      week,
      rows,
      hostBallots: submitted.filter((b) => b.voterKind === "host").length,
      listenerBallots: submitted.filter((b) => b.voterKind === "listener").length,
      unranked: teams.filter((t) => !ranked.has(t)),
    };
  },
);
