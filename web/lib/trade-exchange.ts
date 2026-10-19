/**
 * Inputs for the trade exchange-rate fit (scripts/trade_exchange/) — pure.
 *
 * The fit asks how much keeper value a team gives up per dollar of this-season
 * value, as a function of its playoff odds when it traded. This module turns
 * the /trades valuations into one row per trade side, and supplies the playoff
 * odds **as they stood when the trade processed**:
 *
 * - The season's game log is rewound to the trade day: every game whose
 *   fantasy week had not ended is put back to "scheduled".
 * - Each team's weekly mean is its points per game so far, shrunk toward last
 *   season's PPG with `PRIOR_GAMES` pseudo-games (toward this season's league
 *   average when last season's schedule is not stored). An offseason trade
 *   runs on last season's PPG alone, which is what managers were judging by
 *   (the same rule as `standingAt`); with no last season either, its odds are
 *   unknown (an empty map), not a coin flip.
 * - The rest is `simulateSeason` unchanged (seeded, so reproducible).
 *
 * No historical weekly lineup projections are stored, so this is coarser than
 * the live /playoff-odds page (which projects optimal lineups). See
 * docs/references/trade-exchange-rate.md.
 */

import { simulateSeason, buildScoreModels, type TeamProjection } from "./playoff-odds";
import { computeStandings, type Matchup } from "./standings";
import { tradeTime, weeksPlayedBefore, type TradeValuation, type AssetValue } from "./trades";

/** Pseudo-games of last season's PPG blended into this season's. */
export const PRIOR_GAMES = 4;
/** Fewer simulations than the live page: ~1 point of error on a 50% probability. */
export const EXCHANGE_SIMULATIONS = 2000;

/** The season as it stood on `day` (YYYY-MM-DD): unfinished weeks reset. */
export function rewindMatchups(matchups: readonly Matchup[], day: string): Matchup[] {
  return matchups.map((m) =>
    m.ends_on != null && m.ends_on < day
      ? m
      : { ...m, status: "scheduled", home_score: null, away_score: null },
  );
}

function ppgByTeam(matchups: readonly Matchup[]): Map<number, { points: number; games: number }> {
  const out = new Map<number, { points: number; games: number }>();
  const add = (id: number, pts: number | null) => {
    if (pts == null) return;
    const cur = out.get(id) ?? { points: 0, games: 0 };
    cur.points += pts;
    cur.games += 1;
    out.set(id, cur);
  };
  for (const m of matchups) {
    if (m.game_type !== "regular" || m.status !== "final") continue;
    add(m.home_team_id, m.home_score);
    add(m.away_team_id, m.away_score);
  }
  return out;
}

export interface OddsOptions {
  simulations?: number;
  /** Playoff spots; defaults to the league's. */
  slots?: number;
}

export interface TeamOddsAtTrade {
  team_id: number;
  playoff_odds: number;
  expected_wins: number;
  /** Rank in the standings from games finished before the trade (all tied → table order). */
  rank: number;
  wins: number;
  losses: number;
}

/**
 * Every team's playoff odds on `day`, from the rewound season. Keyed by team
 * name as it appears in that season's matchups. Empty when the season has no
 * schedule stored.
 */
export function oddsOnDay(
  seasonMatchups: readonly Matchup[],
  prevSeasonMatchups: readonly Matchup[],
  day: string,
  options: OddsOptions = {},
): Map<string, TeamOddsAtTrade> {
  const regular = seasonMatchups.filter((m) => m.game_type === "regular");
  if (regular.length === 0) return new Map();
  const rewound = rewindMatchups(regular, day);
  const now = ppgByTeam(rewound);
  const prev = ppgByTeam(prevSeasonMatchups);
  const leaguePpg = (rows: Map<number, { points: number; games: number }>) => {
    const all = [...rows.values()];
    const games = all.reduce((s, t) => s + t.games, 0);
    return games > 0 ? all.reduce((s, t) => s + t.points, 0) / games : NaN;
  };
  // Shrink toward last season's PPG; with no last season stored, toward this
  // season's league average so far. With neither, there is nothing to rate a
  // team on, and the odds are unknown rather than a coin-flip artefact.
  const prevLeague = leaguePpg(prev);
  const fallback = Number.isNaN(prevLeague) ? leaguePpg(now) : prevLeague;
  if (Number.isNaN(fallback)) return new Map();

  const ids = new Set(rewound.flatMap((m) => [m.home_team_id, m.away_team_id]));
  const projections = new Map<number, TeamProjection>();
  for (const id of ids) {
    const p = prev.get(id);
    const priorPpg = p && p.games > 0 ? p.points / p.games : fallback;
    const own = now.get(id);
    const n = own?.games ?? 0;
    const ownPpg = n > 0 ? own!.points / n : 0;
    projections.set(id, { rate: (n * ownPpg + PRIOR_GAMES * priorPpg) / (n + PRIOR_GAMES) });
  }

  const models = buildScoreModels(rewound, projections);
  const sim = simulateSeason(rewound, models, {
    simulations: options.simulations ?? EXCHANGE_SIMULATIONS,
    slots: options.slots,
  });
  const standings = computeStandings(rewound);
  const name = new Map<number, string>();
  for (const m of rewound) {
    name.set(m.home_team_id, m.home_team_name);
    name.set(m.away_team_id, m.away_team_name);
  }
  const out = new Map<string, TeamOddsAtTrade>();
  for (const s of sim) {
    const row = standings.find((r) => r.team_id === s.team_id);
    out.set(name.get(s.team_id) ?? "", {
      team_id: s.team_id,
      playoff_odds: s.playoff_odds,
      expected_wins: s.expected_wins,
      rank: row?.rank ?? 0,
      wins: row?.wins ?? 0,
      losses: row?.losses ?? 0,
    });
  }
  return out;
}

export interface ExchangeAsset {
  player_id: string | null;
  name: string;
  position: string | null;
  salary: number;
  next_salary: number;
  is_college: boolean;
  /** Projected dollar value this season (full season, not prorated). */
  value: number | null;
  /** Next season's projected value, for the point fallback when no outlook exists. */
  next_value: number | null;
}

/** One side of one trade, as the Python fit reads it. */
export interface ExchangeSide {
  trade_key: string;
  ottoneu_trade_id: number | null;
  source: string;
  season: number;
  at: string;
  /** Regular-season weeks finished before the trade: the outlook's as-of week. */
  as_of_week: number | null;
  /** Share of the regular season left. */
  remaining: number | null;
  team: string;
  counterparty: string;
  season_net: number | null;
  cap_net: number;
  loan_out: number;
  loan_in: number;
  loans_known: boolean;
  gave: ExchangeAsset[];
  got: ExchangeAsset[];
  odds: TeamOddsAtTrade | null;
}

function asset(a: AssetValue): ExchangeAsset {
  return {
    player_id: a.asset.playerId,
    name: a.asset.name,
    position: a.asset.position,
    salary: a.asset.amount,
    next_salary: a.nextSalary,
    is_college: a.asset.isCollege,
    value: a.value,
    next_value: a.nextValue,
  };
}

/** Both sides of every trade, with each team's odds on the trade day. */
export function exchangeSides(
  valuations: readonly TradeValuation[],
  matchupsBySeason: ReadonlyMap<number, readonly Matchup[]>,
  options: OddsOptions = {},
): ExchangeSide[] {
  const oddsCache = new Map<string, Map<string, TeamOddsAtTrade>>();
  return valuations.flatMap((v) => {
    const at = tradeTime(v.trade);
    const day = at.slice(0, 10);
    const season = v.trade.season;
    const key = `${season}|${day}`;
    if (!oddsCache.has(key)) {
      oddsCache.set(key, oddsOnDay(
        matchupsBySeason.get(season) ?? [], matchupsBySeason.get(season - 1) ?? [], day, options,
      ));
    }
    const odds = oddsCache.get(key)!;
    const week = weeksPlayedBefore(at, matchupsBySeason.get(season) ?? []);
    return v.sides.map((s, i): ExchangeSide => ({
      trade_key: v.trade.key,
      ottoneu_trade_id: v.trade.ottoneuTradeId,
      source: v.trade.source,
      season,
      at,
      as_of_week: week,
      remaining: v.remaining,
      team: s.team,
      counterparty: v.sides[1 - i].team,
      season_net: s.seasonNet,
      cap_net: s.capNet,
      loan_out: s.loanOut,
      loan_in: s.loanIn,
      loans_known: v.trade.loansKnown,
      gave: s.gave.map(asset),
      got: s.got.map(asset),
      odds: odds.get(s.team) ?? null,
    }));
  });
}
