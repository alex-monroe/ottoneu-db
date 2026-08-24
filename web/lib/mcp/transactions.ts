/**
 * Pure shaping for the MCP transaction feed.
 *
 * The `transactions` table stores less than it knows, and the MCP tool used to
 * pass that loss straight through to callers. Three things are recovered here
 * rather than read from columns:
 *
 * 1. **The real instant.** `transaction_date` is a DATE, so every move on a busy
 *    day (an auction, a waiver batch, a reconciliation run) ties. Ordering by it
 *    and taking the first N returned an arbitrary — and between calls, unstable —
 *    slice. Ottoneu's player card prints "Aug 22, 2026 9:26 PM" and the scraper
 *    keeps that text verbatim in `raw_description`, so the clock time is
 *    recoverable for every scraped row.
 * 2. **The source team of a trade.** The `from_team` column is null on every row
 *    in the table; by the scraper's convention the origin is encoded in the type
 *    string as `move (from <team>)`.
 * 3. **How the row was obtained.** Rows inferred by diffing `league_prices`
 *    against the roster CSV are dated the *reconciliation run*, not the move, and
 *    arrive in one bulk batch. Read as league activity they look like a day of
 *    frantic trading. They say so in `raw_description`.
 *
 * (3) also lets us drop an inferred row that merely restates a move the
 * player-card scraper already recorded with its true timestamp — see
 * `dedupeInferred`.
 */

/** A `transactions` row as selected by the MCP tool. */
export interface RawTransactionRow {
  transaction_date: string | null;
  transaction_type: string;
  team_name: string | null;
  from_team: string | null;
  salary: number | null;
  season: number | null;
  raw_description: string | null;
  players:
    | { name: string; position: string | null }
    | { name: string; position: string | null }[]
    | null;
}

export type TransactionSource = "scraped" | "inferred";

export interface ShapedTransaction {
  /** Ottoneu site wall-clock, `YYYY-MM-DDTHH:MM`, or null if only the date is known. */
  occurred_at_local: string | null;
  date: string | null;
  type: string;
  player: string | null;
  position: string | null;
  team: string | null;
  from_team: string | null;
  salary: number | null;
  season: number | null;
  source: TransactionSource;
}

export interface FeedQuality {
  distinct_dates: number;
  inferred_count: number;
  /** True when the page is one bulk batch rather than a spread of real activity. */
  is_bulk_load: boolean;
  note: string;
}

/** Marker the roster-CSV reconciliation writes into `raw_description`. */
const INFERRED_MARKER = "inferred from /csv/rosters reconciliation";

/** Leading "Aug 22, 2026 9:26 PM" on a scraped card row. */
const CARD_CLOCK =
  /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2})\s*(AM|PM)/;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** `move (from The Witchcraft)` -> the origin team. */
const MOVE_FROM = /^move\s*\(from\s+(.+?)\)\s*$/i;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Recover the wall-clock instant a scraped move happened.
 *
 * Returns a local (unzoned) `YYYY-MM-DDTHH:MM` string, deliberately *not* a UTC
 * instant: the card prints Ottoneu's site clock with no zone, and inventing one
 * would claim a precision we do not have. It orders the feed exactly, which is
 * what it is for. Returns null for rows carrying only a date.
 */
export function parseCardClock(rawDescription: string | null): string | null {
  const m = CARD_CLOCK.exec((rawDescription ?? "").trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  if (month < 0) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  let hour = Number(m[4]) % 12;
  if (m[6].toUpperCase() === "PM") hour += 12;
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${m[5]}`;
}

export function classifySource(rawDescription: string | null): TransactionSource {
  return (rawDescription ?? "").includes(INFERRED_MARKER) ? "inferred" : "scraped";
}

/** Split the scraper's `move (from X)` convention into a plain type + origin team. */
export function splitMoveType(
  transactionType: string,
  storedFromTeam: string | null,
): { type: string; from_team: string | null } {
  const m = MOVE_FROM.exec(transactionType ?? "");
  if (m) return { type: "move", from_team: m[1].trim() };
  return { type: transactionType, from_team: storedFromTeam };
}

export function shapeTransaction(row: RawTransactionRow): ShapedTransaction {
  const player = Array.isArray(row.players) ? row.players[0] : row.players;
  const { type, from_team } = splitMoveType(row.transaction_type, row.from_team);
  return {
    occurred_at_local: parseCardClock(row.raw_description),
    date: row.transaction_date,
    type,
    player: player?.name ?? null,
    position: player?.position ?? null,
    team: row.team_name,
    from_team,
    salary: row.salary,
    season: row.season,
    source: classifySource(row.raw_description),
  };
}

/** Identity of a move, for matching an inference against the real thing. */
function moveKey(t: ShapedTransaction): string {
  return [t.player ?? "", t.type, t.salary ?? "", t.team ?? ""].join(" ");
}

const DAY_MS = 86_400_000;

function dayGap(a: string | null, b: string | null): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(da - db) / DAY_MS;
}

/**
 * Drop inferred rows that restate a scraped move.
 *
 * The roster-CSV reconciliation infers moves by diffing `league_prices`, which
 * the player-card scraper does not write. So when the scraper has already logged
 * a move — with its true timestamp — the next reconciliation still sees a stale
 * price row, re-derives the same move, and files it again under the run date.
 * Every one of the 86 rows the reconciliation wrote on 2026-08-23 duplicated a
 * card row from 2026-08-22 this way.
 *
 * `scripts/reconcile_roster.py` no longer creates these, but the ones already
 * written are what a caller reading history sees, so suppress them on read too.
 */
export function dedupeInferred(
  rows: ShapedTransaction[],
  windowDays = 14,
): ShapedTransaction[] {
  const scraped = new Map<string, string[]>();
  for (const t of rows) {
    if (t.source !== "scraped" || !t.date) continue;
    const key = moveKey(t);
    const dates = scraped.get(key) ?? [];
    dates.push(t.date);
    scraped.set(key, dates);
  }
  return rows.filter((t) => {
    if (t.source !== "inferred") return true;
    const dates = scraped.get(moveKey(t));
    if (!dates) return true;
    return !dates.some((d) => dayGap(d, t.date) <= windowDays);
  });
}

/** Newest first: by recovered clock time, then date, with date-only rows last. */
export function sortNewestFirst(rows: ShapedTransaction[]): ShapedTransaction[] {
  return [...rows].sort((a, b) => {
    const ad = a.date ?? "";
    const bd = b.date ?? "";
    if (ad !== bd) return bd.localeCompare(ad);
    // Same date: timestamped rows lead, in reverse clock order.
    if (a.occurred_at_local && b.occurred_at_local) {
      return b.occurred_at_local.localeCompare(a.occurred_at_local);
    }
    if (a.occurred_at_local) return -1;
    if (b.occurred_at_local) return 1;
    // Both date-only: stable, deterministic tiebreak so repeat calls agree.
    return moveKey(a).localeCompare(moveKey(b));
  });
}

/**
 * Describe what the caller is actually holding, so a digest built on this feed
 * can tell league activity from a bulk load and say so instead of inventing a
 * narrative about a busy trading day.
 */
export function assessFeed(rows: ShapedTransaction[]): FeedQuality {
  const dates = new Set(rows.map((t) => t.date ?? "unknown"));
  const inferred = rows.filter((t) => t.source === "inferred").length;
  // One date is the tell, but two or three same-day moves are ordinary league
  // activity. It only reads as a batch once there are more of them than a day
  // plausibly produces, or once none of them is a real dated move at all.
  const isBulk = rows.length > 1 && dates.size === 1 && (inferred === rows.length || rows.length > 5);
  const note = isBulk
    ? "All rows share one date, so this page is a bulk load (an auction, or a roster-CSV " +
      "reconciliation backfill), not a chronological record of league activity. Do not " +
      "describe it as a day of trading — report roster state from get_rosters instead, " +
      "and say that no dated transaction activity is available for the period."
    : "source='scraped' rows carry occurred_at_local (Ottoneu site clock) and are ordered by it. " +
      "source='inferred' rows were derived by diffing roster snapshots: their date is the " +
      "reconciliation run, not the move, so treat them as roster-state changes of unknown timing.";
  return {
    distinct_dates: dates.size,
    inferred_count: inferred,
    is_bulk_load: isBulk,
    note,
  };
}

/** Full read-side pipeline: shape -> dedupe -> sort -> slice, with a quality report. */
export function buildTransactionFeed(
  rows: RawTransactionRow[],
  limit: number,
): { transactions: ShapedTransaction[]; feed_quality: FeedQuality } {
  const shaped = sortNewestFirst(dedupeInferred(rows.map(shapeTransaction)));
  const page = shaped.slice(0, limit);
  return { transactions: page, feed_quality: assessFeed(page) };
}
