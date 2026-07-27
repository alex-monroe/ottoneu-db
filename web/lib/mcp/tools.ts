/**
 * MCP tool registry for the remote league-data server.
 *
 * Each tool composes the existing data layer (lib/data, lib/analysis,
 * lib/roster-reconstruction, …) and the pure calculators (lib/surplus,
 * lib/mcp/arb, lib/arb-progress) — no math is reimplemented here. All tools
 * are read-only and use the anon Supabase client (every table they touch has
 * an anon SELECT policy).
 *
 * The route handler (app/api/mcp/[transport]/route.ts) registers this array;
 * tests call the handlers directly.
 */

import { z } from "zod";
import { supabase } from "../supabase";
import {
  LEAGUE_ID,
  NUM_TEAMS,
  CAP_PER_TEAM,
  POSITIONS,
  SCORING_SETTINGS,
  MIN_GAMES,
  ARB_BUDGET_PER_TEAM,
  ARB_MIN_PER_TEAM,
  ARB_MAX_PER_TEAM,
  ARB_MAX_PER_PLAYER_PER_TEAM,
  ARB_MAX_PER_PLAYER_LEAGUE,
} from "../config";
import { getSeasonContextNow } from "../season";
import {
  fetchPlayerList,
  fetchPlayerDetail,
  fetchPlayerProjection,
  fetchDraftSharksValue,
  fetchPlayersEndOfSeason,
  fetchPlayersPreArb,
  fetchActiveProjectionModel,
} from "../data";
import { fetchProjectionBoard } from "../analysis";
import { fetchRosterData, reconstructRostersAtDate } from "../roster-reconstruction";
import { calculateSurplus, computeDollarPerVorp } from "../surplus";
import { analyzeArbTargets } from "./arb";
import {
  buildAllocations,
  applyProjectedRaises,
  buildTeamRaiseTotals,
  buildTeamSpending,
  type AllocationRow,
  type AllocationDetailRow,
  type TeamStatus,
} from "../arb-progress";
import {
  fetchAvailableDepthChartSeasons,
  fetchDepthChartsForSeason,
} from "../depth-charts";
import { fetchAvailableSeasons, fetchVegasLinesForSeason } from "../vegas-lines";
import { round, clampLimit, jsonResult, errorResult, type McpToolResult } from "./format";
import {
  emptyShape,
  getRostersShape,
  searchPlayersShape,
  getPlayerShape,
  getTransactionsShape,
  getProjectionsShape,
  getPlayerValuesShape,
  getArbitrationAnalysisShape,
  getDepthChartShape,
  getVegasLinesShape,
} from "./schemas";

export interface McpToolDef {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  handler: (args: unknown) => Promise<McpToolResult>;
}

const LEAGUE_BLURB = `Ottoneu fantasy football League ${LEAGUE_ID}: ${NUM_TEAMS} teams, superflex (2 QBs startable), half-PPR, $${CAP_PER_TEAM} salary cap with year-round rosters.`;

function sameTeam(a: string | null | undefined, b: string): boolean {
  return (a ?? "").toLowerCase() === b.toLowerCase();
}

// ─── Tool handlers ───────────────────────────────────────────────────────────

async function getLeagueOverview(): Promise<McpToolResult> {
  const [ctx, model] = await Promise.all([
    getSeasonContextNow(),
    fetchActiveProjectionModel(),
  ]);
  return jsonResult({
    league: LEAGUE_BLURB,
    league_id: LEAGUE_ID,
    num_teams: NUM_TEAMS,
    salary_cap: CAP_PER_TEAM,
    positions: POSITIONS,
    scoring_settings: SCORING_SETTINGS,
    arbitration_rules: {
      budget_per_team: ARB_BUDGET_PER_TEAM,
      min_per_opponent: ARB_MIN_PER_TEAM,
      max_per_opponent: ARB_MAX_PER_TEAM,
      max_per_player_per_team: ARB_MAX_PER_PLAYER_PER_TEAM,
      max_per_player_league_wide: ARB_MAX_PER_PLAYER_LEAGUE,
    },
    season_context: {
      phase: ctx.phase,
      league_season: ctx.leagueSeason,
      stats_season: ctx.statsSeason,
      projection_season: ctx.projectionSeason,
      arbitration_season: ctx.arbitrationSeason,
      arb_window_open: ctx.arbWindowOpen,
      deadlines: ctx.deadlines,
      next_boundary: ctx.nextBoundary,
    },
    active_projection_model: model
      ? { name: model.name, version: model.version, description: model.description }
      : null,
  });
}

async function getLeagueCalendar(): Promise<McpToolResult> {
  const { data, error } = await supabase
    .from("league_calendar")
    .select(
      "season, season_start, arb_start, arb_end, keeper_deadline, auction_date, regular_season_start, trade_deadline, last_auction_date",
    )
    .eq("league_id", LEAGUE_ID)
    .order("season", { ascending: false });
  if (error) return errorResult(`league_calendar query failed: ${error.message}`);
  return jsonResult({ league_id: LEAGUE_ID, seasons: data ?? [] });
}

async function getRosters(rawArgs: unknown): Promise<McpToolResult> {
  const args = z.object(getRostersShape).parse(rawArgs);
  const targetDate = args.as_of_date ?? new Date().toISOString().slice(0, 10);
  const data = await fetchRosterData();
  const rosters = reconstructRostersAtDate(
    data.transactions,
    data.players,
    data.stats,
    targetDate,
    data.leaguePrices,
  );

  let selected = rosters;
  if (args.team_name) {
    const match = rosters.find((r) => sameTeam(r.team_name, args.team_name!));
    if (!match) {
      return errorResult(
        `No team named "${args.team_name}". Teams: ${rosters.map((r) => r.team_name).join(", ")}`,
      );
    }
    selected = [match];
  }

  return jsonResult({
    as_of_date: targetDate,
    salary_cap: CAP_PER_TEAM,
    teams: selected.map((r) => ({
      team_name: r.team_name,
      total_salary: r.total_salary,
      cap_space: r.cap_space,
      players: r.players.map((p) => ({
        name: p.name,
        position: p.position,
        nfl_team: p.nfl_team,
        salary: p.salary,
        ppg: round(p.ppg),
        games_played: p.games_played,
      })),
    })),
  });
}

async function searchPlayers(rawArgs: unknown): Promise<McpToolResult> {
  const args = z.object(searchPlayersShape).parse(rawArgs);
  const limit = clampLimit(args.limit, 10, 50);
  const q = args.query.toLowerCase();
  const list = await fetchPlayerList();
  const matches = list
    .filter(
      (p) =>
        p.name.toLowerCase().includes(q) &&
        (!args.position || p.position === args.position) &&
        (!args.rostered_only || (p.team_name && p.team_name !== "FA")),
    )
    .sort((a, b) => (b.total_points ?? -1) - (a.total_points ?? -1))
    .slice(0, limit);
  return jsonResult({
    count: matches.length,
    players: matches.map((p) => ({
      ottoneu_id: p.ottoneu_id,
      name: p.name,
      position: p.position,
      nfl_team: p.nfl_team,
      fantasy_team: p.team_name,
      salary: p.price,
      ppg: round(p.ppg),
      total_points: round(p.total_points),
      games_played: p.games_played,
    })),
  });
}

async function getPlayer(rawArgs: unknown): Promise<McpToolResult> {
  const args = z.object(getPlayerShape).parse(rawArgs);
  if ((args.ottoneu_id == null) === (args.name == null)) {
    return errorResult("Provide exactly one of ottoneu_id or name.");
  }

  let ottoneuId = args.ottoneu_id;
  if (ottoneuId == null) {
    const q = args.name!.toLowerCase();
    const list = await fetchPlayerList();
    const exact = list.filter((p) => p.name.toLowerCase() === q);
    const matches = exact.length > 0 ? exact : list.filter((p) => p.name.toLowerCase().includes(q));
    if (matches.length === 0) return errorResult(`No player matching "${args.name}".`);
    if (matches.length > 1) {
      return jsonResult({
        ambiguous: true,
        message: `Multiple players match "${args.name}" — call again with an ottoneu_id.`,
        candidates: matches.slice(0, 10).map((p) => ({
          ottoneu_id: p.ottoneu_id,
          name: p.name,
          position: p.position,
          nfl_team: p.nfl_team,
          fantasy_team: p.team_name,
        })),
      });
    }
    ottoneuId = matches[0].ottoneu_id;
  }

  const detail = await fetchPlayerDetail(ottoneuId);
  if (!detail) return errorResult(`No player with ottoneu_id ${ottoneuId}.`);

  const [projection, draftSharks] = await Promise.all([
    fetchPlayerProjection(detail.id),
    fetchDraftSharksValue(detail.id),
  ]);

  return jsonResult({
    ottoneu_id: detail.ottoneu_id,
    name: detail.name,
    position: detail.position,
    nfl_team: detail.nfl_team,
    birth_date: detail.birth_date,
    fantasy_team: detail.team_name,
    salary: detail.price,
    projection: projection
      ? { projected_ppg: round(projection.projected_ppg, 2), method: projection.projection_method }
      : null,
    auction_values: draftSharks,
    season_stats: detail.seasonStats.map((s) => ({
      season: s.season,
      total_points: round(s.total_points),
      games_played: s.games_played,
      ppg: round(s.ppg),
      pps: round(s.pps, 2),
    })),
    recent_transactions: detail.transactions.slice(0, 20).map((t) => ({
      date: t.transaction_date,
      type: t.transaction_type,
      team: t.team_name,
      from_team: t.from_team,
      salary: t.salary,
    })),
  });
}

interface TransactionRow {
  transaction_date: string | null;
  transaction_type: string;
  team_name: string | null;
  from_team: string | null;
  salary: number | null;
  season: number | null;
  players: { name: string; position: string | null } | { name: string; position: string | null }[] | null;
}

async function getTransactions(rawArgs: unknown): Promise<McpToolResult> {
  const args = z.object(getTransactionsShape).parse(rawArgs);
  const limit = clampLimit(args.limit, 25, 100);

  let query = supabase
    .from("transactions")
    .select("transaction_date, transaction_type, team_name, from_team, salary, season, players(name, position)")
    .eq("league_id", LEAGUE_ID);
  if (args.team_name) query = query.eq("team_name", args.team_name);
  if (args.type) query = query.ilike("transaction_type", `%${args.type}%`);
  if (args.since) query = query.gte("transaction_date", args.since);

  const { data, error } = await query
    .order("transaction_date", { ascending: false })
    .limit(limit);
  if (error) return errorResult(`transactions query failed: ${error.message}`);

  const rows = (data ?? []) as TransactionRow[];
  return jsonResult({
    count: rows.length,
    transactions: rows.map((t) => {
      const player = Array.isArray(t.players) ? t.players[0] : t.players;
      return {
        date: t.transaction_date,
        type: t.transaction_type,
        player: player?.name ?? null,
        position: player?.position ?? null,
        team: t.team_name,
        from_team: t.from_team,
        salary: t.salary,
        season: t.season,
      };
    }),
  });
}

async function getProjections(rawArgs: unknown): Promise<McpToolResult> {
  const args = z.object(getProjectionsShape).parse(rawArgs);
  const limit = clampLimit(args.limit, 25, 100);
  const ctx = await getSeasonContextNow();
  const board = await fetchProjectionBoard(ctx.projectionSeason, ctx.statsSeason);

  const rows = board
    .filter(
      (r) =>
        (!args.position || r.position === args.position) &&
        (args.team_name === undefined ||
          (args.team_name === "FA"
            ? r.team_name == null || r.team_name === "" || r.team_name === "FA"
            : sameTeam(r.team_name, args.team_name))),
    )
    .slice(0, limit);

  return jsonResult({
    projection_season: ctx.projectionSeason,
    stats_season: ctx.statsSeason,
    count: rows.length,
    players: rows.map((r) => ({
      overall_rank: r.overall_rank,
      position_rank: `${r.position}${r.position_rank}`,
      name: r.name,
      position: r.position,
      nfl_team: r.nfl_team,
      fantasy_team: r.team_name,
      salary: r.price,
      projected_ppg: round(r.projected_ppg, 2),
      observed_ppg: round(r.observed_ppg, 2),
      ppg_delta: round(r.ppg_delta, 2),
      method: r.projection_method,
      is_rookie: r.is_rookie,
      age: r.age,
    })),
  });
}

async function getPlayerValues(rawArgs: unknown): Promise<McpToolResult> {
  const args = z.object(getPlayerValuesShape).parse(rawArgs);
  const limit = clampLimit(args.limit, 25, 100);
  const players = await fetchPlayersEndOfSeason();
  const surplus = calculateSurplus(players);
  const dollarPerVorp = computeDollarPerVorp(players);

  const rows = surplus
    .filter(
      (p) =>
        (!args.position || p.position === args.position) &&
        (args.team_name === undefined || sameTeam(p.team_name, args.team_name)),
    )
    .sort((a, b) => b.dollar_value - a.dollar_value)
    .slice(0, limit);

  return jsonResult({
    methodology: `Dollar values allocate ~87.5% of total league cap ($${NUM_TEAMS * CAP_PER_TEAM}) across positive-VORP production (min ${MIN_GAMES} games). Surplus = dollar_value − salary.`,
    dollar_per_vorp: round(dollarPerVorp, 3),
    count: rows.length,
    players: rows.map((p) => ({
      name: p.name,
      position: p.position,
      nfl_team: p.nfl_team,
      fantasy_team: p.team_name,
      salary: p.price,
      dollar_value: p.dollar_value,
      surplus: p.surplus,
      vorp: round(p.full_season_vorp),
      ppg: round(p.ppg),
      games_played: p.games_played,
    })),
  });
}

async function getArbitrationAnalysis(rawArgs: unknown): Promise<McpToolResult> {
  const args = z.object(getArbitrationAnalysisShape).parse(rawArgs);
  const limit = clampLimit(args.limit, 30, 100);
  const players = await fetchPlayersPreArb();
  const surplus = calculateSurplus(players);
  const targets = analyzeArbTargets(surplus, args.exclude_team).slice(0, limit);

  return jsonResult({
    methodology: `Arbitration targets: rostered non-kickers (excluding ${args.exclude_team ?? "no team"}) in the surplus "danger zone", using pre-arbitration salaries. salary_after_arb assumes the max single-team raise of $${ARB_MAX_PER_PLAYER_PER_TEAM}. Each team allocates $${ARB_BUDGET_PER_TEAM} total: $${ARB_MIN_PER_TEAM}-$${ARB_MAX_PER_TEAM} per opponent.`,
    count: targets.length,
    targets: targets.map((t) => ({
      name: t.name,
      position: t.position,
      fantasy_team: t.team_name,
      salary: t.price,
      dollar_value: t.dollar_value,
      surplus: t.surplus,
      salary_after_arb: t.salary_after_arb,
      surplus_after_arb: t.surplus_after_arb,
      ppg: round(t.ppg),
    })),
  });
}

async function getArbitrationProgress(): Promise<McpToolResult> {
  const ctx = await getSeasonContextNow();
  const season = ctx.arbitrationSeason;
  const [teamsRes, allocationsRes, detailsRes] = await Promise.all([
    supabase
      .from("arbitration_progress_teams")
      .select("team_name, is_complete, scraped_at")
      .eq("league_id", LEAGUE_ID)
      .eq("season", season)
      .order("team_name"),
    supabase
      .from("arbitration_progress")
      .select("player_name, ottoneu_id, team_name, current_salary, raise_amount, new_salary")
      .eq("league_id", LEAGUE_ID)
      .eq("season", season)
      .order("raise_amount", { ascending: false }),
    supabase
      .from("arbitration_allocation_details")
      .select("ottoneu_id, player_name, owner_team_name, allocating_team_name, amount")
      .eq("league_id", LEAGUE_ID)
      .eq("season", season),
  ]);
  const err = teamsRes.error ?? allocationsRes.error ?? detailsRes.error;
  if (err) return errorResult(`arbitration progress query failed: ${err.message}`);

  const teams: TeamStatus[] = teamsRes.data ?? [];
  const allocations = buildAllocations(
    (allocationsRes.data ?? []) as AllocationRow[],
    new Map(),
  );
  applyProjectedRaises(allocations, teams);
  const raiseTotals = buildTeamRaiseTotals(allocations);
  const { entries } = buildTeamSpending((detailsRes.data ?? []) as AllocationDetailRow[]);

  return jsonResult({
    season,
    teams_complete: teams.filter((t) => t.is_complete).length,
    teams_total: teams.length,
    team_status: teams.map((t) => ({ team_name: t.team_name, is_complete: t.is_complete })),
    note: "projected_raise extrapolates final raises assuming remaining teams allocate at the same rate as completed ones.",
    top_raises: allocations.slice(0, 30).map((a) => ({
      player: a.name,
      team: a.team_name,
      current_salary: a.current_salary,
      raise_so_far: a.raise_amount,
      projected_raise: a.projected_raise,
      projected_salary: a.projected_salary,
    })),
    raises_received_by_team: Object.fromEntries(raiseTotals),
    spending_by_team: entries.map((e) => e.row),
  });
}

async function getDepthChart(rawArgs: unknown): Promise<McpToolResult> {
  const args = z.object(getDepthChartShape).parse(rawArgs);
  let season = args.season;
  if (season == null) {
    const seasons = await fetchAvailableDepthChartSeasons();
    if (seasons.length === 0) return errorResult("No depth chart data available.");
    season = seasons[0];
  }
  const rows = (await fetchDepthChartsForSeason(season))
    .filter(
      (r) =>
        (!args.nfl_team || r.team.toLowerCase() === args.nfl_team.toLowerCase()) &&
        (!args.position || r.position === args.position),
    )
    .sort((a, b) => a.team.localeCompare(b.team) || a.position.localeCompare(b.position) || a.depth_team - b.depth_team)
    .slice(0, 100);

  return jsonResult({
    season,
    note: "depth_team: 1 = starter, 2 = backup, 3 = deep reserve (opening-day nflverse depth charts)",
    count: rows.length,
    entries: rows.map((r) => ({
      name: r.name,
      team: r.team,
      position: r.position,
      depth_team: r.depth_team,
      prev_depth_team: r.prev_depth_team,
      projected_ppg: round(r.projected_ppg, 2),
    })),
  });
}

async function getVegasLines(rawArgs: unknown): Promise<McpToolResult> {
  const args = z.object(getVegasLinesShape).parse(rawArgs);
  let season = args.season;
  if (season == null) {
    const seasons = await fetchAvailableSeasons();
    if (seasons.length === 0) return errorResult("No Vegas lines data available.");
    season = seasons[0];
  }
  const rows = await fetchVegasLinesForSeason(season);
  return jsonResult({
    season,
    note: "Preseason implied point totals and win totals per NFL team (from nflverse betting lines).",
    teams: rows.map((r) => ({
      team: r.team,
      implied_total: round(r.implied_total, 1),
      win_total: round(r.win_total, 1),
    })),
  });
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "get_league_overview",
    description: `${LEAGUE_BLURB} Returns league settings, scoring, arbitration rules, the current season phase with deadlines, and the active projection model. Call this first to orient yourself.`,
    schema: emptyShape,
    handler: getLeagueOverview,
  },
  {
    name: "get_league_calendar",
    description: "All season boundary dates for the league (season start, arbitration window, keeper deadline, auction date, regular season start, trade deadline), one row per season.",
    schema: emptyShape,
    handler: getLeagueCalendar,
  },
  {
    name: "get_rosters",
    description: "Current (or historical, via transaction replay) roster of every fantasy team — or one team — with salaries, cap space, and per-player PPG from the most recent stats season.",
    schema: getRostersShape,
    handler: getRosters,
  },
  {
    name: "search_players",
    description: "Search players by name substring, optionally filtered by position or roster status. Returns identity, fantasy team, salary, and current-season fantasy stats.",
    schema: searchPlayersShape,
    handler: searchPlayers,
  },
  {
    name: "get_player",
    description: "Full detail for one player: identity, salary, fantasy team, season-by-season fantasy stats, active projection, auction value estimates, and recent transaction history. Look up by ottoneu_id or name.",
    schema: getPlayerShape,
    handler: getPlayer,
  },
  {
    name: "get_transactions",
    description: "League transaction log (adds, cuts, trades, auctions), newest first, with optional team/type/date filters.",
    schema: getTransactionsShape,
    handler: getTransactions,
  },
  {
    name: "get_projections",
    description: "Projected PPG board for the upcoming season from the league's active projection model, ranked overall and by position, including rookies. Compare against observed PPG from last season.",
    schema: getProjectionsShape,
    handler: getProjections,
  },
  {
    name: "get_player_values",
    description: "VORP-based dollar values and surplus (value minus salary) for players with current-season stats, using end-of-season salaries. The core keep/cut/trade valuation metric in this format.",
    schema: getPlayerValuesShape,
    handler: getPlayerValues,
  },
  {
    name: "get_arbitration_analysis",
    description: "Ranked arbitration targets: rostered players whose surplus survives (or nearly survives) the max arbitration raise, using pre-arbitration salaries. Pass exclude_team = your own team, since you cannot allocate against yourself.",
    schema: getArbitrationAnalysisShape,
    handler: getArbitrationAnalysis,
  },
  {
    name: "get_arbitration_progress",
    description: "Live scraped arbitration state for the current arbitration season: which teams have finished allocating, the biggest raises so far with projected finals, and per-team spending.",
    schema: emptyShape,
    handler: getArbitrationProgress,
  },
  {
    name: "get_depth_chart",
    description: "Opening-day NFL depth chart tiers (1 = starter) with prior-season tier and projected PPG, filterable by NFL team or position.",
    schema: getDepthChartShape,
    handler: getDepthChart,
  },
  {
    name: "get_vegas_lines",
    description: "Preseason Vegas implied point totals and win totals per NFL team — useful context for projecting player environments.",
    schema: getVegasLinesShape,
    handler: getVegasLines,
  },
];
