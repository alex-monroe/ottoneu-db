/**
 * Mock-draft engine — the AI opponent heuristics and auction resolution, ported
 * from scripts/auction_simulator.py. Pure & framework-free (no React, no
 * Supabase) so it can run in the browser and be unit-tested directly.
 *
 * Model: one nominee at a time (highest market value first). Every team computes
 * a private max bid; the highest wins and pays second-highest + 1 (Vickrey),
 * capped at MAX_BID. AI bids come from the heuristics below; the user's bid is
 * whatever they enter. See docs/references/auction-simulator.md for the model.
 */

export type Pos = "QB" | "RB" | "WR" | "TE" | "K";
export const POS_LIST: Pos[] = ["QB", "RB", "WR", "TE", "K"];

export interface FAPlayer {
  id: string;
  name: string;
  pos: Pos;
  mv: number; // Draft Sharks superflex market value ($400 scale)
  nflTeam?: string | null;
}

export interface RosterPlayer {
  id: string;
  name: string;
  pos: Pos;
  salary: number;
  mv: number;
}

export interface DraftTeam {
  name: string;
  isUser: boolean;
  roster: RosterPlayer[];
  cap: number; // remaining cap space
}

// ── engine constants (mirror the Python sim's generic heuristic) ──
export const ROSTER_SPOTS = 20;
export const FILL_TO = 18; // teams roster this many (leave ~2 open for the season)
export const MAX_BID = 110;
const RESERVE = 10; // every team keeps this for in-season waivers
const SF_PREMIUM = 1.5; // Superflex: teams pay up for a 2nd startable QB
const DEPTH_DISC = 0.5; // fraction of market paid for bench depth
const TASTE_SIGMA = 0.16; // per-bid valuation noise
const POUNCE = { frac: 0.85, minMarket: 45, max: 72 }; // AI reach for below-market elites

// target roster shape every AI builds toward (starters, then bench)
const START: Record<Pos, number> = { QB: 2, RB: 2, WR: 2, TE: 1, K: 1 };
const BENCH: Record<Pos, number> = { QB: 1, RB: 2, WR: 3, TE: 1, K: 0 };
// min market value for a player to count as a genuine starter at his position
const STARTABLE: Record<Pos, number> = { QB: 15, RB: 14, WR: 18, TE: 9, K: 0 };

// starting lineup for this league: 1 QB · 2 RB · 2 WR · 1 TE · 1 FLEX · 1 SUPERFLEX · 1 K
export const LINEUP_SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SF", "K"] as const;
const FLEX_POS: Pos[] = ["RB", "WR", "TE"];
const SF_POS: Pos[] = ["QB", "RB", "WR", "TE"];

// ── helpers ──
export const size = (t: DraftTeam) => t.roster.length;
export const posCount = (t: DraftTeam, pos: Pos) =>
  t.roster.filter((p) => p.pos === pos).length;
export const startableCount = (t: DraftTeam, pos: Pos) =>
  t.roster.filter((p) => p.pos === pos && p.mv >= STARTABLE[pos]).length;
export const committed = (t: DraftTeam) =>
  t.roster.reduce((a, p) => a + p.salary, 0);

/** lognormal(0, sigma) multiplier via Box–Muller. */
function lognormalNoise(sigma: number): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const n = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(sigma * n);
}

const taste = () => lognormalNoise(TASTE_SIGMA);

// Nomination order is value-weighted but jittered — real managers don't nominate
// strictly highest-to-lowest. Bigger sigma = more shuffled.
export const NOMINATION_SIGMA = 0.4;

/**
 * A nomination order for the FA pool: mostly by market value, but noised so it's
 * not strictly high→low. Each player gets a jittered sort key (computed once, so
 * the sort is stable), then the pool is ordered by that key descending.
 */
export function nominationOrder(pool: FAPlayer[]): FAPlayer[] {
  return [...pool]
    .map((p) => ({ p, key: p.mv * lognormalNoise(NOMINATION_SIGMA) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.p);
}

/**
 * An AI team's private max bid for a player (0 = not interested).
 * `noise` toggles the taste multiplier — off for a stable "suggested bid" hint.
 */
export function aiBid(t: DraftTeam, p: FAPlayer, noise = true): number {
  const startNeed = STARTABLE[p.pos] !== undefined && p.mv >= STARTABLE[p.pos];
  let base = 0;
  if (startableCount(t, p.pos) < START[p.pos] && startNeed) {
    base = p.mv * (p.pos === "QB" ? SF_PREMIUM : 1); // lock down a starter (QBs first)
  } else if (posCount(t, p.pos) < START[p.pos] + BENCH[p.pos]) {
    base = p.mv * DEPTH_DISC; // bench depth
  }
  const spotsToFill = Math.max(0, FILL_TO - size(t));
  const afford = t.cap - RESERVE - Math.max(0, spotsToFill - 1); // keep reserve + $1/open spot
  let want = base > 0 ? base * (noise ? taste() : 1) : 0;
  // pounce: reach for a below-market elite regardless of positional need
  if (p.mv >= POUNCE.minMarket && size(t) < FILL_TO) {
    want = Math.max(want, Math.min(POUNCE.frac * p.mv, POUNCE.max));
  }
  return Math.max(0, Math.min(want, afford, MAX_BID));
}

/** A neutral "what the book says you'd pay" hint for the user's team. */
export function suggestedBid(userTeam: DraftTeam, p: FAPlayer): number {
  return Math.round(aiBid(userTeam, p, false));
}

export interface BidResult {
  player: FAPlayer;
  winner: string | null; // null = nobody bid (no sale)
  price: number;
  topBids: { name: string; bid: number }[]; // for the log (top 3)
  userBid: number;
  userWon: boolean;
}

/**
 * Resolve one nominee. Every team bids (the user's team uses `userBid`, everyone
 * else uses the heuristic); highest wins at second-highest + 1.
 */
export function resolveNominee(
  teams: DraftTeam[],
  player: FAPlayer,
  userTeamName: string,
  userBid: number,
): BidResult {
  const bids = teams
    .map((t) => ({
      name: t.name,
      bid:
        t.name === userTeamName
          ? Math.max(0, Math.round(userBid))
          : Math.round(aiBid(t, player)),
    }))
    .filter((b) => b.bid >= 1)
    .sort((a, b) => b.bid - a.bid);

  const uBid = Math.max(0, Math.round(userBid));
  if (bids.length === 0) {
    return { player, winner: null, price: 0, topBids: [], userBid: uBid, userWon: false };
  }
  const top = bids[0];
  const second = bids[1]?.bid ?? 0;
  const price = Math.max(1, Math.min(top.bid, second + 1, MAX_BID));
  return {
    player,
    winner: top.name,
    price,
    topBids: bids.slice(0, 3),
    userBid: uBid,
    userWon: top.name === userTeamName,
  };
}

/** Apply a sale to a team (mutates the passed team object). */
export function applyWin(team: DraftTeam, player: FAPlayer, price: number): void {
  team.roster.push({ id: player.id, name: player.name, pos: player.pos, salary: price, mv: player.mv });
  team.cap -= price;
}

export interface NeedRow {
  pos: Pos;
  have: number; // startable count owned
  want: number; // starters targeted
  filled: boolean;
}

/** Per-position starter needs, for the user panel + skip-ahead. */
export function starterNeeds(t: DraftTeam): NeedRow[] {
  return POS_LIST.map((pos) => {
    const have = startableCount(t, pos);
    return { pos, have, want: START[pos], filled: have >= START[pos] };
  });
}

/** True if this player would fill an open starter (or flex/SF) slot for the team. */
export function fillsANeed(t: DraftTeam, p: FAPlayer): boolean {
  if (startableCount(t, p.pos) < START[p.pos] && p.mv >= STARTABLE[p.pos]) return true;
  // flex/superflex: still want skill-position starters even once position minimums are met
  const skillStarters = ["RB", "WR", "TE"].reduce(
    (a, pos) => a + Math.min(startableCount(t, pos as Pos), START[pos as Pos]),
    0,
  );
  const flexOpen = skillStarters < START.RB + START.WR + START.TE + 1; // +1 flex
  return flexOpen && FLEX_POS.includes(p.pos) && p.mv >= STARTABLE[p.pos];
}

export interface LineupSlot {
  slot: string;
  player: RosterPlayer | null;
}

/** Greedy best starting lineup (by max(mv, salary)) for display. */
export function startingLineup(t: DraftTeam): LineupSlot[] {
  const score = (p: RosterPlayer) => Math.max(p.mv, p.salary);
  const pool = [...t.roster].sort((a, b) => score(b) - score(a));
  const used = new Set<string>();
  const takeExact = (pos: Pos): RosterPlayer | null => {
    const p = pool.find((x) => !used.has(x.id) && x.pos === pos);
    if (p) used.add(p.id);
    return p ?? null;
  };
  const takeAny = (positions: Pos[]): RosterPlayer | null => {
    const p = pool.find((x) => !used.has(x.id) && positions.includes(x.pos));
    if (p) used.add(p.id);
    return p ?? null;
  };
  return [
    { slot: "QB", player: takeExact("QB") },
    { slot: "RB", player: takeExact("RB") },
    { slot: "RB", player: takeExact("RB") },
    { slot: "WR", player: takeExact("WR") },
    { slot: "WR", player: takeExact("WR") },
    { slot: "TE", player: takeExact("TE") },
    { slot: "FLEX", player: takeAny(FLEX_POS) },
    { slot: "SF", player: takeAny(SF_POS) },
    { slot: "K", player: takeExact("K") },
  ];
}
