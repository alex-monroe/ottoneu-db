/**
 * Reads behind `/trades/builder`. The judgement is in `./trade-builder`; this
 * file gathers every team's current roster and prices each player from this
 * season's production.
 *
 * Rosters and salaries come from `league_prices` (today's roster state, via
 * `fetchPlayerList`), not a transaction replay, so a player traded this morning
 * is already on his new team. Earned value is priced over the whole league's
 * pool — replacement level is a property of the pool — and then looked up per
 * player.
 *
 * Keeper value reads each player's newest `keeper_outlook` snapshot for this
 * season (web/lib/keeper-outlook.ts) at his next-season salary.
 *
 * With a trade id, the rosters are rewound to just before that trade
 * (`replayTrade`), so a link from a Discord post or a trade card shows the
 * trade as it was made.
 */

import { CAP_PER_TEAM, LEAGUE_ID, ROSTER_SPOTS, SEASON_END_RAISE_OTHER, SEASON_END_RAISE_PLAYED } from "./config";
import { fetchPlayerList, fetchPlayerSet } from "./data";
import { calculateEarnedValue } from "./earned-value";
import { readKeeper } from "./keeper-outlook";
import { fetchLatestKeeperOutlooks } from "./keeper-outlook-data";
import { fetchMatchups } from "./matchups";
import { isRealTeam } from "./roster-reconstruction";
import type { StatWindow } from "./stat-window";
import { supabase } from "./supabase";
import { sameTeamName } from "./teams";
import {
  nextSalary,
  replayTrade,
  seasonPace,
  type BuilderContext,
  type BuilderPlayer,
  type BuilderTeam,
  type ProposedTrade,
  type RecordedAsset,
} from "./trade-builder";
import { remainingSeasonFraction } from "./trades";

export interface TradeReplay {
  tradeId: number;
  status: string;
  acceptedAt: string | null;
  processedAt: string | null;
  trade: ProposedTrade;
  /** Players the replay could not place. */
  missing: string[];
}

export interface TradeBuilderData extends BuilderContext {
  window: StatWindow;
  /** Set when a trade id was asked for and found. */
  replay: TradeReplay | null;
}

async function fetchRecordedTrade(tradeId: number): Promise<{
  row: { status: string; accepted_at: string | null; processed_at: string | null };
  assets: RecordedAsset[];
} | null> {
  // One trade: a single row and a handful of assets, far under the row cap.
  const [{ data: row, error }, { data: assets, error: assetError }] = await Promise.all([
    supabase
      .from("trades")
      .select("status, accepted_at, processed_at")
      .eq("league_id", LEAGUE_ID)
      .eq("trade_id", tradeId)
      .maybeSingle(),
    supabase
      .from("trade_assets")
      .select("asset_type, player_id, player_name, from_team_name, to_team_name, amount")
      .eq("league_id", LEAGUE_ID)
      .eq("trade_id", tradeId)
      .order("asset_key"),
  ]);
  if (error || assetError || !row) {
    if (error || assetError) console.error("fetchRecordedTrade error", error ?? assetError);
    return null;
  }
  return {
    row,
    assets: (assets ?? []).map((a) => ({
      kind: a.asset_type === "loan" ? ("loan" as const) : ("player" as const),
      playerId: a.player_id,
      name: a.asset_type === "loan" ? "Loan" : (a.player_name ?? "Unknown player"),
      fromTeam: a.from_team_name,
      toTeam: a.to_team_name,
      amount: Number(a.amount) || 0,
    })),
  };
}

export async function fetchTradeBuilderData(tradeId?: number | null): Promise<TradeBuilderData> {
  const [{ players, window }, list, recorded] = await Promise.all([
    fetchPlayerSet(),
    fetchPlayerList(),
    tradeId != null ? fetchRecordedTrade(tradeId) : Promise.resolve(null),
  ]);
  const [matchups, outlooks] = await Promise.all([
    fetchMatchups(window.season),
    fetchLatestKeeperOutlooks(window.season),
  ]);

  const earned = new Map(calculateEarnedValue(players, window).map((p) => [p.player_id, p.earned_value]));

  // Every player, rostered or not: a replay may need one who has since been cut.
  const lookup = new Map<string, BuilderPlayer>();
  const byTeam = new Map<string, BuilderPlayer[]>();
  for (const p of list) {
    const games = p.games_played ?? 0;
    const salary = p.price ?? 0;
    const toDate = earned.get(p.id) ?? 0;
    const next = nextSalary(salary, games, SEASON_END_RAISE_PLAYED, SEASON_END_RAISE_OTHER);
    const outlook = outlooks.get(p.id);
    const row: BuilderPlayer = {
      playerId: p.id,
      ottoneuId: p.ottoneu_id,
      name: p.name,
      position: p.position,
      nflTeam: p.nfl_team,
      salary,
      ppg: p.ppg ?? 0,
      gamesPlayed: games,
      earnedToDate: toDate,
      seasonPace: Math.round(seasonPace(toDate, window.fraction) * 100) / 100,
      nextSalary: next,
      keeper: outlook ? readKeeper(outlook, next) : null,
    };
    lookup.set(p.id, row);
    if (!isRealTeam(p.team_name)) continue;
    const roster = byTeam.get(p.team_name) ?? [];
    roster.push(row);
    byTeam.set(p.team_name, roster);
  }

  let teams: BuilderTeam[] = [...byTeam.entries()]
    .map(([teamName, roster]) => ({
      teamName,
      players: roster.sort((x, y) => y.ppg - x.ppg || x.name.localeCompare(y.name)),
    }))
    .sort((x, y) => x.teamName.localeCompare(y.teamName));

  let replay: TradeReplay | null = null;
  if (recorded && tradeId != null) {
    const result = replayTrade(teams, recorded.assets, lookup, sameTeamName);
    if (result) {
      teams = result.teams;
      replay = {
        tradeId,
        status: recorded.row.status,
        acceptedAt: recorded.row.accepted_at,
        processedAt: recorded.row.processed_at,
        trade: result.trade,
        missing: result.missing,
      };
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  return {
    teams,
    capPerTeam: CAP_PER_TEAM,
    rosterSpots: ROSTER_SPOTS,
    remainingFraction: remainingSeasonFraction(today, matchups),
    window,
    replay,
  };
}
