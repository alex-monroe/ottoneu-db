/**
 * Playoff odds: a Monte Carlo of the rest of the regular season.
 *
 * Pure — no database. `playoff-odds-data.ts` gathers the inputs (the game log,
 * each team's projected weekly score, live projections for games in progress)
 * and this module turns them into odds.
 *
 * ## The model
 *
 * Every team's score in a game it has yet to play is a normal draw:
 *
 * - **Mean** — its optimal-lineup projection for **that game's week** when one
 *   is supplied (the caller benches players on bye that week, so each 1v1
 *   matchup is drawn around what both sides can actually field), else a
 *   bye-neutral rest-of-season rate, falling back to its season-to-date points
 *   per game, and to the league's average PPG for a team with neither.
 * - **Spread** — the standard deviation of its own weekly scores so far,
 *   shrunk toward the league's pooled within-team spread. Five weeks of one
 *   team's scores is a noisy estimate of its spread; the shrinkage keeps a team
 *   that happened to score 120 four weeks running from being treated as a
 *   machine.
 * - **A game in progress** is drawn around its live projection (points scored
 *   plus what the starters still to play are projected for) with half the
 *   usual spread, since part of the result is already in.
 *
 * Final standings are ranked exactly as `computeStandings` ranks them — wins,
 * then points for — so a simulated season's seeding is the seeding the site
 * would actually show. Simulated ties in a game (continuous scores make them
 * vanishingly rare) count as neither a win nor a loss, as in the standings.
 *
 * ## Determinism and the buy/sell signal
 *
 * The generator is seeded, so the same inputs always give the same odds. The
 * buy/sell signal re-runs the season with one team's mean raised by `boost`
 * points per game, using the **same random draws** (common random numbers):
 * the only thing that differs between the two runs is that team's mean, so
 * the change in its odds is the effect of the upgrade rather than simulation
 * noise.
 */

import { PLAYOFF_TEAMS } from "./config";
import { computeStandings, type Matchup } from "./standings";
import type {
  DeadlineSignal,
  PlayoffOdds,
  ProjectedGame,
  ScoreMeanSource,
  TeamPlayoffOdds,
} from "./types";

/** Seasons simulated per scenario. ~0.7 points of error on a 50% probability. */
export const DEFAULT_SIMULATIONS = 5000;
export const DEFAULT_SEED = 20261201;
/** A typical deadline upgrade: one starter swapped for a better one. */
export const DEFAULT_BOOST_PPG = 5;

/** Pseudo-observations of the pooled spread blended into each team's own. */
const SD_PRIOR_WEIGHT = 4;
/** Weekly spread as a share of the mean when no team has two scores yet. */
const FALLBACK_CV = 0.2;
/** Spread of a game already under way, relative to an unplayed one. */
const LIVE_SD_SHARE = 0.5;
/** A team whose odds stay under this even after the upgrade is a seller. */
const SELLER_CEILING = 0.15;
/** An upgrade that moves the odds at least this much makes a team a buyer. */
const BUYER_MIN_GAIN = 0.08;
/** Above this a team is in already; an upgrade buys a seed, not a spot. */
const LOCK_FLOOR = 0.95;

/** A team's projected weekly score, from its optimal lineup. */
export interface TeamProjection {
  /** Bye-neutral rest-of-season rate, used for any week without its own entry. */
  rate: number;
  /** A specific week's projection (byes and all), when the caller has one. */
  byWeek?: Map<number, number>;
}

export interface TeamScoreModel {
  team_id: number;
  team_name: string;
  mean: number;
  byWeek: Map<number, number>;
  sd: number;
  source: ScoreMeanSource;
}

/** A game in progress, drawn around its live projection rather than from scratch. */
export interface LiveMeans {
  home: number;
  away: number;
}

/** A regular-season game that has not yet decided anybody's record. */
function isOpen(m: Matchup): boolean {
  return (
    m.game_type === "regular" &&
    !(m.status === "final" && m.home_score != null && m.away_score != null)
  );
}

function isDecided(m: Matchup): boolean {
  return m.game_type === "regular" && !isOpen(m);
}

function variance(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1);
}

/**
 * Each team's weekly score distribution.
 *
 * @param projections Optimal-lineup projections keyed by team_id. A team
 *   missing here (or projected at 0 — no roster data) falls back to its PPG.
 */
export function buildScoreModels(
  matchups: Matchup[],
  projections: Map<number, TeamProjection> = new Map(),
): Map<number, TeamScoreModel> {
  const names = new Map<number, string>();
  const scores = new Map<number, number[]>();
  for (const m of matchups) {
    names.set(m.home_team_id, m.home_team_name);
    names.set(m.away_team_id, m.away_team_name);
    if (!scores.has(m.home_team_id)) scores.set(m.home_team_id, []);
    if (!scores.has(m.away_team_id)) scores.set(m.away_team_id, []);
    if (!isDecided(m)) continue;
    scores.get(m.home_team_id)!.push(m.home_score as number);
    scores.get(m.away_team_id)!.push(m.away_score as number);
  }

  const all = [...scores.values()].flat();
  const leagueMean = all.length > 0 ? all.reduce((s, x) => s + x, 0) / all.length : 0;

  // Pooled within-team variance: each team's spread around its own mean, so
  // the gap between a strong and a weak team does not inflate everyone's spread.
  let ss = 0;
  let df = 0;
  for (const xs of scores.values()) {
    const v = variance(xs);
    if (!Number.isNaN(v)) {
      ss += v * (xs.length - 1);
      df += xs.length - 1;
    }
  }
  const pooledVar = df > 0 ? ss / df : NaN;

  const models = new Map<number, TeamScoreModel>();
  for (const [teamId, xs] of scores) {
    const proj = projections.get(teamId);
    let mean: number;
    let source: ScoreMeanSource;
    if (proj && proj.rate > 0) {
      mean = proj.rate;
      source = "projection";
    } else if (xs.length > 0) {
      mean = xs.reduce((s, x) => s + x, 0) / xs.length;
      source = "season_ppg";
    } else {
      mean = leagueMean;
      source = "league_average";
    }

    const own = variance(xs);
    const prior = Number.isNaN(pooledVar) ? (FALLBACK_CV * mean) ** 2 : pooledVar;
    const n = Number.isNaN(own) ? 0 : xs.length - 1;
    const v = (n * (Number.isNaN(own) ? 0 : own) + SD_PRIOR_WEIGHT * prior) / (n + SD_PRIOR_WEIGHT);

    const byWeek = new Map<number, number>();
    for (const [week, points] of proj?.byWeek ?? []) {
      if (points > 0) byWeek.set(week, points);
    }

    models.set(teamId, {
      team_id: teamId,
      team_name: names.get(teamId) ?? "",
      mean,
      byWeek,
      sd: Math.sqrt(Math.max(v, 0)),
      source,
    });
  }
  return models;
}

/** mulberry32 — small, fast, and a full 2^32 period (the LCG in simulation.ts repeats after 233,280 draws). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draws, Box-Muller, deterministic for a seed. */
function normalStream(seed: number): () => number {
  const uniform = mulberry32(seed);
  let spare: number | null = null;
  return () => {
    if (spare != null) {
      const z = spare;
      spare = null;
      return z;
    }
    const u1 = uniform() || Number.MIN_VALUE;
    const u2 = uniform();
    const r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  };
}

export interface SimulationOptions {
  simulations?: number;
  seed?: number;
  slots?: number;
  /** Live projections for games in progress, keyed by game_id. */
  liveMeans?: Map<number, LiveMeans>;
}

export interface SimulatedTeam {
  team_id: number;
  playoff_odds: number;
  top_seed_odds: number;
  expected_wins: number;
}

interface Boost {
  team_id: number;
  ppg: number;
}

interface GameParams {
  homeMean: number;
  awayMean: number;
  homeSd: number;
  awaySd: number;
  live: boolean;
}

/**
 * The two score distributions one open game is drawn from: each side's
 * projection for that game's week (its bye-week lineup included), or the live
 * projection for a game already under way.
 */
function gameParams(
  m: Matchup,
  models: Map<number, TeamScoreModel>,
  live: Map<number, LiveMeans>,
  boost?: Boost,
): GameParams {
  const hm = models.get(m.home_team_id);
  const am = models.get(m.away_team_id);
  const lv = m.status === "in_progress" ? live.get(m.game_id) : undefined;
  const weekly = (model: TeamScoreModel | undefined) =>
    model ? (model.byWeek.get(m.week) ?? model.mean) : 0;
  const bump = (teamId: number) => (!lv && boost?.team_id === teamId ? boost.ppg : 0);
  return {
    homeMean: (lv ? lv.home : weekly(hm)) + bump(m.home_team_id),
    awayMean: (lv ? lv.away : weekly(am)) + bump(m.away_team_id),
    homeSd: (hm?.sd ?? 0) * (lv ? LIVE_SD_SHARE : 1),
    awaySd: (am?.sd ?? 0) * (lv ? LIVE_SD_SHARE : 1),
    live: lv != null,
  };
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf; error < 1.5e-7). */
function normalCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-z * z);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Every regular-season game still to be decided, with each side's projected
 * score and the home side's chance of winning it. Exact for the simulation's
 * model — the difference of two independent normals is normal — so these are
 * the 1v1 odds the season simulation is built from, without its noise.
 */
export function projectGames(
  matchups: Matchup[],
  models: Map<number, TeamScoreModel>,
  liveMeans: Map<number, LiveMeans> = new Map(),
): ProjectedGame[] {
  const open = matchups.filter(isOpen).sort((a, b) => a.week - b.week);
  return open.map((m) => {
    const p = gameParams(m, models, liveMeans);
    const sd = Math.sqrt(p.homeSd ** 2 + p.awaySd ** 2);
    const diff = p.homeMean - p.awayMean;
    const homeWin = sd > 0 ? normalCdf(diff / sd) : diff > 0 ? 1 : diff < 0 ? 0 : 0.5;
    return {
      game_id: m.game_id,
      week: m.week,
      home_team_id: m.home_team_id,
      home_team_name: m.home_team_name,
      away_team_id: m.away_team_id,
      away_team_name: m.away_team_name,
      home_mean: p.homeMean,
      away_mean: p.awayMean,
      home_win_prob: homeWin,
      live: p.live,
    };
  });
}

/**
 * Simulate the rest of the regular season. Returns one row per team, in the
 * current standings order.
 *
 * `boost` raises one team's mean for every game not already under way — what
 * a trade made today would change.
 */
export function simulateSeason(
  matchups: Matchup[],
  models: Map<number, TeamScoreModel>,
  options: SimulationOptions = {},
  boost?: Boost,
): SimulatedTeam[] {
  const simulations = options.simulations ?? DEFAULT_SIMULATIONS;
  const slots = options.slots ?? PLAYOFF_TEAMS;
  const live = options.liveMeans ?? new Map<number, LiveMeans>();

  const standings = computeStandings(matchups);
  const n = standings.length;
  const index = new Map(standings.map((r, i) => [r.team_id, i]));
  const baseWins = standings.map((r) => r.wins);
  const basePf = standings.map((r) => r.points_for);

  // Flatten the open games into arrays: mean and sd per side, per game.
  const open = matchups.filter(isOpen);
  const g = open.length;
  const homeIdx = new Int32Array(g);
  const awayIdx = new Int32Array(g);
  const homeMean = new Float64Array(g);
  const awayMean = new Float64Array(g);
  const homeSd = new Float64Array(g);
  const awaySd = new Float64Array(g);
  open.forEach((m, k) => {
    homeIdx[k] = index.get(m.home_team_id)!;
    awayIdx[k] = index.get(m.away_team_id)!;
    const p = gameParams(m, models, live, boost);
    homeMean[k] = p.homeMean;
    awayMean[k] = p.awayMean;
    homeSd[k] = p.homeSd;
    awaySd[k] = p.awaySd;
  });

  const z = normalStream(options.seed ?? DEFAULT_SEED);
  const wins = new Float64Array(n);
  const pf = new Float64Array(n);
  const order = Array.from({ length: n }, (_, i) => i);
  const playoffs = new Float64Array(n);
  const topSeed = new Float64Array(n);
  const winTotal = new Float64Array(n);
  const cut = Math.min(slots, n);

  for (let s = 0; s < simulations; s++) {
    for (let i = 0; i < n; i++) {
      wins[i] = baseWins[i];
      pf[i] = basePf[i];
    }
    for (let k = 0; k < g; k++) {
      // Both draws always happen, in the same order, so every scenario sees
      // the same random numbers — see "common random numbers" above.
      const hs = homeMean[k] + homeSd[k] * z();
      const as = awayMean[k] + awaySd[k] * z();
      pf[homeIdx[k]] += hs;
      pf[awayIdx[k]] += as;
      if (hs > as) wins[homeIdx[k]]++;
      else if (as > hs) wins[awayIdx[k]]++;
    }
    // Same ranking as computeStandings: wins, then points for. The final
    // fallback (current standings order) stands in for its alphabetical one.
    order.sort((a, b) => wins[b] - wins[a] || pf[b] - pf[a] || a - b);
    for (let r = 0; r < cut; r++) playoffs[order[r]]++;
    topSeed[order[0]]++;
    for (let i = 0; i < n; i++) winTotal[i] += wins[i];
  }

  return standings.map((row, i) => ({
    team_id: row.team_id,
    playoff_odds: playoffs[i] / simulations,
    top_seed_odds: topSeed[i] / simulations,
    expected_wins: winTotal[i] / simulations,
  }));
}

/** Buy, sell or hold, from a team's odds now and with the upgrade. */
export function deadlineSignal(odds: number, boostedOdds: number): DeadlineSignal {
  if (boostedOdds < SELLER_CEILING) return "seller";
  if (odds < LOCK_FLOOR && boostedOdds - odds >= BUYER_MIN_GAIN) return "buyer";
  return "hold";
}

export interface PlayoffOddsOptions extends SimulationOptions {
  boostPpg?: number;
  tradeDeadline?: string | null;
  /** YYYY-MM-DD, compared against the deadline. */
  today?: string;
  projectionWeek?: number | null;
}

/**
 * Playoff odds, #1-seed odds, expected wins and a buy/sell signal for every
 * team. One base run plus one boosted run per team.
 */
export function computePlayoffOdds(
  matchups: Matchup[],
  models: Map<number, TeamScoreModel>,
  options: PlayoffOddsOptions = {},
): PlayoffOdds {
  const simulations = options.simulations ?? DEFAULT_SIMULATIONS;
  const seed = options.seed ?? DEFAULT_SEED;
  const slots = options.slots ?? PLAYOFF_TEAMS;
  const boostPpg = options.boostPpg ?? DEFAULT_BOOST_PPG;
  const sim = { ...options, simulations, seed, slots };

  const base = simulateSeason(matchups, models, sim);
  const teams: TeamPlayoffOdds[] = base.map((row) => {
    const boosted = simulateSeason(matchups, models, sim, { team_id: row.team_id, ppg: boostPpg })
      .find((r) => r.team_id === row.team_id)!;
    const model = models.get(row.team_id);
    return {
      team_id: row.team_id,
      team_name: model?.team_name ?? "",
      playoff_odds: row.playoff_odds,
      top_seed_odds: row.top_seed_odds,
      expected_wins: row.expected_wins,
      weekly_mean: model?.mean ?? 0,
      weekly_sd: model?.sd ?? 0,
      mean_source: model?.source ?? "league_average",
      boosted_playoff_odds: boosted.playoff_odds,
      odds_gain: boosted.playoff_odds - row.playoff_odds,
      signal: deadlineSignal(row.playoff_odds, boosted.playoff_odds),
    };
  });

  const deadline = options.tradeDeadline ?? null;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  return {
    season: matchups[0]?.season ?? 0,
    simulations,
    seed,
    slots,
    boost_ppg: boostPpg,
    games_remaining: matchups.filter(isOpen).length,
    trade_deadline: deadline,
    signal_active: deadline != null && today <= deadline,
    projection_week: options.projectionWeek ?? null,
    teams,
    games: projectGames(matchups, models, options.liveMeans),
  };
}

/**
 * "62%". The ends never print as 0% or 100%: a simulation that never saw a
 * team make it has not proved it cannot — that is what the arithmetic
 * clinched/eliminated flags are for.
 */
export function formatOdds(p: number): string {
  if (p < 0.01) return "<1%";
  if (p > 0.99) return ">99%";
  return `${Math.round(p * 100)}%`;
}
