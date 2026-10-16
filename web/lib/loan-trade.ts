/**
 * Cap-loan trade valuation — what a trade that carries a cap loan is worth to
 * each side, priced from first principles.
 *
 * ## The decomposition
 *
 * A loan expires at the end of the regular season, and every team starts the
 * next season at a clean $400 with no carried penalties. So a loan trade splits
 * into two things that can be valued separately:
 *
 * 1. **This season.** The players change hands and the loan moves cap from the
 *    lender to the borrower. Everything here is worth exactly what it does to
 *    each team's chance of winning *this* title, so it is priced by simulating
 *    the rest of the season and the playoffs, before and after the trade.
 * 2. **Next season onward.** The loan is gone; only the players carry over.
 *    Because offseason cuts are free, a player is worth his keeper surplus
 *    (value − raised salary) when that is positive and nothing when it is not —
 *    a call option, not an expectation. A rebuilder taking volatile young
 *    players is buying those options.
 *
 * The one input that cannot be derived is how many dollars of future keeper
 * surplus a whole title is worth to a manager (`titleValue`); everything else
 * converts to it.
 *
 * Pure functions only — the page fetches rosters, projections and the schedule
 * and hands them in. See docs/references/loan-trades.md for the method and its
 * limits.
 */

import { PLAYOFF_TEAMS } from "./config";
import { optimizeLineup, lineupTotal, type LineupPlayer } from "./lineup";
import type { Matchup } from "./standings";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One rostered player, as the calculator needs him. */
export interface LoanTradePlayer {
  player_id: string;
  name: string;
  position: string;
  nfl_team: string;
  team_name: string;
  /** Current salary. */
  salary: number;
  /** Projected points per game for the rest of this season. */
  ppg: number;
  /** Projected full-season dollar value (web/lib/surplus.ts). */
  dollar_value: number;
}

export interface LoanTradeProposal {
  /** Team receiving cap this season. */
  borrower: string;
  /** Team sending cap this season. */
  lender: string;
  /** Player ids moving lender → borrower. */
  toBorrower: string[];
  /** Player ids moving borrower → lender. */
  toLender: string[];
  /** Cap loaned, lender → borrower, in dollars. */
  loan: number;
}

export interface LoanTradeSettings {
  /** Dollars of future keeper surplus one whole title is worth. */
  titleValue: number;
  /**
   * What the lender would otherwise get from one dollar of this season's cap
   * (an in-season auction, absorbing salary elsewhere). Near zero for a
   * rebuilder at the deadline.
   */
  lenderCapValue: number;
  /** Seasons of keeper value to count. */
  keeperYears: number;
  /** Discount applied to each later season's keeper value. */
  keeperDiscount: number;
  /** Uncertainty in a player's future value, as a share of his value. */
  valueUncertainty: number;
  /** Floor on that uncertainty, in dollars. */
  minValueSd: number;
  /** Salary added each season a player is kept (raise + expected arbitration). */
  annualRaise: number;
  /** Standard deviation of one team's weekly score around its projection. */
  weeklySd: number;
  simulations: number;
  seed: number;
}

/**
 * Weekly score spread to assume before enough games are final to measure it
 * (see {@link estimateWeeklySd}). Roughly what a superflex half-PPR lineup
 * swings week to week.
 */
export const FALLBACK_WEEKLY_SD = 25;

export const DEFAULT_LOAN_SETTINGS: Omit<LoanTradeSettings, "annualRaise" | "weeklySd"> = {
  titleValue: 100,
  lenderCapValue: 0,
  keeperYears: 2,
  keeperDiscount: 0.75,
  valueUncertainty: 0.4,
  minValueSd: 5,
  simulations: 4000,
  seed: 1,
};

// ---------------------------------------------------------------------------
// Random numbers
// ---------------------------------------------------------------------------

/**
 * mulberry32 + Box–Muller. `SeededRandom` in simulation.ts has a period of
 * 233,280, which a season simulation exhausts several times over; a repeating
 * stream would make "before" and "after" share artefacts rather than luck.
 */
export function makeNormal(seed: number): () => number {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    const u1 = uniform() || 1e-12;
    const u2 = uniform();
    const r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  };
}

// ---------------------------------------------------------------------------
// This season: title odds
// ---------------------------------------------------------------------------

/** Projected weekly score of a roster: its best lineup by projected PPG. */
export function projectedWeeklyPoints(roster: readonly LoanTradePlayer[]): number {
  const players: LineupPlayer[] = roster.map((p) => ({
    player_id: p.player_id,
    name: p.name,
    position: p.position,
    nfl_team: p.nfl_team,
    ppg: p.ppg,
    projected_ppg: p.ppg,
  }));
  const map = new Map(players.map((p) => [p.player_id, p]));
  return lineupTotal(optimizeLineup(players, "projected"), map, "projected");
}

export interface SeasonState {
  teams: string[];
  /** Results already banked. */
  record: Map<string, { wins: number; points_for: number }>;
  /** Regular-season games still to play, as [home, away] team names. */
  remaining: [string, string][];
}

/**
 * Where the season stands, from the game log. Ties count half a win — the
 * standings tiebreak (wins, then points for) is all the simulation needs.
 */
export function seasonStateFromMatchups(matchups: readonly Matchup[]): SeasonState {
  const regular = matchups.filter((m) => m.game_type === "regular");
  const teams = [...new Set(regular.flatMap((m) => [m.home_team_name, m.away_team_name]))].sort();
  const record = new Map(teams.map((t) => [t, { wins: 0, points_for: 0 }]));
  const remaining: [string, string][] = [];
  for (const m of regular) {
    if (m.status === "final" && m.home_score != null && m.away_score != null) {
      const home = record.get(m.home_team_name)!;
      const away = record.get(m.away_team_name)!;
      home.points_for += m.home_score;
      away.points_for += m.away_score;
      if (m.home_score > m.away_score) home.wins += 1;
      else if (m.away_score > m.home_score) away.wins += 1;
      else {
        home.wins += 0.5;
        away.wins += 0.5;
      }
    } else {
      remaining.push([m.home_team_name, m.away_team_name]);
    }
  }
  return { teams, record, remaining };
}

/**
 * Spread of a team's weekly score around its own average, pooled across teams
 * from final regular-season games. Returns null with too few games to trust.
 */
export function estimateWeeklySd(matchups: readonly Matchup[], minGamesPerTeam = 3): number | null {
  const scores = new Map<string, number[]>();
  for (const m of matchups) {
    if (m.game_type !== "regular" || m.status !== "final") continue;
    if (m.home_score == null || m.away_score == null) continue;
    (scores.get(m.home_team_name) ?? scores.set(m.home_team_name, []).get(m.home_team_name)!).push(m.home_score);
    (scores.get(m.away_team_name) ?? scores.set(m.away_team_name, []).get(m.away_team_name)!).push(m.away_score);
  }
  let ss = 0;
  let dof = 0;
  for (const s of scores.values()) {
    if (s.length < minGamesPerTeam) return null;
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    ss += s.reduce((a, b) => a + (b - mean) ** 2, 0);
    dof += s.length - 1;
  }
  return dof > 0 ? Math.sqrt(ss / dof) : null;
}

/**
 * Bracket order for a single-elimination field of `size` (a power of two):
 * 1 v size, then the halves arranged so the top two seeds meet only in the final.
 */
export function bracketOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

export interface TitleOdds {
  title: Map<string, number>;
  playoffs: Map<string, number>;
}

/**
 * Monte Carlo the rest of the regular season and a single-elimination playoff.
 *
 * Every team scores N(mean, sd) each week. Seeds come from wins then points
 * for; the top `slots` teams make the playoffs, top seeds take any byes, and
 * the bracket is fixed (no reseeding).
 *
 * The random stream is consumed in the same order whatever the means are, so
 * two calls with the same seed share their luck — the difference between
 * "before" and "after" a trade is the trade, not noise.
 */
export function simulateTitleOdds(
  state: SeasonState,
  means: Map<string, number>,
  sd: number,
  simulations: number,
  seed: number,
  slots: number = PLAYOFF_TEAMS,
): TitleOdds {
  const normal = makeNormal(seed);
  const { teams } = state;
  const idx = new Map(teams.map((t, i) => [t, i]));
  const mean = teams.map((t) => means.get(t) ?? 0);
  const baseWins = teams.map((t) => state.record.get(t)?.wins ?? 0);
  const basePf = teams.map((t) => state.record.get(t)?.points_for ?? 0);
  const games = state.remaining.map(([h, a]) => [idx.get(h)!, idx.get(a)!]);
  const field = Math.min(slots, teams.length);
  const size = 2 ** Math.ceil(Math.log2(Math.max(field, 2)));
  const order = bracketOrder(size);

  const titles = new Array(teams.length).fill(0);
  const made = new Array(teams.length).fill(0);
  const wins = new Array(teams.length);
  const pf = new Array(teams.length);
  const score = (t: number) => mean[t] + sd * normal();

  for (let s = 0; s < simulations; s++) {
    for (let t = 0; t < teams.length; t++) {
      wins[t] = baseWins[t];
      pf[t] = basePf[t];
    }
    for (const [h, a] of games) {
      const hs = score(h);
      const as = score(a);
      pf[h] += hs;
      pf[a] += as;
      if (hs > as) wins[h] += 1;
      else wins[a] += 1;
    }
    const seeded = teams
      .map((_, t) => t)
      .sort((x, y) => wins[y] - wins[x] || pf[y] - pf[x])
      .slice(0, field);
    for (const t of seeded) made[t] += 1;

    // A seed beyond the field is a bye for its opponent.
    let round: (number | null)[] = order.map((seedNo) => seeded[seedNo - 1] ?? null);
    while (round.length > 1) {
      const next: (number | null)[] = [];
      for (let i = 0; i < round.length; i += 2) {
        const x = round[i];
        const y = round[i + 1];
        if (x == null || y == null) next.push(x ?? y);
        else next.push(score(x) >= score(y) ? x : y);
      }
      round = next;
    }
    if (round[0] != null) titles[round[0]] += 1;
  }

  return {
    title: new Map(teams.map((t, i) => [t, titles[i] / simulations])),
    playoffs: new Map(teams.map((t, i) => [t, made[i] / simulations])),
  };
}

// ---------------------------------------------------------------------------
// Next season onward: keeper options
// ---------------------------------------------------------------------------

/**
 * Expected future keeper surplus of one player, counting only the seasons he
 * would actually be kept.
 *
 * His value takes a random walk from today's projected dollar value; each
 * offseason his salary rises by `annualRaise` and he is kept only if his value
 * covers it. A cut is free (offseason cuts carry no penalty) and permanent —
 * re-buying him at auction costs market price, so no surplus. The expectation
 * is over simulated paths, so it prices the option, not the average.
 */
export function keeperOptionValue(
  dollarValue: number,
  salary: number,
  s: Pick<LoanTradeSettings, "keeperYears" | "keeperDiscount" | "valueUncertainty" | "minValueSd" | "annualRaise">,
  paths = 4000,
  seed = 1,
): number {
  if (s.keeperYears <= 0) return 0;
  const sd = Math.max(s.minValueSd, s.valueUncertainty * Math.abs(dollarValue));
  const normal = makeNormal(seed);
  let total = 0;
  for (let p = 0; p < paths; p++) {
    let value = dollarValue;
    let kept = true;
    let weight = 1;
    for (let y = 1; y <= s.keeperYears && kept; y++) {
      value += sd * normal();
      const surplus = value - (salary + s.annualRaise * y);
      if (surplus <= 0) kept = false;
      else total += weight * surplus;
      weight *= s.keeperDiscount;
    }
  }
  return total / paths;
}

// ---------------------------------------------------------------------------
// The whole trade
// ---------------------------------------------------------------------------

export interface MovingPlayer {
  player: LoanTradePlayer;
  keeperValue: number;
}

export interface SideValuation {
  team: string;
  role: "borrower" | "lender";
  received: MovingPlayer[];
  sent: MovingPlayer[];
  weeklyBefore: number;
  weeklyAfter: number;
  playoffsBefore: number;
  playoffsAfter: number;
  titleBefore: number;
  titleAfter: number;
  /** Title-odds change priced at `titleValue`. */
  thisSeasonValue: number;
  /** Keeper value received minus keeper value sent. */
  keeperValue: number;
  /** Lender only: what the loaned cap would otherwise have bought. */
  capCost: number;
  net: number;
  /** Salary on the roster after the trade, and the cap it must fit under. */
  payrollAfter: number;
  capAfter: number;
}

export interface LoanTradeValuation {
  borrower: SideValuation;
  lender: SideValuation;
  /** Both sides come out ahead. */
  worksForBoth: boolean;
  /** Gains from the deal: what the two sides can split. */
  jointGain: number;
  /** Lender's net keeper gain per loaned dollar, or null with no loan. */
  keeperPerLoanDollar: number | null;
}

/**
 * Value a loan trade for both sides.
 *
 * `players` is every rostered player in the league (so every team's lineup can
 * be projected); `capPerTeam` is the cap both teams start from before the loan.
 */
export function valueLoanTrade(
  proposal: LoanTradeProposal,
  players: readonly LoanTradePlayer[],
  state: SeasonState,
  settings: LoanTradeSettings,
  capPerTeam: number,
): LoanTradeValuation {
  const byId = new Map(players.map((p) => [p.player_id, p]));
  const moving = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((p): p is LoanTradePlayer => p != null);
  const toBorrower = moving(proposal.toBorrower);
  const toLender = moving(proposal.toLender);
  const movedTo = new Map<string, string>([
    ...toBorrower.map((p) => [p.player_id, proposal.borrower] as const),
    ...toLender.map((p) => [p.player_id, proposal.lender] as const),
  ]);

  const rosters = (after: boolean) => {
    const out = new Map<string, LoanTradePlayer[]>(state.teams.map((t) => [t, []]));
    for (const p of players) {
      const team = after ? (movedTo.get(p.player_id) ?? p.team_name) : p.team_name;
      out.get(team)?.push(p);
    }
    return out;
  };
  const before = rosters(false);
  const after = rosters(true);
  const means = (r: Map<string, LoanTradePlayer[]>) =>
    new Map([...r].map(([t, roster]) => [t, projectedWeeklyPoints(roster)]));
  const meansBefore = means(before);
  const meansAfter = means(after);

  const oddsBefore = simulateTitleOdds(state, meansBefore, settings.weeklySd, settings.simulations, settings.seed);
  const oddsAfter = simulateTitleOdds(state, meansAfter, settings.weeklySd, settings.simulations, settings.seed);

  // One seed per player so a player's keeper value doesn't depend on who else is in the deal.
  const withKeeper = (ps: LoanTradePlayer[]): MovingPlayer[] =>
    ps.map((p) => ({
      player: p,
      keeperValue: keeperOptionValue(p.dollar_value, p.salary, settings, 4000, hashSeed(p.player_id)),
    }));
  const toBorrowerK = withKeeper(toBorrower);
  const toLenderK = withKeeper(toLender);
  const sum = (ms: MovingPlayer[]) => ms.reduce((a, m) => a + m.keeperValue, 0);
  const payroll = (team: string) => (after.get(team) ?? []).reduce((a, p) => a + p.salary, 0);

  const side = (role: "borrower" | "lender"): SideValuation => {
    const team = role === "borrower" ? proposal.borrower : proposal.lender;
    const received = role === "borrower" ? toBorrowerK : toLenderK;
    const sent = role === "borrower" ? toLenderK : toBorrowerK;
    const titleBefore = oddsBefore.title.get(team) ?? 0;
    const titleAfter = oddsAfter.title.get(team) ?? 0;
    const thisSeasonValue = (titleAfter - titleBefore) * settings.titleValue;
    const keeperValue = sum(received) - sum(sent);
    const capCost = role === "lender" ? proposal.loan * settings.lenderCapValue : 0;
    return {
      team,
      role,
      received,
      sent,
      weeklyBefore: meansBefore.get(team) ?? 0,
      weeklyAfter: meansAfter.get(team) ?? 0,
      playoffsBefore: oddsBefore.playoffs.get(team) ?? 0,
      playoffsAfter: oddsAfter.playoffs.get(team) ?? 0,
      titleBefore,
      titleAfter,
      thisSeasonValue,
      keeperValue,
      capCost,
      net: thisSeasonValue + keeperValue - capCost,
      payrollAfter: payroll(team),
      capAfter: capPerTeam + (role === "borrower" ? proposal.loan : -proposal.loan),
    };
  };

  const borrower = side("borrower");
  const lender = side("lender");
  return {
    borrower,
    lender,
    worksForBoth: borrower.net >= 0 && lender.net >= 0,
    jointGain: borrower.net + lender.net,
    keeperPerLoanDollar: proposal.loan > 0 ? lender.keeperValue / proposal.loan : null,
  };
}

/** Stable small seed from an id string. */
function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
