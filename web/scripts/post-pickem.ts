/**
 * Pick'em posts to the league Discord.
 *
 *   npx tsx scripts/post-pickem.ts --results [--week N] [--dry-run]
 *   npx tsx scripts/post-pickem.ts --reminder [--dry-run]
 *
 * `--results` names the winner of the latest week whose league games are all
 * final, the top of that week's board, and the season leader, and points at
 * the next week's picks. It runs daily (`.github/workflows/post-pickem.yml`)
 * and posts each week once, the first run after the week goes final — the
 * `discord_posts` log makes every later run a no-op. A week nobody picked
 * posts nothing.
 *
 * `--reminder` nudges the league before the current week locks, with the lock
 * time and how many players are in (a count — never who, or what they
 * picked). Thursday morning, before both the 20:00 ET lock and the noon
 * Thanksgiving one.
 *
 * Both stay quiet outside the season: they only post for the schedule of the
 * season the NFL week resolver says is being played.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SECRET_KEY (picks are server-only), plus DISCORD_TOKEN and
 * DISCORD_CHANNEL_ID unless `--dry-run`. SITE_URL sets the links' origin.
 */

import { parseArgs } from "node:util";
import { siteUrlFromEnv } from "../lib/discord";
import {
  addDays,
  buildPickemReminderMessage,
  buildPickemResultsMessage,
  latestFinishedWeek,
  postIdString,
  seasonLeaderboard,
  weekEndsOn,
  type FeedPostId,
} from "../lib/discord-feed";
import { fetchPostedIds, sendFeedPost } from "../lib/discord-feed-data";
import { getLeagueStatus } from "../lib/matchups";
import { getDisplayWeeks, todayInLeagueTz } from "../lib/nfl-week";
import { fetchBoard, fetchPickemWeek } from "../lib/pickem";

/** Days after a week's window closes that its results are still news. */
const RESULTS_MAX_AGE_DAYS = 3;

/** A dry run honours the log too, so it shows what a real run would post. */
async function alreadyPosted(id: FeedPostId): Promise<boolean> {
  return (await fetchPostedIds([id])).has(postIdString(id));
}

async function results(requestedWeek: number | undefined, dryRun: boolean): Promise<number> {
  const [league, display] = await Promise.all([getLeagueStatus(), getDisplayWeeks()]);
  if (display.season === null) {
    console.error("Could not read the league calendar — check the Supabase secrets.");
    return 1;
  }
  if (!league || league.season !== display.season) {
    console.log("No league schedule for the season being played — nothing to post.");
    return 0;
  }
  const season = league.season;
  const finished = latestFinishedWeek(league.matchups, season);
  const week = requestedWeek ?? finished;
  if (week === null) {
    console.log(`No ${season} week is final yet.`);
    return 0;
  }
  if (finished === null || week > finished) {
    console.error(`Week ${week} is not final yet.`);
    return 1;
  }

  // Without --week, only a week that just ended: a first run (or one after an
  // outage) announces this week's winner, not a winner from a month ago.
  const endsOn = weekEndsOn(league.matchups, season, week);
  if (requestedWeek === undefined && endsOn && endsOn < addDays(todayInLeagueTz(), -RESULTS_MAX_AGE_DAYS)) {
    console.log(`Week ${week} ended ${endsOn}, too long ago to announce — pass --week to post it anyway.`);
    return 0;
  }

  const id: FeedPostId = { type: "pickem_results", key: `${season}-w${week}` };
  if (await alreadyPosted(id)) {
    console.log(`Week ${week} results were already posted.`);
    return 0;
  }

  const gamesOf = (w: number) => league.matchups.filter((m) => m.week === w);
  const pastWeeks = league.weeks.filter((w) => w <= week);
  const boards = await Promise.all(
    pastWeeks.map((w) => fetchBoard(season, w, gamesOf(w), true, null)),
  );
  const board = boards[pastWeeks.indexOf(week)];

  const current = await fetchPickemWeek();
  const next = current && current.open && current.week > week && current.locksAt
    ? { week: current.week, locksAt: current.locksAt }
    : null;

  const message = buildPickemResultsMessage({
    season,
    week,
    board,
    games: gamesOf(week).length,
    leaders: seasonLeaderboard(boards),
    next,
    siteUrl: siteUrlFromEnv(),
  });
  if (!message) {
    console.log(`Nobody picked week ${week} — nothing to post.`);
    return 0;
  }
  console.log(`${postIdString(id)}: ${await sendFeedPost(id, message, { dryRun })}`);
  return 0;
}

async function reminder(dryRun: boolean): Promise<number> {
  const display = await getDisplayWeeks();
  if (display.season === null) {
    console.error("Could not read the league calendar — check the Supabase secrets.");
    return 1;
  }
  const pw = await fetchPickemWeek();
  if (!pw || pw.currentWeek === null || pw.week !== pw.currentWeek || !pw.open || !pw.locksAt) {
    console.log("No pick'em week open right now — nothing to remind about.");
    return 0;
  }

  const id: FeedPostId = { type: "pickem_reminder", key: `${pw.season}-w${pw.week}` };
  if (await alreadyPosted(id)) {
    console.log(`Week ${pw.week} reminder was already posted.`);
    return 0;
  }
  // Unrevealed: the board read returns a player count and nothing else.
  const board = await fetchBoard(pw.season, pw.week, pw.games, false, null);
  const message = buildPickemReminderMessage({
    week: pw.week,
    locksAt: pw.locksAt,
    players: board.players,
    games: pw.games.length,
    siteUrl: siteUrlFromEnv(),
  });
  console.log(`${postIdString(id)}: ${await sendFeedPost(id, message, { dryRun })}`);
  return 0;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      results: { type: "boolean", default: false },
      reminder: { type: "boolean", default: false },
      week: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const dryRun = values["dry-run"] ?? false;
  if (values.results === values.reminder) {
    console.error("Pass exactly one of --results or --reminder.");
    return 1;
  }
  if (values.reminder) return reminder(dryRun);
  const week = values.week ? Number.parseInt(values.week, 10) : undefined;
  if (week !== undefined && !Number.isFinite(week)) {
    console.error("--week must be a number.");
    return 1;
  }
  return results(week, dryRun);
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
