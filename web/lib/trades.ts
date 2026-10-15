/**
 * The league's trades, put back together and judged — pure logic only. The
 * reads live in `./trades-data`.
 *
 * ## Two sources, one log
 *
 * - **`trades` + `trade_assets`** (scripts/scrape_trade_history.py) — Ottoneu's
 *   own trade history: both sides, **cap loans**, pending trades and who offered.
 *   It only reaches back to September 2025.
 * - **`transactions` `move` rows** (the player-card scrape) — one row per player
 *   moved, stamped with the minute Ottoneu *processed* the trade. It reaches
 *   back further, but a player card never mentions a loan.
 *
 * {@link mergeTrades} keeps every trade-history trade and adds a card-rebuilt
 * trade only when no trade-history trade explains it. A card-rebuilt trade is
 * `loansKnown: false` — "no loan" there means "we cannot see one", so the loan
 * statistics count only trades whose loans are known.
 *
 * ## How a trade is valued
 *
 * Every player is priced by the same full-reset market as `/value`
 * (`calculateSurplus`): a season's projected PPG → VORP → a share of the
 * league's distributable cap. A trade is then read three ways, per side:
 *
 * - **This season** — dollar value received minus given, prorated by how much of
 *   the fantasy regular season was left when the trade processed. Players who
 *   are worth $60 in September are worth a fraction of that on the deadline.
 * - **Keeper value** — next season's projected value minus next season's salary
 *   (this salary plus the end-of-season raise), floored at zero: a contract
 *   worth less than its price is simply cut in the offseason, at no penalty
 *   (see docs/references/ottoneu-rules.md), so it is worth nothing, not a loss.
 * - **Cap** — what the trade does to this season's cap room: salary out minus
 *   salary in, minus a loan made, plus a loan received. Loans expire at the end
 *   of the regular season, so they move this season's cap and nothing after.
 *
 * Projections are the model's *preseason* number for that season, so a trade
 * made in November is judged on what the model believed in August. That is a
 * deliberate, leakage-free choice: it never credits a trade with information
 * the season had not revealed yet — but it also cannot see an injury the
 * managers could.
 */

import {
  FULL_SEASON_GAMES,
  MIN_PLAYER_SALARY,
  SEASON_END_RAISE_OTHER,
  SEASON_END_RAISE_PLAYED,
} from "./config";
import { computeStandings, type Matchup, type StandingsRow } from "./standings";
import { calculateSurplus } from "./surplus";
import type { CorePlayer, Player } from "./types";
import {
  dedupeInferred,
  shapeTransaction,
  type RawTransactionRow,
} from "./mcp/transactions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TradeStatus = "pending" | "processed" | "removed";
export type TradeSource = "trade_history" | "player_cards";

export interface TradeAsset {
  kind: "player" | "loan";
  /** `players.id`, when the player is in our table. */
  playerId: string | null;
  ottoneuId: number | null;
  /** A college prospect — takes the smaller end-of-season raise. */
  isCollege: boolean;
  /** Player name, or "Loan" for a loan. */
  name: string;
  position: string | null;
  /** Salary for a player, the loan size for a loan. */
  amount: number;
  fromTeam: string;
  toTeam: string;
}

export interface LeagueTrade {
  /** `th:<ottoneu trade id>` or `card:<minute> <team pair>`. */
  key: string;
  source: TradeSource;
  /** Ottoneu's trade id, for a link to /view_trade. */
  ottoneuTradeId: number | null;
  status: TradeStatus;
  season: number;
  /** Site clock, `YYYY-MM-DDTHH:MM[:SS]`. Null for a card-rebuilt trade. */
  acceptedAt: string | null;
  /** When it processed — or, pending, when it will. */
  processedAt: string | null;
  /** [offered by, offered to] — for a card-rebuilt trade, alphabetical. */
  teams: [string, string];
  assets: TradeAsset[];
  /** False when the source cannot show loans (player cards). */
  loansKnown: boolean;
}

/** One `trades` row with its assets, as read by `./trades-data`. */
export interface TradeRow {
  trade_id: number;
  season: number;
  accepted_at: string;
  processed_at: string | null;
  status: string;
  offered_by_team_name: string;
  offered_to_team_name: string;
}

export interface TradeAssetRow {
  trade_id: number;
  asset_type: string;
  from_team_name: string;
  to_team_name: string;
  ottoneu_id: number | null;
  is_college: boolean | null;
  player_id: string | null;
  player_name: string | null;
  position: string | null;
  amount: number;
}

/** A player-card `transactions` row, with the player join and id. */
export interface CardMoveRow extends RawTransactionRow {
  player_id: string;
  players: {
    name: string;
    position: string | null;
    ottoneu_id: number;
    is_college: boolean | null;
  } | null;
}

/** player_id → dollar value, for one season. */
export type ValueBook = Map<string, number>;

export interface ValueBooks {
  /** Projected (preseason) dollar values, by season. */
  projected: Map<number, ValueBook>;
  /** Realized dollar values from that season's actual PPG, by season. */
  realized: Map<number, ValueBook>;
}

// ---------------------------------------------------------------------------
// Building the log
// ---------------------------------------------------------------------------

/** The moment a trade counts from: when it processed, else when it was agreed. */
export function tradeTime(trade: LeagueTrade): string {
  return trade.processedAt ?? trade.acceptedAt ?? `${trade.season}-01-01T00:00`;
}

function byTimeDesc(a: LeagueTrade, b: LeagueTrade): number {
  return tradeTime(b).localeCompare(tradeTime(a)) || a.key.localeCompare(b.key);
}

function normaliseStatus(status: string): TradeStatus {
  return status === "processed" || status === "removed" ? status : "pending";
}

/** Shape `trades` + `trade_assets` rows into log entries. */
export function tradesFromHistory(
  rows: readonly TradeRow[],
  assets: readonly TradeAssetRow[],
): LeagueTrade[] {
  const byTrade = new Map<number, TradeAsset[]>();
  for (const a of assets) {
    const list = byTrade.get(a.trade_id) ?? [];
    list.push({
      kind: a.asset_type === "loan" ? "loan" : "player",
      playerId: a.player_id,
      ottoneuId: a.ottoneu_id,
      isCollege: a.is_college ?? false,
      name: a.asset_type === "loan" ? "Loan" : (a.player_name ?? "Unknown player"),
      position: a.position,
      amount: a.amount,
      fromTeam: a.from_team_name,
      toTeam: a.to_team_name,
    });
    byTrade.set(a.trade_id, list);
  }
  return rows.map((r) => ({
    key: `th:${r.trade_id}`,
    source: "trade_history" as const,
    ottoneuTradeId: r.trade_id,
    status: normaliseStatus(r.status),
    season: r.season,
    acceptedAt: r.accepted_at,
    processedAt: r.processed_at,
    teams: [r.offered_by_team_name, r.offered_to_team_name] as [string, string],
    assets: byTrade.get(r.trade_id) ?? [],
    loansKnown: true,
  }));
}

/**
 * Rebuild trades from player-card `move (from X)` rows.
 *
 * Every player in a trade is stamped with the same processing minute, so rows
 * sharing a minute and a pair of teams are one trade (the same rule
 * web/lib/recap-moves.ts uses). Inferred rows are dropped where they restate a
 * scraped move, and the rest are skipped: a reconciliation-run date is not the
 * moment a trade happened.
 */
export function tradesFromCards(rows: readonly CardMoveRow[]): LeagueTrade[] {
  const shapedRows = rows.map((row) => ({ row, shaped: shapeTransaction(row) }));
  const kept = new Set(dedupeInferred(shapedRows.map((s) => s.shaped)));

  const groups = new Map<string, TradeAsset[]>();
  const meta = new Map<string, { at: string; season: number; teams: [string, string] }>();
  for (const { row, shaped } of shapedRows) {
    if (!kept.has(shaped) || shaped.source !== "scraped") continue;
    if (shaped.type !== "move" || !shaped.from_team || !shaped.team) continue;
    const at = shaped.occurred_at_local ?? shaped.date;
    if (!at) continue;
    const teams = [shaped.team, shaped.from_team].sort() as [string, string];
    const key = `card:${at} ${teams.join(" <> ")}`;
    const list = groups.get(key) ?? [];
    list.push({
      kind: "player",
      playerId: row.player_id,
      ottoneuId: row.players?.ottoneu_id ?? null,
      isCollege: row.players?.is_college ?? false,
      name: row.players?.name ?? shaped.player ?? "Unknown player",
      position: row.players?.position ?? shaped.position,
      amount: shaped.salary ?? 0,
      fromTeam: shaped.from_team,
      toTeam: shaped.team,
    });
    groups.set(key, list);
    meta.set(key, { at, season: shaped.season ?? Number(at.slice(0, 4)), teams });
  }

  return [...groups.entries()].map(([key, assets]) => {
    const m = meta.get(key)!;
    return {
      key,
      source: "player_cards" as const,
      ottoneuTradeId: null,
      status: "processed" as const,
      season: m.season,
      acceptedAt: null,
      processedAt: m.at,
      teams: m.teams,
      assets,
      loansKnown: false,
    };
  });
}

const HOUR_MS = 3_600_000;

function clockMs(local: string): number {
  // Site-clock strings carry no zone; reading both sides as UTC keeps the
  // difference exact, which is all this is used for.
  return Date.parse(`${local.length === 10 ? `${local}T00:00` : local.slice(0, 16)}:00Z`);
}

function samePair(a: [string, string], b: [string, string]): boolean {
  return [...a].sort().join("\n") === [...b].sort().join("\n");
}

/**
 * Does a trade-history trade explain this card-rebuilt one? Same two teams, and
 * the card's processing stamp falls between acceptance and a few days after it
 * (Ottoneu processes 48 hours after acceptance; cards print the minute it did).
 */
function explains(history: LeagueTrade, card: LeagueTrade): boolean {
  if (!samePair(history.teams, card.teams) || !card.processedAt) return false;
  const cardMs = clockMs(card.processedAt);
  if (history.processedAt) {
    return Math.abs(cardMs - clockMs(history.processedAt)) <= 24 * HOUR_MS;
  }
  if (!history.acceptedAt) return false;
  const accepted = clockMs(history.acceptedAt);
  return cardMs >= accepted - HOUR_MS && cardMs <= accepted + 4 * 24 * HOUR_MS;
}

/** One log, newest first: every trade-history trade plus unexplained card trades. */
export function mergeTrades(
  history: readonly LeagueTrade[],
  cards: readonly LeagueTrade[],
): LeagueTrade[] {
  const processed = history.filter((t) => t.status === "processed");
  const extra = cards.filter((c) => !processed.some((h) => explains(h, c)));
  return [...history, ...extra].sort(byTimeDesc);
}

/** Players and loans each team gave up, biggest first. */
export function sideAssets(trade: LeagueTrade, team: string): TradeAsset[] {
  return trade.assets
    .filter((a) => a.fromTeam === team)
    .sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === "player" ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

export interface LoanSeasonRow {
  season: number;
  /** Processed trades whose loans are known. */
  trades: number;
  tradesWithLoan: number;
  loanTotal: number;
  largestLoan: number;
}

export interface LoanTeamRow {
  team: string;
  lentCount: number;
  lentTotal: number;
  borrowedCount: number;
  borrowedTotal: number;
}

export interface LoanLedgerEntry {
  trade: LeagueTrade;
  lender: string;
  borrower: string;
  amount: number;
}

export interface LoanSummary {
  bySeason: LoanSeasonRow[];
  byTeam: LoanTeamRow[];
  loans: LoanLedgerEntry[];
  /** Earliest trade whose loans are known — the start of the loan record. */
  knownSince: string | null;
}

/** How often loans are given, how big, and who gives them. Processed trades only. */
export function summariseLoans(trades: readonly LeagueTrade[]): LoanSummary {
  const known = trades.filter((t) => t.loansKnown && t.status === "processed");
  const seasons = new Map<number, LoanSeasonRow>();
  const teams = new Map<string, LoanTeamRow>();
  const loans: LoanLedgerEntry[] = [];
  const team = (name: string) => {
    const row = teams.get(name) ?? {
      team: name, lentCount: 0, lentTotal: 0, borrowedCount: 0, borrowedTotal: 0,
    };
    teams.set(name, row);
    return row;
  };

  for (const t of known) {
    const s = seasons.get(t.season) ?? {
      season: t.season, trades: 0, tradesWithLoan: 0, loanTotal: 0, largestLoan: 0,
    };
    seasons.set(t.season, s);
    s.trades += 1;
    const tradeLoans = t.assets.filter((a) => a.kind === "loan");
    if (tradeLoans.length > 0) s.tradesWithLoan += 1;
    for (const loan of tradeLoans) {
      s.loanTotal += loan.amount;
      s.largestLoan = Math.max(s.largestLoan, loan.amount);
      const lender = team(loan.fromTeam);
      lender.lentCount += 1;
      lender.lentTotal += loan.amount;
      const borrower = team(loan.toTeam);
      borrower.borrowedCount += 1;
      borrower.borrowedTotal += loan.amount;
      loans.push({ trade: t, lender: loan.fromTeam, borrower: loan.toTeam, amount: loan.amount });
    }
    for (const name of t.teams) team(name);
  }

  const times = known.map(tradeTime).sort();
  return {
    bySeason: [...seasons.values()].sort((a, b) => b.season - a.season),
    byTeam: [...teams.values()].sort(
      (a, b) => b.lentTotal - a.lentTotal || b.borrowedTotal - a.borrowedTotal
        || a.team.localeCompare(b.team),
    ),
    loans: loans.sort((a, b) => byTimeDesc(a.trade, b.trade)),
    knownSince: times[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Lineage
// ---------------------------------------------------------------------------

/** A stable identity for a player across both sources. */
export function playerKey(asset: Pick<TradeAsset, "playerId" | "ottoneuId" | "name">): string {
  if (asset.playerId) return `id:${asset.playerId}`;
  if (asset.ottoneuId) return `ot:${asset.ottoneuId}`;
  return `name:${asset.name.toLowerCase()}`;
}

export interface PlayerTradeStep {
  trade: LeagueTrade;
  fromTeam: string;
  toTeam: string;
  salary: number;
}

/** Every processed trade a player moved in, oldest first — his chain of owners. */
export function playerTradeChain(
  trades: readonly LeagueTrade[],
  key: string,
): PlayerTradeStep[] {
  const steps: PlayerTradeStep[] = [];
  for (const t of trades) {
    if (t.status !== "processed") continue;
    for (const a of t.assets) {
      if (a.kind === "player" && playerKey(a) === key) {
        steps.push({ trade: t, fromTeam: a.fromTeam, toTeam: a.toTeam, salary: a.amount });
      }
    }
  }
  return steps.sort((a, b) => tradeTime(a.trade).localeCompare(tradeTime(b.trade)));
}

/** Players traded more than once, most-travelled first. */
export function mostTradedPlayers(
  trades: readonly LeagueTrade[],
  minTrades = 2,
): { key: string; name: string; position: string | null; chain: PlayerTradeStep[] }[] {
  const seen = new Map<string, { name: string; position: string | null }>();
  for (const t of trades) {
    for (const a of t.assets) {
      if (a.kind === "player") seen.set(playerKey(a), { name: a.name, position: a.position });
    }
  }
  return [...seen.entries()]
    .map(([key, p]) => ({ key, ...p, chain: playerTradeChain(trades, key) }))
    .filter((p) => p.chain.length >= minTrades)
    .sort((a, b) => b.chain.length - a.chain.length || a.name.localeCompare(b.name));
}

export interface TradeTreeNode {
  asset: TradeAsset;
  /** The later trade in which the receiving team moved him on, if any. */
  flipped: { trade: LeagueTrade; received: TradeTreeNode[] } | null;
}

/**
 * What a team turned its side of a trade into: each player it received, and —
 * if it later traded him away — what came back, recursively. The classic
 * "trade tree".
 */
export function tradeTree(
  trades: readonly LeagueTrade[],
  trade: LeagueTrade,
  team: string,
  maxDepth = 4,
): TradeTreeNode[] {
  const processed = trades.filter((t) => t.status === "processed");
  const visited = new Set<string>([trade.key]);

  const grow = (from: LeagueTrade, owner: string, depth: number): TradeTreeNode[] =>
    from.assets
      .filter((a) => a.kind === "player" && a.toTeam === owner)
      .map((asset) => {
        if (depth >= maxDepth) return { asset, flipped: null };
        const key = playerKey(asset);
        const after = tradeTime(from);
        const next = processed
          .filter((t) => !visited.has(t.key) && tradeTime(t) > after)
          .sort((a, b) => tradeTime(a).localeCompare(tradeTime(b)))
          .find((t) => t.assets.some(
            (a) => a.kind === "player" && a.fromTeam === owner && playerKey(a) === key,
          ));
        if (!next) return { asset, flipped: null };
        visited.add(next.key);
        return { asset, flipped: { trade: next, received: grow(next, owner, depth + 1) } };
      });

  return grow(trade, team, 0);
}

// ---------------------------------------------------------------------------
// Season timing and standings
// ---------------------------------------------------------------------------

/**
 * The share of the fantasy regular season still to play at `at` (0–1).
 *
 * Counted in regular-season weeks from `league_matchups`: a week whose window
 * has not ended yet is still to play. Before the first week, 1; after the last,
 * 0. Null when the season's schedule is not stored.
 */
export function remainingSeasonFraction(
  at: string,
  seasonMatchups: readonly Matchup[],
): number | null {
  const weeks = new Map<number, string>();
  for (const m of seasonMatchups) {
    if (m.game_type !== "regular" || !m.ends_on) continue;
    const prev = weeks.get(m.week);
    if (!prev || m.ends_on > prev) weeks.set(m.week, m.ends_on);
  }
  if (weeks.size === 0) return null;
  const day = at.slice(0, 10);
  const left = [...weeks.values()].filter((end) => end >= day).length;
  return left / weeks.size;
}

export interface TeamStanding {
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  /** Teams in the table the rank is out of. */
  teams: number;
  /** "this season" = games before the trade; "last season" = final table. */
  basis: "this season" | "last season";
}

function standingOf(rows: StandingsRow[], team: string, basis: TeamStanding["basis"]): TeamStanding | null {
  const row = rows.find((r) => r.team_name === team);
  if (!row) return null;
  return {
    rank: row.rank, wins: row.wins, losses: row.losses, ties: row.ties, teams: rows.length, basis,
  };
}

/**
 * Where a team stood when it traded: its record from the games finished before
 * the trade, or — for an offseason or week-one trade, when nothing has been
 * played — last season's final table, which is what everyone was judging by.
 */
export function standingAt(
  team: string,
  at: string,
  matchupsBySeason: ReadonlyMap<number, readonly Matchup[]>,
  season: number,
): TeamStanding | null {
  const day = at.slice(0, 10);
  const played = (matchupsBySeason.get(season) ?? []).filter(
    (m) => m.status === "final" && m.ends_on != null && m.ends_on < day,
  );
  if (played.some((m) => m.game_type === "regular")) {
    return standingOf(computeStandings([...played]), team, "this season");
  }
  const last = matchupsBySeason.get(season - 1);
  if (!last || last.length === 0) return null;
  return standingOf(computeStandings([...last]), team, "last season");
}

/** A season's standings as they stand now (final, or so far). */
export function seasonStanding(
  team: string,
  matchups: readonly Matchup[] | undefined,
): (TeamStanding & { complete: boolean }) | null {
  if (!matchups || matchups.length === 0) return null;
  const rows = computeStandings([...matchups]);
  const s = standingOf(rows, team, "this season");
  if (!s) return null;
  const complete = matchups
    .filter((m) => m.game_type === "regular")
    .every((m) => m.status === "final");
  return { ...s, complete };
}

// ---------------------------------------------------------------------------
// Valuation
// ---------------------------------------------------------------------------

export interface AssetValue {
  asset: TradeAsset;
  /** Projected dollar value in the trade's season; null = no projections that season. */
  value: number | null;
  /** He has no projection that season, so `value` is the roster-spot floor. */
  unprojected: boolean;
  /** Next season's projected dollar value. */
  nextValue: number | null;
  /** True when `nextValue` is this season's projection standing in for next. */
  nextIsProxy: boolean;
  nextSalary: number;
  /** max(0, nextValue − nextSalary): what the contract is worth to keep. */
  keeperValue: number | null;
  /** What he actually produced next season, in dollars (partial if in progress). */
  realizedNext: number | null;
}

export interface SideValuation {
  team: string;
  gave: AssetValue[];
  got: AssetValue[];
  loanOut: number;
  loanIn: number;
  /** Prorated dollar value received minus given, this season. */
  seasonNet: number | null;
  /** Keeper value received minus given. */
  keeperNet: number | null;
  /** Change in this season's cap room. */
  capNet: number;
  /** Realized next-season dollars received minus given. */
  realizedNextNet: number | null;
}

export interface TradeValuation {
  trade: LeagueTrade;
  /** Share of the regular season left; null = schedule unknown (treated as 1). */
  remaining: number | null;
  sides: [SideValuation, SideValuation];
}

/** A `player_projections` row. */
export interface ProjectionRow {
  player_id: string;
  projected_ppg: number;
  projected_games: number | null;
}

/** A `player_stats` row. */
export interface StatsRow {
  player_id: string;
  ppg: number;
  games_played: number;
}

function asPoolPlayer(p: CorePlayer, ppg: number, games: number): Player {
  // Salary and owner do not move a dollar value (the market is priced off the
  // whole pool's VORP), so the pool carries none.
  return {
    ...p, price: 0, team_name: null,
    total_points: ppg * games, games_played: games, snaps: 0, ppg, pps: 0,
  };
}

/** One season's projections as a pricing pool, priced like a full season. */
export function projectedPool(players: readonly CorePlayer[], rows: readonly ProjectionRow[]): Player[] {
  const byId = new Map(players.map((p) => [p.player_id, p]));
  return rows.flatMap((r) => {
    const p = byId.get(r.player_id);
    if (!p) return [];
    return [{
      ...asPoolPlayer(p, Number(r.projected_ppg) || 0, FULL_SEASON_GAMES),
      projected_games: r.projected_games,
    }];
  });
}

/** One season's actual production as a pricing pool. */
export function realizedPool(players: readonly CorePlayer[], rows: readonly StatsRow[]): Player[] {
  const byId = new Map(players.map((p) => [p.player_id, p]));
  return rows.flatMap((r) => {
    const p = byId.get(r.player_id);
    return p ? [asPoolPlayer(p, Number(r.ppg) || 0, Number(r.games_played) || 0)] : [];
  });
}

/** Price a pool: player_id → dollar value, by the same market as /value. */
export function valueBook(pool: readonly Player[]): ValueBook {
  return new Map(calculateSurplus([...pool]).map((p) => [p.player_id, p.dollar_value]));
}

/** Next season's salary: Ottoneu's end-of-season raise. */
export function nextSeasonSalary(salary: number, isCollege: boolean): number {
  // College prospects play no NFL games, so they take the smaller raise.
  return salary + (isCollege ? SEASON_END_RAISE_OTHER : SEASON_END_RAISE_PLAYED);
}

/**
 * A player's value in one book. Null only when the season has no book at all.
 *
 * A player missing from a book that exists is not an unknown: the projection
 * set left him out (retired, a deep reserve, a kicker — kickers sit outside the
 * VORP pool) or he logged too few games to rate. He is priced at what a roster
 * spot costs to fill — `floor` — and flagged, rather than nulling the whole
 * trade's sum.
 */
function lookup(
  book: ValueBook | undefined,
  playerId: string | null,
  floor: number,
): { value: number | null; missing: boolean } {
  if (!book || book.size === 0) return { value: null, missing: false };
  const v = playerId ? book.get(playerId) : undefined;
  return v == null ? { value: floor, missing: true } : { value: v, missing: false };
}

function valueAsset(asset: TradeAsset, season: number, books: ValueBooks): AssetValue {
  const now = lookup(books.projected.get(season), asset.playerId, MIN_PLAYER_SALARY);
  const nextBook = books.projected.get(season + 1);
  const nextIsProxy = !nextBook || nextBook.size === 0;
  // A player with no projection next season is not worth keeping: price him at
  // nothing, so his keeper value is zero rather than a dollar.
  const next = nextIsProxy ? now : lookup(nextBook, asset.playerId, 0);
  const nextSalary = nextSeasonSalary(asset.amount, asset.isCollege);
  // Realized production: a player missing from a season that has been played
  // produced nothing countable.
  const realized = lookup(books.realized.get(season + 1), asset.playerId, 0);
  return {
    asset,
    value: now.value,
    unprojected: now.missing,
    nextValue: next.value,
    nextIsProxy,
    nextSalary,
    keeperValue: next.value == null ? null : Math.max(0, next.value - nextSalary),
    realizedNext: realized.value,
  };
}

/** Σ over values, or null if any is unknown — a partial sum would mislead. */
function sumKnown(values: (number | null)[]): number | null {
  let total = 0;
  for (const v of values) {
    if (v == null) return null;
    total += v;
  }
  return total;
}

function net(got: (number | null)[], gave: (number | null)[]): number | null {
  const a = sumKnown(got);
  const b = sumKnown(gave);
  return a == null || b == null ? null : a - b;
}

/** Value both sides of a trade. */
export function valueTrade(
  trade: LeagueTrade,
  books: ValueBooks,
  seasonMatchups: readonly Matchup[],
): TradeValuation {
  const remaining = remainingSeasonFraction(tradeTime(trade), seasonMatchups);
  const share = remaining ?? 1;
  const side = (team: string): SideValuation => {
    const players = (dir: "from" | "to") => trade.assets
      .filter((a) => a.kind === "player" && (dir === "from" ? a.fromTeam : a.toTeam) === team)
      .map((a) => valueAsset(a, trade.season, books))
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || b.asset.amount - a.asset.amount);
    const loans = (dir: "from" | "to") => trade.assets
      .filter((a) => a.kind === "loan" && (dir === "from" ? a.fromTeam : a.toTeam) === team)
      .reduce((s, a) => s + a.amount, 0);
    const gave = players("from");
    const got = players("to");
    const salary = (list: AssetValue[]) => list.reduce((s, a) => s + a.asset.amount, 0);
    const loanOut = loans("from");
    const loanIn = loans("to");
    const seasonNet = net(got.map((a) => a.value), gave.map((a) => a.value));
    return {
      team,
      gave,
      got,
      loanOut,
      loanIn,
      seasonNet: seasonNet == null ? null : Math.round(seasonNet * share),
      keeperNet: net(got.map((a) => a.keeperValue), gave.map((a) => a.keeperValue)),
      capNet: salary(gave) - salary(got) - loanOut + loanIn,
      realizedNextNet: net(got.map((a) => a.realizedNext), gave.map((a) => a.realizedNext)),
    };
  };
  return { trade, remaining, sides: [side(trade.teams[0]), side(trade.teams[1])] };
}

// ---------------------------------------------------------------------------
// Sell-offs
// ---------------------------------------------------------------------------

/** A side gives up at least this much prorated this-season value, net. */
export const SELL_OFF_MIN_SEASON_VALUE = 25;

export interface SellOff {
  valuation: TradeValuation;
  seller: SideValuation;
  buyer: SideValuation;
  standingAtTrade: TeamStanding | null;
  /** The seller's record the season after (final, or so far). */
  nextSeason: (TeamStanding & { complete: boolean }) | null;
  /** Bottom half of the league when it sold. */
  wasLosing: boolean;
}

/**
 * Trades in which one side shipped out a meaningful slab of this season's
 * value — the "sell-off". Each is paired with where the seller stood when it
 * sold and how it fared the next season, so the page can ask whether selling
 * bought anything: more keeper value, a better record, or neither.
 */
export function findSellOffs(
  valuations: readonly TradeValuation[],
  matchupsBySeason: ReadonlyMap<number, readonly Matchup[]>,
  minSeasonValue = SELL_OFF_MIN_SEASON_VALUE,
): SellOff[] {
  const out: SellOff[] = [];
  for (const v of valuations) {
    if (v.trade.status !== "processed") continue;
    const [a, b] = v.sides;
    const seller = a.seasonNet != null && a.seasonNet <= -minSeasonValue ? a
      : b.seasonNet != null && b.seasonNet <= -minSeasonValue ? b
        : null;
    if (!seller) continue;
    const buyer = seller === a ? b : a;
    const at = tradeTime(v.trade);
    const standing = standingAt(seller.team, at, matchupsBySeason, v.trade.season);
    out.push({
      valuation: v,
      seller,
      buyer,
      standingAtTrade: standing,
      nextSeason: seasonStanding(seller.team, matchupsBySeason.get(v.trade.season + 1)),
      wasLosing: standing != null && standing.rank > standing.teams / 2,
    });
  }
  return out;
}

export interface SellOffVerdict {
  /** Sell-offs by bottom-half teams, with both a keeper read and a next season. */
  judged: number;
  /** Of those, how many came away with more keeper value than they sent. */
  gainedKeeperValue: number;
  /** Of those whose next season exists, how many finished higher. */
  improvedRank: number;
  withNextSeason: number;
  averageKeeperNet: number | null;
  averageRankChange: number | null;
}

/** Roll the bottom-half sell-offs up into "did it work?" numbers. */
export function judgeSellOffs(sellOffs: readonly SellOff[]): SellOffVerdict {
  const losing = sellOffs.filter((s) => s.wasLosing && s.seller.keeperNet != null);
  const withNext = losing.filter((s) => s.nextSeason && s.standingAtTrade);
  const keeper = losing.map((s) => s.seller.keeperNet as number);
  const rankChanges = withNext.map(
    (s) => (s.standingAtTrade as TeamStanding).rank - (s.nextSeason as TeamStanding).rank,
  );
  const avg = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length);
  return {
    judged: losing.length,
    gainedKeeperValue: keeper.filter((k) => k > 0).length,
    improvedRank: rankChanges.filter((d) => d > 0).length,
    withNextSeason: withNext.length,
    averageKeeperNet: avg(keeper),
    averageRankChange: avg(rankChanges),
  };
}
