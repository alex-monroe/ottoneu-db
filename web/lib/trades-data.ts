/**
 * Reads behind the /trades page. All the judgement is in `./trades`; this file
 * only gathers rows and hands them over.
 *
 * Valuation needs one pricing pool per season a trade touches — its own season
 * and the next — so the reads fan out per season. Every one is small (a season
 * of projections is ~1,400 rows) and the page revalidates hourly.
 */

import { cache } from "react";
import { LEAGUE_ID } from "./config";
import { fetchMatchups } from "./matchups";
import { getProjectionSeason } from "./season";
import type { Matchup } from "./standings";
import { fetchAllRows, supabase } from "./supabase";
import {
  findSellOffs,
  judgeSellOffs,
  mergeTrades,
  mostTradedPlayers,
  projectedPool,
  realizedPool,
  summariseLoans,
  tradesFromCards,
  tradesFromHistory,
  valueBook,
  valueTrade,
  type CardMoveRow,
  type LeagueTrade,
  type LoanSummary,
  type PlayerTradeStep,
  type ProjectionRow,
  type SellOff,
  type SellOffVerdict,
  type StatsRow,
  type TradeAssetRow,
  type TradeRow,
  type TradeValuation,
  type ValueBook,
  type ValueBooks,
} from "./trades";
import type { CorePlayer } from "./types";

export interface TradesPageData {
  /** Every trade, newest first, valued. */
  valuations: TradeValuation[];
  pending: TradeValuation[];
  loans: LoanSummary;
  sellOffs: SellOff[];
  verdict: SellOffVerdict;
  travellers: { key: string; name: string; position: string | null; chain: PlayerTradeStep[] }[];
  /** player key → team that holds him now (from league_prices). */
  currentOwners: Record<string, string>;
  /** The oldest trade on record, from either source. */
  historyFrom: string | null;
  /** True once the trade-history scrape has written anything. */
  hasTradeHistory: boolean;
  projectionSeason: number;
}

async function fetchTradeRows(): Promise<{ trades: TradeRow[]; assets: TradeAssetRow[] }> {
  const [trades, assets] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("trades")
        .select("trade_id, season, accepted_at, processed_at, status, offered_by_team_name, offered_to_team_name")
        .eq("league_id", LEAGUE_ID)
        // stable-order: trade_id is unique within a league (PK league_id, trade_id)
        .order("trade_id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("trade_assets")
        .select("trade_id, asset_type, from_team_name, to_team_name, ottoneu_id, is_college, player_id, player_name, position, amount")
        .eq("league_id", LEAGUE_ID)
        // stable-order: (trade_id, asset_key) is the PK within a league
        .order("trade_id")
        .order("asset_key")
        .range(from, to),
    ),
  ]);
  return { trades: trades as TradeRow[], assets: assets as TradeAssetRow[] };
}

async function fetchCardMoves(): Promise<CardMoveRow[]> {
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("transactions")
      .select(
        "player_id, transaction_date, transaction_type, team_name, from_team, salary, season, raw_description, players(name, position, ottoneu_id, is_college)",
      )
      .eq("league_id", LEAGUE_ID)
      .ilike("transaction_type", "move%")
      .order("id")
      .range(from, to),
  );
  return rows as unknown as CardMoveRow[];
}

const fetchCorePlayers = cache(async function fetchCorePlayers(): Promise<CorePlayer[]> {
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("players")
      .select("id, ottoneu_id, name, position, nfl_team, birth_date, is_college")
      .order("id")
      .range(from, to),
  );
  return rows.map((p) => ({
    player_id: p.id,
    ottoneu_id: p.ottoneu_id ?? 0,
    name: p.name,
    position: p.position ?? "",
    nfl_team: p.nfl_team ?? "",
    birth_date: p.birth_date ?? null,
    is_college: p.is_college ?? false,
  }));
});

async function fetchProjectionRows(season: number): Promise<ProjectionRow[]> {
  return (await fetchAllRows((from, to) =>
    supabase
      .from("player_projections")
      .select("player_id, projected_ppg, projected_games")
      .eq("season", season)
      .order("id")
      .range(from, to),
  )) as ProjectionRow[];
}

async function fetchStatsRows(season: number): Promise<StatsRow[]> {
  return (await fetchAllRows((from, to) =>
    supabase
      .from("player_stats")
      .select("player_id, ppg, games_played")
      .eq("season", season)
      .order("id")
      .range(from, to),
  )) as StatsRow[];
}

async function fetchCurrentOwners(): Promise<Map<string, string>> {
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("league_prices")
      .select("player_id, team_name")
      .eq("league_id", LEAGUE_ID)
      .order("id")
      .range(from, to),
  );
  const owners = new Map<string, string>();
  for (const r of rows) {
    if (r.player_id && r.team_name && r.team_name !== "FA") owners.set(`id:${r.player_id}`, r.team_name);
  }
  return owners;
}

async function buildBooks(
  seasons: number[],
  realizedSeasons: number[],
  players: CorePlayer[],
): Promise<ValueBooks> {
  const projected = new Map<number, ValueBook>();
  const realized = new Map<number, ValueBook>();
  await Promise.all([
    ...seasons.map(async (s) => {
      projected.set(s, valueBook(projectedPool(players, await fetchProjectionRows(s))));
    }),
    ...realizedSeasons.map(async (s) => {
      realized.set(s, valueBook(realizedPool(players, await fetchStatsRows(s))));
    }),
  ]);
  return { projected, realized };
}

/** Everything the /trades page shows, assembled and valued. */
export const fetchTradesPageData = cache(async function fetchTradesPageData(): Promise<TradesPageData> {
  const [{ trades: tradeRows, assets }, cardRows, players, owners, projectionSeason] =
    await Promise.all([
      fetchTradeRows(),
      fetchCardMoves(),
      fetchCorePlayers(),
      fetchCurrentOwners(),
      getProjectionSeason(),
    ]);

  const history = tradesFromHistory(tradeRows, assets);
  const trades: LeagueTrade[] = mergeTrades(
    history.filter((t) => t.status !== "removed"),
    tradesFromCards(cardRows),
  );

  const tradeSeasons = [...new Set(trades.map((t) => t.season))];
  const valueSeasons = [...new Set(tradeSeasons.flatMap((s) => [s, s + 1]))]
    .filter((s) => s <= projectionSeason + 1);
  const realizedSeasons = [...new Set(tradeSeasons.map((s) => s + 1))]
    .filter((s) => s <= projectionSeason);
  const matchupSeasons = [...new Set(tradeSeasons.flatMap((s) => [s - 1, s, s + 1]))];

  const [books, matchupLists] = await Promise.all([
    buildBooks(valueSeasons, realizedSeasons, players),
    Promise.all(matchupSeasons.map(async (s) => [s, await fetchMatchups(s)] as const)),
  ]);
  const matchupsBySeason = new Map<number, Matchup[]>(matchupLists);

  const valuations = trades.map((t) => valueTrade(t, books, matchupsBySeason.get(t.season) ?? []));
  const sellOffs = findSellOffs(valuations, matchupsBySeason);
  const times = trades.map((t) => t.processedAt ?? t.acceptedAt).filter((x): x is string => !!x).sort();

  return {
    valuations,
    pending: valuations.filter((v) => v.trade.status === "pending"),
    loans: summariseLoans(trades),
    sellOffs,
    verdict: judgeSellOffs(sellOffs),
    travellers: mostTradedPlayers(trades),
    currentOwners: Object.fromEntries(owners),
    historyFrom: times[0] ?? null,
    hasTradeHistory: history.length > 0,
    projectionSeason,
  };
});
