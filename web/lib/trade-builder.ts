/**
 * Judge a trade before you propose it.
 *
 * `/trades` values trades that already happened, on the model's preseason
 * projection. That is the right frame for history and the wrong one for a
 * deadline deal: in season the preseason model is withheld (#748), and the
 * question a manager actually has is "does this make my lineup better for the
 * weeks left, and what does it cost me next year?". So every number here comes
 * from **this season's production**, never a projection:
 *
 * - **Lineup** — the optimal Superflex starting lineup (`optimizeLineup`, the
 *   same greedy fill `/lineup` uses) scored on each player's season PPG, before
 *   and after. A trade that moves a bench player moves nothing here, which is
 *   the point: it is the number that wins weeks.
 * - **Rest of season** — each player's earned value (web/lib/earned-value.ts)
 *   scaled from the games played so far to a full season, then to the share of
 *   the regular season still to play. A player's pace, not a forecast.
 * - **Keeper value** — that full-season pace against next season's salary
 *   (this salary plus Ottoneu's end-of-season raise), floored at zero, the same
 *   convention `/trades` uses: a contract you would cut in the offseason costs
 *   nothing, because offseason cuts carry no penalty.
 * - **Cap room and roster spots** — salary out minus salary in, plus the cap
 *   loan. Loans expire at the end of the regular season.
 *
 * Pure: `trade-builder-data.ts` gathers the rows, the page's client component
 * calls `evaluateTrade` as the user picks players. See
 * docs/references/trades.md#trade-builder.
 */

import { lineupTotal, optimizeLineup, type LineupPlayer } from "./lineup";

export interface BuilderPlayer {
  playerId: string;
  ottoneuId: number;
  name: string;
  position: string;
  nflTeam: string;
  salary: number;
  /** Season-to-date points per game; 0 when he has not played. */
  ppg: number;
  gamesPlayed: number;
  /** Earned value over the games played so far. 0 for kickers and college players. */
  earnedToDate: number;
  /** `earnedToDate` scaled to a full season — his pace. */
  seasonPace: number;
  /** Next season's salary after the end-of-season raise. */
  nextSalary: number;
}

export interface BuilderTeam {
  teamName: string;
  players: BuilderPlayer[];
}

export interface BuilderContext {
  teams: BuilderTeam[];
  capPerTeam: number;
  rosterSpots: number;
  /** Share of the regular season still to play, in [0, 1]. Null when unknown. */
  remainingFraction: number | null;
}

export interface ProposedTrade {
  teamA: string;
  teamB: string;
  /** Player ids team A gives up. */
  aSends: string[];
  /** Player ids team B gives up. */
  bSends: string[];
  /** Cap dollars team A lends team B. */
  loanAtoB: number;
  /** Cap dollars team B lends team A. */
  loanBtoA: number;
}

export interface SideResult {
  team: string;
  sends: BuilderPlayer[];
  receives: BuilderPlayer[];
  /** Optimal starting lineup on season PPG, before and after. */
  lineupBefore: number;
  lineupAfter: number;
  lineupDelta: number;
  /** Rest-of-season value received minus sent. Null when the schedule is unknown. */
  restOfSeasonNet: number | null;
  /** Keeper value received minus sent (each player floored at zero). */
  keeperNet: number;
  /** Salary sent minus salary received. */
  salaryNet: number;
  capBefore: number;
  capAfter: number;
  rosterAfter: number;
  warnings: string[];
}

export interface TradeEvaluation {
  a: SideResult;
  b: SideResult;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);

/** Full-season earned value from a partial season's earned value. */
export function seasonPace(earnedToDate: number, fraction: number): number {
  return fraction > 0 ? earnedToDate / fraction : 0;
}

/**
 * Next season's salary: +`raisePlayed` for anyone who played an NFL game this
 * season, +`raiseOther` for everyone else (Ottoneu's end-of-season rule).
 */
export function nextSalary(
  salary: number,
  gamesPlayed: number,
  raisePlayed: number,
  raiseOther: number,
): number {
  return salary + (gamesPlayed > 0 ? raisePlayed : raiseOther);
}

/** What a player is worth to keep next season, floored at zero. */
export function keeperValue(p: Pick<BuilderPlayer, "seasonPace" | "nextSalary">): number {
  return Math.max(0, p.seasonPace - p.nextSalary);
}

function toLineupPlayer(p: BuilderPlayer): LineupPlayer {
  return {
    player_id: p.playerId,
    name: p.name,
    position: p.position,
    nfl_team: p.nflTeam,
    ppg: p.ppg,
    projected_ppg: 0,
  };
}

/** Optimal starting-lineup total on season PPG. */
export function lineupPpg(players: readonly BuilderPlayer[]): number {
  const roster = players.map(toLineupPlayer);
  // "last_season" is the metric that reads `ppg`; here `ppg` holds this
  // season's actual rate, so it scores the lineup on production to date.
  const lineup = optimizeLineup(roster, "last_season");
  return lineupTotal(lineup, new Map(roster.map((p) => [p.player_id, p])), "last_season");
}

function side(
  ctx: BuilderContext,
  team: BuilderTeam,
  sendIds: readonly string[],
  received: BuilderPlayer[],
  loanOut: number,
  loanIn: number,
): SideResult {
  const sendSet = new Set(sendIds);
  const sends = team.players.filter((p) => sendSet.has(p.playerId));
  const after = [...team.players.filter((p) => !sendSet.has(p.playerId)), ...received];

  const lineupBefore = lineupPpg(team.players);
  const lineupAfter = lineupPpg(after);

  const salary = sum(team.players.map((p) => p.salary));
  const salaryNet = sum(sends.map((p) => p.salary)) - sum(received.map((p) => p.salary));
  const capBefore = ctx.capPerTeam - salary;
  const capAfter = capBefore + salaryNet + loanIn - loanOut;

  const ros = (ps: readonly BuilderPlayer[]) =>
    sum(ps.map((p) => p.seasonPace * (ctx.remainingFraction ?? 0)));
  const keeper = (ps: readonly BuilderPlayer[]) => sum(ps.map(keeperValue));

  // Only flag what the trade itself makes worse. Existing cap loans, cut
  // penalties and IR are not in the data, so plenty of teams already read as
  // "over" on salary or head count alone; repeating that on every trade they
  // look at would make the warning meaningless.
  const warnings: string[] = [];
  if (capAfter < 0 && capAfter < capBefore) {
    warnings.push(`Salary would be $${Math.ceil(-capAfter)} over the cap (before existing loans and cut penalties)`);
  }
  const extra = after.length - ctx.rosterSpots;
  if (extra > 0 && after.length > team.players.length) {
    warnings.push(`${extra} over the ${ctx.rosterSpots}-man roster; may need ${extra === 1 ? "a cut" : `${extra} cuts`} unless someone is on IR`);
  }

  return {
    team: team.teamName,
    sends,
    receives: received,
    lineupBefore: round1(lineupBefore),
    lineupAfter: round1(lineupAfter),
    lineupDelta: round1(lineupAfter - lineupBefore),
    restOfSeasonNet: ctx.remainingFraction == null ? null : round2(ros(received) - ros(sends)),
    keeperNet: round2(keeper(received) - keeper(sends)),
    salaryNet,
    capBefore,
    capAfter,
    rosterAfter: after.length,
    warnings,
  };
}

/**
 * Both sides of a proposed trade, or null until it is a trade: two different
 * teams, at least one player or loan moving. Ids that are not on the sending
 * team's roster are ignored, so a stale shared link degrades rather than lies.
 */
export function evaluateTrade(ctx: BuilderContext, trade: ProposedTrade): TradeEvaluation | null {
  if (trade.teamA === trade.teamB) return null;
  const a = ctx.teams.find((t) => t.teamName === trade.teamA);
  const b = ctx.teams.find((t) => t.teamName === trade.teamB);
  if (!a || !b) return null;

  const aIds = new Set(trade.aSends);
  const bIds = new Set(trade.bSends);
  const aOut = a.players.filter((p) => aIds.has(p.playerId));
  const bOut = b.players.filter((p) => bIds.has(p.playerId));
  const loanAtoB = Math.max(0, trade.loanAtoB || 0);
  const loanBtoA = Math.max(0, trade.loanBtoA || 0);
  if (aOut.length + bOut.length === 0 && loanAtoB + loanBtoA === 0) return null;

  return {
    a: side(ctx, a, trade.aSends, bOut, loanAtoB, loanBtoA),
    b: side(ctx, b, trade.bSends, aOut, loanBtoA, loanAtoB),
  };
}

/** `?a=&b=&as=&bs=&la=&lb=` — a trade as a shareable query string. */
export function tradeToQuery(trade: ProposedTrade): string {
  const q = new URLSearchParams();
  if (trade.teamA) q.set("a", trade.teamA);
  if (trade.teamB) q.set("b", trade.teamB);
  if (trade.aSends.length) q.set("as", trade.aSends.join(","));
  if (trade.bSends.length) q.set("bs", trade.bSends.join(","));
  if (trade.loanAtoB > 0) q.set("la", String(trade.loanAtoB));
  if (trade.loanBtoA > 0) q.set("lb", String(trade.loanBtoA));
  return q.toString();
}

/** The inverse of `tradeToQuery`, tolerant of missing or malformed params. */
export function tradeFromQuery(params: Record<string, string | undefined>): ProposedTrade {
  const ids = (v: string | undefined) => (v ? v.split(",").filter(Boolean) : []);
  const dollars = (v: string | undefined) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    teamA: params.a ?? "",
    teamB: params.b ?? "",
    aSends: ids(params.as),
    bSends: ids(params.bs),
    loanAtoB: dollars(params.la),
    loanBtoA: dollars(params.lb),
  };
}
