/**
 * The league Discord feed — pure logic only. Reads and the send live in
 * `./discord-feed-data`; the jobs are `web/scripts/post-trades.ts`,
 * `post-moves-digest.ts` and `post-pickem.ts`. See docs/references/discord-feed.md.
 *
 * The league talks in Discord, not on the site, so the feed takes the site's
 * news to where the conversation already is:
 *
 * - **Trades** — a heads-up while a trade sits in Ottoneu's 48-hour veto
 *   window, then the trade itself once it processes: both sides' players,
 *   salaries and cap loans, and an in-season value read per side.
 * - **Daily moves digest** — yesterday's adds and cuts, grouped by team.
 * - **Pick'em** — the week's winner and the season leader once the week's
 *   games are final, and a reminder before picks lock.
 *
 * ## The in-season value read is earned value, not the projection
 *
 * The preseason projection model is withheld once games start (#748), so a
 * trade is read on what its players have *done*: this season's earned value
 * (`./earned-value`) over the stat window, scaled to a full season ("pace").
 * Pace is in the same units as salary, so "$52 of pace for a $40 salary"
 * reads directly. In the offseason the window is last season's, and the label
 * says so.
 *
 * ## Never twice
 *
 * Each post has a (type, key) — the trade id, the day, the pick'em week — and
 * the `discord_posts` table records every one sent. Everything here that picks
 * what to post takes the set of already-posted keys and leaves those out.
 */

import {
  discordLink,
  discordTimestamp,
  EMBED_COLOR,
  fitLines,
  type DiscordMessage,
} from "./discord";
import type { EarnedValue } from "./earned-value";
import type { Board } from "./pickem";
import type { RecapMove, WeekMoves } from "./recap-moves";
import type { Matchup } from "./standings";
import type { StatWindow } from "./stat-window";
import type { LeagueTrade, TradeAsset } from "./trades";
import type { Player } from "./types";

export type FeedPostType =
  | "trade_pending"
  | "trade_processed"
  | "moves_digest"
  | "pickem_results"
  | "pickem_reminder";

/** `discord_posts` identity of one post. */
export interface FeedPostId {
  type: FeedPostType;
  key: string;
}

/** The string a set of already-posted ids is keyed on. */
export function postIdString(id: FeedPostId): string {
  return `${id.type}:${id.key}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const dollars = (n: number) => `$${Math.round(n)}`;
const signedDollars = (n: number) => {
  const r = Math.round(n);
  return r > 0 ? `+$${r}` : r < 0 ? `−$${Math.abs(r)}` : "even";
};

/** `YYYY-MM-DD` shifted by whole days. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Thu, Oct 16" for a `YYYY-MM-DD`. */
export function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * "Oct 16, 6:32 AM" for an Ottoneu site-clock `YYYY-MM-DDTHH:MM[:SS]`.
 *
 * Printed as text, not a Discord timestamp: the site clock carries no zone
 * (migration 049), and a `<t:…>` tag would claim one.
 */
export function formatSiteClock(at: string): string {
  const [date, time = "00:00"] = at.split("T");
  const [, month, day] = date.split("-").map(Number);
  const [h, m] = time.split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${MONTHS[month - 1]} ${day}, ${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

/** What one player has done this season, for the value read. */
export interface PlayerProduction {
  /** From `players`, for trade rows scraped without one. */
  position: string;
  games: number;
  ppg: number;
  /** Earned value over the window; null when unpriced (kicker, college, no pool). */
  earnedValue: number | null;
  /** `earnedValue` scaled to a full season — comparable to salary. */
  pace: number | null;
}

export interface ProductionBook {
  window: StatWindow;
  /** By `players.id`. */
  byPlayer: Map<string, PlayerProduction>;
}

/**
 * Index the season's production and earned value by player.
 *
 * @param players the season's player pool (what `fetchPlayerSetEndOfSeason` returns)
 * @param earned  `calculateEarnedValue(players, window)` over that same pool
 */
export function productionBook(
  players: readonly Player[],
  earned: readonly (Player & EarnedValue)[],
  window: StatWindow,
): ProductionBook {
  const earnedById = new Map(earned.map((p) => [p.player_id, p.earned_value]));
  const byPlayer = new Map<string, PlayerProduction>();
  for (const p of players) {
    const value = earnedById.get(p.player_id) ?? null;
    byPlayer.set(p.player_id, {
      position: p.position,
      games: p.games_played,
      ppg: p.ppg,
      earnedValue: value,
      pace: value !== null && window.fraction > 0 ? value / window.fraction : null,
    });
  }
  return { window, byPlayer };
}

/** Trades the feed has not posted yet, each with the post it is due. */
export function tradesToPost(
  trades: readonly LeagueTrade[],
  posted: ReadonlySet<string>,
  today: string,
  maxAgeDays: number,
): { id: FeedPostId; trade: LeagueTrade }[] {
  // The age limit keeps a first run (or a long outage) from flooding the
  // channel with the whole back catalogue: only news is news.
  const cutoff = addDays(today, -maxAgeDays);
  const due: { id: FeedPostId; trade: LeagueTrade }[] = [];
  for (const trade of trades) {
    if (trade.source !== "trade_history" || trade.ottoneuTradeId === null) continue;
    const key = String(trade.ottoneuTradeId);
    let id: FeedPostId | null = null;
    if (trade.status === "pending" && trade.acceptedAt && trade.acceptedAt.slice(0, 10) >= cutoff) {
      id = { type: "trade_pending", key };
    } else if (
      trade.status === "processed" &&
      trade.processedAt &&
      trade.processedAt.slice(0, 10) >= cutoff
    ) {
      id = { type: "trade_processed", key };
    }
    if (id && !posted.has(postIdString(id))) due.push({ id, trade });
  }
  // Oldest first, so the channel reads in the order things happened.
  return due.sort(
    (a, b) =>
      (a.trade.processedAt ?? a.trade.acceptedAt ?? "").localeCompare(
        b.trade.processedAt ?? b.trade.acceptedAt ?? "",
      ) || a.id.key.localeCompare(b.id.key),
  );
}

function playerLine(asset: TradeAsset, book: ProductionBook): string {
  const prod = asset.playerId ? book.byPlayer.get(asset.playerId) : undefined;
  const position = asset.position || prod?.position || "?";
  const head = `• **${asset.name}** (${position}, ${dollars(asset.amount)})`;
  if (asset.isCollege) return `${head} — college prospect`;
  if (!prod || prod.games === 0) return `${head} — no games yet`;
  const pace = prod.pace !== null ? ` · ${dollars(prod.pace)} pace` : "";
  return `${head} — ${prod.ppg.toFixed(1)} PPG in ${plural(prod.games, "game")}${pace}`;
}

/** Full-season pace of what a team receives minus what it gives up. */
export function sideValueRead(
  trade: LeagueTrade,
  team: string,
  book: ProductionBook,
): { paceIn: number; paceOut: number; net: number; salaryIn: number; salaryOut: number } {
  const players = trade.assets.filter((a) => a.kind === "player");
  // An unpriced player (no games, a kicker, a prospect) adds nothing to the
  // read: the read is about production so far, and he has none to count.
  const pace = (a: TradeAsset) => (a.playerId ? book.byPlayer.get(a.playerId)?.pace ?? 0 : 0);
  const got = players.filter((a) => a.toTeam === team);
  const gave = players.filter((a) => a.fromTeam === team);
  const paceIn = got.reduce((s, a) => s + pace(a), 0);
  const paceOut = gave.reduce((s, a) => s + pace(a), 0);
  return {
    paceIn,
    paceOut,
    net: paceIn - paceOut,
    salaryIn: got.reduce((s, a) => s + a.amount, 0),
    salaryOut: gave.reduce((s, a) => s + a.amount, 0),
  };
}

/** The post for one trade, pending or processed. */
export function buildTradeMessage(
  trade: LeagueTrade,
  book: ProductionBook,
  siteUrl: string,
): DiscordMessage {
  const pending = trade.status === "pending";
  const campaign = pending ? "trade_pending" : "trade_processed";
  const url = discordLink(siteUrl, "/trades", campaign);
  const [a, b] = trade.teams;

  const lines: string[] = [];
  if (pending) {
    const when = trade.processedAt ? ` on ${formatSiteClock(trade.processedAt)} (Ottoneu time)` : "";
    lines.push(`Awaiting league approval — processes${when} unless the league vetoes it.`, "");
  }
  for (const team of trade.teams) {
    lines.push(`**${team} gets**`);
    const got = trade.assets.filter((x) => x.toTeam === team);
    if (got.length === 0) lines.push("• nothing on record");
    for (const asset of got) {
      lines.push(
        asset.kind === "loan"
          ? `• ${dollars(asset.amount)} cap loan (expires after the regular season)`
          : playerLine(asset, book),
      );
    }
    lines.push("");
  }

  const hasGames = book.window.fraction > 0;
  if (hasGames) {
    lines.push(`**Value read** · ${book.window.label}`);
    for (const team of trade.teams) {
      const read = sideValueRead(trade, team, book);
      lines.push(
        `${team}: **${signedDollars(read.net)}** — ${dollars(read.paceIn)} of pace in for ` +
          `${dollars(read.salaryIn)} salary, ${dollars(read.paceOut)} out for ${dollars(read.salaryOut)}`,
      );
    }
  } else {
    lines.push("No games played yet this season, so no value read.");
  }
  lines.push("", `[Every trade on SOFA DB →](${url})`);

  return {
    embeds: [
      {
        title: `${pending ? "⏳ Pending trade" : "🤝 Trade"}: ${a} ⇄ ${b}`,
        url,
        description: fitLines(lines),
        color: EMBED_COLOR,
        footer: {
          text: "Pace = earned value so far, scaled to a full season (same units as salary). Production only — no projections.",
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Daily moves digest
// ---------------------------------------------------------------------------

/**
 * The day's adds and cuts as one post, grouped by team. Only scraped rows —
 * an inferred row's date is a reconciliation run, not the move (see
 * `./mcp/transactions`). Null on a day with no moves.
 */
export function buildMovesDigestMessage(
  day: string,
  moves: Pick<WeekMoves, "adds" | "cuts">,
  siteUrl: string,
): DiscordMessage | null {
  const scraped = (list: readonly RecapMove[]) => list.filter((m) => !m.approximate && m.date === day);
  const adds = scraped(moves.adds);
  const cuts = scraped(moves.cuts);
  if (adds.length === 0 && cuts.length === 0) return null;

  const teams = [...new Set([...adds, ...cuts].map((m) => m.teamName))].sort((x, y) =>
    x.localeCompare(y),
  );
  const line = (sign: string, m: RecapMove) =>
    `${sign} ${m.name} (${m.position ?? "?"}) ${m.salary === null ? "" : dollars(m.salary)}`.trimEnd();
  const lines: string[] = [];
  for (const team of teams) {
    if (lines.length > 0) lines.push("");
    lines.push(`**${team}**`);
    // Biggest salary first within each list — `weekMoves` already sorts them.
    for (const m of adds.filter((x) => x.teamName === team)) lines.push(line("➕", m));
    for (const m of cuts.filter((x) => x.teamName === team)) lines.push(line("➖", m));
  }

  const url = discordLink(siteUrl, "/rosters", "moves_digest");
  return {
    embeds: [
      {
        title: `📋 Moves — ${formatDay(day)}`,
        url,
        description: fitLines(lines, undefined, `[Rosters on SOFA DB →](${url})`),
        color: EMBED_COLOR,
        footer: { text: `${plural(adds.length, "add")} · ${plural(cuts.length, "cut")} · salaries as added/cut` },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Pick'em
// ---------------------------------------------------------------------------

/**
 * The latest week of `season` whose games are all final — the one a results
 * post is due for. Null before any week has finished.
 */
export function latestFinishedWeek(matchups: readonly Matchup[], season: number): number | null {
  const byWeek = new Map<number, Matchup[]>();
  for (const m of matchups) {
    if (m.season !== season) continue;
    byWeek.set(m.week, [...(byWeek.get(m.week) ?? []), m]);
  }
  const finished = [...byWeek.entries()]
    .filter(([, games]) => games.length > 0 && games.every((g) => g.status === "final"))
    .map(([week]) => week);
  return finished.length === 0 ? null : Math.max(...finished);
}

/** The last day of a week's fantasy window (`ends_on`), or null if not stored. */
export function weekEndsOn(matchups: readonly Matchup[], season: number, week: number): string | null {
  const ends = matchups
    .filter((m) => m.season === season && m.week === week && m.ends_on)
    .map((m) => m.ends_on as string)
    .sort();
  return ends.length === 0 ? null : ends[ends.length - 1];
}

export interface SeasonLeaderRow {
  /** Shared when level on points: 1, 2, 2, 4 — the same rule as a week. */
  rank: number;
  displayName: string;
  correct: number;
  /** Weeks this player picked in. */
  weeks: number;
}

/** Sum revealed weekly boards into the season table. */
export function seasonLeaderboard(boards: readonly Board[]): SeasonLeaderRow[] {
  const totals = new Map<string, { correct: number; weeks: number }>();
  for (const board of boards) {
    if (!board.revealed) continue;
    for (const row of board.rows) {
      const t = totals.get(row.displayName) ?? { correct: 0, weeks: 0 };
      t.correct += row.correct;
      t.weeks += 1;
      totals.set(row.displayName, t);
    }
  }
  const sorted = [...totals.entries()]
    .map(([displayName, t]) => ({ displayName, ...t }))
    .sort((a, b) => b.correct - a.correct || a.displayName.localeCompare(b.displayName));
  const out: SeasonLeaderRow[] = [];
  sorted.forEach((row, i) => {
    const rank = i > 0 && row.correct === sorted[i - 1].correct ? out[i - 1].rank : i + 1;
    out.push({ rank, ...row });
  });
  return out;
}

/** "**A**", "**A** and **B**", "**A**, **B** and **C**". */
function names(list: readonly string[]): string {
  const bold = list.map((n) => `**${n}**`);
  return bold.length <= 1 ? (bold[0] ?? "") : `${bold.slice(0, -1).join(", ")} and ${bold[bold.length - 1]}`;
}

/** How many of a week's board rows the results post lists. */
const RESULTS_BOARD_ROWS = 5;

/**
 * The results post for a finished week. Null when nobody picked — there is no
 * winner to name, and a "nobody played" post is noise.
 */
export function buildPickemResultsMessage(input: {
  season: number;
  week: number;
  board: Board;
  games: number;
  leaders: readonly SeasonLeaderRow[];
  /** The next week, when it is open for picks. */
  next: { week: number; locksAt: string } | null;
  siteUrl: string;
}): DiscordMessage | null {
  const { week, board, games, leaders, next, siteUrl } = input;
  if (!board.revealed || board.rows.length === 0) return null;

  const winners = board.rows.filter((r) => r.rank === 1);
  const top = winners[0].correct;
  const lines = [
    winners.length === 1
      ? `🏆 ${names([winners[0].displayName])} wins Week ${week} with ${top} of ${games}.`
      : `🏆 ${names(winners.map((w) => w.displayName))} tie for Week ${week} with ${top} of ${games}.`,
    "",
    ...board.rows
      .slice(0, RESULTS_BOARD_ROWS)
      .map((r) => `**${r.rank}.** ${r.displayName} — ${r.correct}`),
  ];
  if (board.rows.length > RESULTS_BOARD_ROWS) {
    lines.push(`…and ${board.rows.length - RESULTS_BOARD_ROWS} more`);
  }

  const leaderRows = leaders.filter((r) => r.rank === 1);
  if (leaderRows.length > 0) {
    const verb = leaderRows.length === 1 ? "leads the season" : "share the season lead";
    lines.push("", `📈 ${names(leaderRows.map((r) => r.displayName))} ${verb} with ${leaderRows[0].correct} correct.`);
  }

  const url = discordLink(siteUrl, next ? `/pickem?week=${next.week}` : `/pickem?week=${week}`, "pickem_results");
  if (next) {
    const lock = discordTimestamp(next.locksAt, "F");
    lines.push("", `Week ${next.week} picks are open${lock ? ` until ${lock}` : ""}. [Make your picks →](${url})`);
  } else {
    lines.push("", `[Full board →](${url})`);
  }

  return {
    embeds: [
      {
        title: `🎯 Week ${week} Pick'em results`,
        url,
        description: fitLines(lines),
        color: EMBED_COLOR,
        footer: { text: `${plural(board.players, "player")} picked Week ${week}` },
      },
    ],
  };
}

/** The mid-week nudge to pick, before the week locks. */
export function buildPickemReminderMessage(input: {
  week: number;
  locksAt: string;
  /** Players with at least one pick in — a count only, never who. */
  players: number;
  games: number;
  siteUrl: string;
}): DiscordMessage {
  const { week, locksAt, players, games, siteUrl } = input;
  const url = discordLink(siteUrl, `/pickem?week=${week}`, "pickem_reminder");
  const full = discordTimestamp(locksAt, "F");
  const rel = discordTimestamp(locksAt, "R");
  const so = players === 0 ? "Nobody has picked yet." : `${plural(players, "player")} in so far.`;
  return {
    embeds: [
      {
        title: `🎯 Week ${week} Pick'em — get your picks in`,
        url,
        description: [
          `Pick the winner of all ${plural(games, "league game")}.${full ? ` Picks lock ${full} (${rel}).` : ""}`,
          so,
          "",
          `[Make your picks →](${url})`,
        ].join("\n"),
        color: EMBED_COLOR,
        footer: { text: "Nobody sees anyone's picks until the lock" },
      },
    ],
  };
}
