/**
 * The roster moves of one fantasy week — trades, adds and cuts — shaped for the
 * weekly recap.
 *
 * Like everything else on the recap, this is derived at read time: the rows are
 * the `transactions` event log the player-card scrape already writes. What is
 * added here is the shape the show talks in, which the table does not store:
 *
 * - **A trade is one event.** The log holds one `move (from <team>)` row per
 *   player, so a two-for-two trade is four rows. Rows that share a clock time
 *   and the same pair of teams are put back together as a single trade with two
 *   sides.
 * - **An add carries its price.** Ottoneu has no free pickups — every add is a
 *   won auction or a claim — so the salary is the bid, and the bid is the story.
 *   Adds and cuts are ordered biggest salary first for that reason.
 *
 * ## Which days count as "the week"
 *
 * The fantasy week's own window from `league_matchups` (`starts_on`..`ends_on`,
 * Wednesday to Tuesday). That is the same week the rest of the page is about:
 * the moves made to set that week's lineups, and the ones made in reaction to
 * its games before the next window opens.
 *
 * ## An inferred row is flagged, not hidden
 *
 * A row derived by the roster-CSV reconciliation is dated the *reconciliation
 * run*, not the move (see ./mcp/transactions). One that restates a scraped move
 * is dropped; one that stands alone is kept and marked `approximate`, so the
 * page can say the day is a guess instead of reading it out as a fact.
 */

import { supabase, fetchAllRows } from "./supabase";
import { LEAGUE_ID } from "./config";
import {
  dedupeInferred,
  shapeTransaction,
  type RawTransactionRow,
  type ShapedTransaction,
} from "./mcp/transactions";
import type { Matchup } from "./standings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One player changing rosters. */
export interface RecapMove {
  /** Null only if the join to `players` came back empty. */
  ottoneuId: number | null;
  name: string;
  position: string | null;
  nflTeam: string | null;
  /** The team that added, cut or received him. */
  teamName: string;
  /** The salary he was added at, cut at, or traded at. */
  salary: number | null;
  date: string;
  /** Ottoneu's site clock, `YYYY-MM-DDTHH:MM`, when the card printed one. */
  at: string | null;
  /** True for an inferred row: the date is the reconciliation run, not the move. */
  approximate: boolean;
}

export interface RecapTradeSide {
  teamName: string;
  /** The players this team received, biggest salary first. */
  received: RecapMove[];
}

export interface RecapTrade {
  key: string;
  date: string;
  at: string | null;
  approximate: boolean;
  /** Always two sides; one may have received nothing the log records. */
  sides: [RecapTradeSide, RecapTradeSide];
}

export interface WeekMoves {
  /** Inclusive window, `YYYY-MM-DD`. */
  from: string;
  to: string;
  /** Newest first. */
  trades: RecapTrade[];
  /** Biggest salary first. */
  adds: RecapMove[];
  /** Biggest salary first. */
  cuts: RecapMove[];
}

/** A `transactions` row with the player columns the recap links on. */
export interface MoveRow extends RawTransactionRow {
  players: {
    name: string;
    position: string | null;
    ottoneu_id: number;
    nfl_team: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

/**
 * The fantasy week's date window, from the games that make it up. Null when the
 * schedule scrape has not stored the dates — there is then no honest way to say
 * which moves belong to the week, so the section is left off.
 */
export function weekWindow(
  weekGames: readonly Matchup[],
): { from: string; to: string } | null {
  const starts = weekGames.map((m) => m.starts_on).filter((d): d is string => d != null);
  const ends = weekGames.map((m) => m.ends_on).filter((d): d is string => d != null);
  if (starts.length === 0 || ends.length === 0) return null;
  return { from: starts.sort()[0], to: ends.sort()[ends.length - 1] };
}

function bySalary(a: RecapMove, b: RecapMove): number {
  return (b.salary ?? 0) - (a.salary ?? 0) || a.name.localeCompare(b.name);
}

function toMove(row: MoveRow, shaped: ShapedTransaction): RecapMove {
  return {
    ottoneuId: row.players?.ottoneu_id ?? null,
    name: row.players?.name ?? "Unknown player",
    position: row.players?.position ?? null,
    nflTeam: row.players?.nfl_team ?? null,
    teamName: shaped.team ?? "",
    salary: shaped.salary,
    date: shaped.date as string,
    at: shaped.occurred_at_local,
    approximate: shaped.source === "inferred",
  };
}

/**
 * Put the per-player `move` rows back together into trades.
 *
 * Two rows are the same trade when they share a moment and the same two teams,
 * in either direction. The moment is the card's clock time when there is one —
 * Ottoneu stamps every player in a trade with the same minute — and the date
 * otherwise, so two separate trades between the same teams on one day stay
 * separate whenever the log can tell them apart.
 */
function groupTrades(
  moves: { move: RecapMove; fromTeam: string }[],
): RecapTrade[] {
  const groups = new Map<string, { move: RecapMove; fromTeam: string }[]>();
  for (const entry of moves) {
    const pair = [entry.move.teamName, entry.fromTeam].sort().join(" <> ");
    const key = `${entry.move.at ?? entry.move.date} ${pair}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return [...groups.entries()]
    .map(([key, entries]) => {
      const { move: first, fromTeam } = entries[0];
      const side = (teamName: string): RecapTradeSide => ({
        teamName,
        received: entries
          .map((e) => e.move)
          .filter((m) => m.teamName === teamName)
          .sort(bySalary),
      });
      const teams = [first.teamName, fromTeam].sort();
      return {
        key,
        date: first.date,
        at: first.at,
        approximate: entries.some((e) => e.move.approximate),
        sides: [side(teams[0]), side(teams[1])] as [RecapTradeSide, RecapTradeSide],
      };
    })
    .sort((a, b) => (b.at ?? b.date).localeCompare(a.at ?? a.date) || a.key.localeCompare(b.key));
}

/**
 * Shape one window's moves.
 *
 * `rows` may reach back further than `from`: an inferred row is matched against
 * scraped rows up to two weeks older than itself, so the caller reads a margin
 * and this trims it off again after the dedupe has seen it.
 *
 * Only adds, cuts and trades are moves. The log's other row types — offseason
 * arbitration `increase`s — are not something a team did that week.
 */
export function weekMoves(
  rows: readonly MoveRow[],
  from: string,
  to: string,
): WeekMoves {
  const byShaped = new Map(rows.map((row) => [shapeTransaction(row), row]));
  const kept = dedupeInferred([...byShaped.keys()]).filter(
    (t) => t.date != null && t.date >= from && t.date <= to && t.team,
  );

  const adds: RecapMove[] = [];
  const cuts: RecapMove[] = [];
  const traded: { move: RecapMove; fromTeam: string }[] = [];
  for (const shaped of kept) {
    const move = toMove(byShaped.get(shaped) as MoveRow, shaped);
    const type = shaped.type.toLowerCase();
    if (type === "add") adds.push(move);
    else if (type === "cut") cuts.push(move);
    else if (type === "move" && shaped.from_team) {
      traded.push({ move, fromTeam: shaped.from_team });
    }
  }

  return {
    from,
    to,
    trades: groupTrades(traded),
    adds: adds.sort(bySalary),
    cuts: cuts.sort(bySalary),
  };
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

/** How far before the window to read, so `dedupeInferred` can see its matches. */
const DEDUPE_MARGIN_DAYS = 14;

function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Read and shape the league's moves for one inclusive date window. */
export async function fetchWeekMoves(from: string, to: string): Promise<WeekMoves> {
  const rows = await fetchAllRows((pageFrom, pageTo) =>
    supabase
      .from("transactions")
      .select(
        "transaction_date, transaction_type, team_name, from_team, salary, season, raw_description, players(name, position, ottoneu_id, nfl_team)",
      )
      .eq("league_id", LEAGUE_ID)
      .gte("transaction_date", daysBefore(from, DEDUPE_MARGIN_DAYS))
      .lte("transaction_date", to)
      .order("id").range(pageFrom, pageTo),
  );
  return weekMoves(rows as unknown as MoveRow[], from, to);
}
