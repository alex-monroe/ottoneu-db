/**
 * Real-time (English) auction layer for the mock draft.
 *
 * The turn-based engine in mock-draft-engine.ts resolves a nominee as a sealed
 * Vickrey auction — one decision, instantly. This module runs the same AI
 * heuristics as a *live* auction against a clock: each lot opens with a
 * countdown, every AI team computes a private max once, then bids up over time
 * with human-ish reaction delays and jump increments. Any bid extends the clock
 * ("going once"). When the clock expires the high bidder wins at the price on
 * the board.
 *
 * Pure & framework-free: every function takes the current wall-clock `now` and
 * returns a new state, so the React layer just drives it from a setInterval and
 * the tests drive it from a fake clock.
 */
import {
  aiBid,
  applyWin,
  FILL_TO,
  NO_VALUATION_NOISE,
  resolveNominee,
  size,
  type BidResult,
  type DraftTeam,
  type FAPlayer,
  type ValuationNoise,
} from "@/lib/mock-draft-engine";

// ── pacing ──
export interface LiveConfig {
  clockMs: number; // opening countdown for a fresh lot
  resetMs: number; // a bid pushes the hammer out to at least now + this
  reactMinMs: number; // AI reaction time to a new price (lower bound)
  reactMaxMs: number; // …and upper bound
  userReactMs: number; // how fast the user's proxy (auto-bid) answers
  soldMs: number; // how long the SOLD card lingers before the next lot
}

export const SPEED_PRESETS = {
  relaxed: {
    clockMs: 14000, resetMs: 6500, reactMinMs: 700, reactMaxMs: 3200,
    userReactMs: 500, soldMs: 2200,
  },
  normal: {
    clockMs: 9000, resetMs: 4000, reactMinMs: 450, reactMaxMs: 2000,
    userReactMs: 350, soldMs: 1500,
  },
  fast: {
    clockMs: 5000, resetMs: 2200, reactMinMs: 250, reactMaxMs: 1000,
    userReactMs: 200, soldMs: 800,
  },
} as const satisfies Record<string, LiveConfig>;

export type SpeedKey = keyof typeof SPEED_PRESETS;
export const SPEED_KEYS = Object.keys(SPEED_PRESETS) as SpeedKey[];

// AI opening bid as a fraction of market value, and how much of the remaining
// headroom to their private max a jump bid closes.
const OPENING_FRAC = 0.4;
const JUMP_FRAC = 0.22;

export interface LiveBid {
  bidder: string;
  amount: number;
  isUser: boolean;
  at: number;
}

export interface LiveLot {
  player: FAPlayer;
  nominator: string;
  price: number; // current high bid ($0 = nobody has bid yet)
  highBidder: string | null;
  bids: LiveBid[]; // oldest first
  openedAt: number;
  deadline: number;
  maxes: Record<string, number>; // AI private maxes — never shown to the user
  next: Record<string, number>; // per-team epoch ms of their next bid attempt
  userMax: number; // the user's standing proxy bid (0 = none)
}

export interface LiveDraft {
  teams: DraftTeam[];
  pool: FAPlayer[]; // remaining FAs, index 0 is up next
  log: BidResult[]; // newest first
  lot: LiveLot | null;
  sold: BidResult | null; // result of the lot just hammered (the SOLD card)
  soldUntil: number;
  nominatorIdx: number;
  userTeam: string;
  valuation: ValuationNoise; // how far rivals' private prices stray from market
}

// ── helpers ──
const react = (cfg: LiveConfig) =>
  cfg.reactMinMs + Math.random() * Math.max(0, cfg.reactMaxMs - cfg.reactMinMs);

const cloneTeams = (teams: DraftTeam[]) => teams.map((t) => ({ ...t, roster: [...t.roster] }));

/** ms left on the clock (never negative). */
export const msLeft = (lot: LiveLot, now: number) => Math.max(0, lot.deadline - now);

/** The smallest bid the user can put on the board right now. */
export const minUserBid = (lot: LiveLot) => lot.price + 1;

export function newDraft(
  teams: DraftTeam[],
  pool: FAPlayer[],
  userTeam: string,
  valuation: ValuationNoise = NO_VALUATION_NOISE,
): LiveDraft {
  return {
    teams,
    pool,
    log: [],
    lot: null,
    sold: null,
    soldUntil: 0,
    nominatorIdx: 0,
    userTeam,
    valuation,
  };
}

/** Whoever is nominating next: rotate through teams that still have roster room. */
function nominator(teams: DraftTeam[], idx: number): string {
  const eligible = teams.filter((t) => size(t) < FILL_TO);
  const ring = eligible.length > 0 ? eligible : teams;
  return ring[idx % ring.length]?.name ?? teams[0]?.name ?? "";
}

/**
 * Put the next player from the pool on the block. Each AI's private max is
 * computed once here, off its own private valuation of the player, so its
 * ceiling is consistent for the whole lot.
 */
function openLot(st: LiveDraft, now: number, cfg: LiveConfig): LiveDraft {
  if (st.pool.length === 0) return { ...st, lot: null, sold: null, soldUntil: 0 };
  const player = st.pool[0];
  const maxes: Record<string, number> = {};
  const next: Record<string, number> = {};
  for (const t of st.teams) {
    if (t.name === st.userTeam) {
      next[t.name] = now + cfg.userReactMs;
      continue;
    }
    maxes[t.name] = Math.round(aiBid(t, player, true, st.valuation));
    next[t.name] = now + react(cfg);
  }
  const lot: LiveLot = {
    player,
    nominator: nominator(st.teams, st.nominatorIdx),
    price: 0,
    highBidder: null,
    bids: [],
    openedAt: now,
    deadline: now + cfg.clockMs,
    maxes,
    next,
    userMax: 0,
  };
  return { ...st, lot, sold: null, soldUntil: 0, nominatorIdx: st.nominatorIdx + 1 };
}

/** Record a bid: raise the price, extend the clock, re-roll everyone's reaction. */
function placeBid(
  lot: LiveLot,
  bidder: string,
  amount: number,
  isUser: boolean,
  userTeam: string,
  now: number,
  cfg: LiveConfig,
): LiveLot {
  const next: Record<string, number> = {};
  for (const name of Object.keys(lot.next)) {
    next[name] = name === userTeam ? now + cfg.userReactMs : now + react(cfg);
  }
  return {
    ...lot,
    price: amount,
    highBidder: bidder,
    bids: [...lot.bids, { bidder, amount, isUser, at: now }],
    deadline: Math.max(lot.deadline, now + cfg.resetMs),
    next,
  };
}

/**
 * One round of automatic bidding: at most one bid per call (the AI team whose
 * reaction landed first, or the user's proxy). Returns the same lot object when
 * nobody is ready or willing to bid.
 */
function autoBid(
  lot: LiveLot,
  teams: DraftTeam[],
  userTeam: string,
  now: number,
  cfg: LiveConfig,
): LiveLot {
  // The user's standing max behaves like an eBay proxy: bid the minimum needed
  // to lead, never more.
  if (
    lot.userMax > lot.price &&
    lot.highBidder !== userTeam &&
    now >= (lot.next[userTeam] ?? 0)
  ) {
    return placeBid(lot, userTeam, lot.price + 1, true, userTeam, now, cfg);
  }

  let pick: string | null = null;
  let earliest = Infinity;
  for (const t of teams) {
    if (t.name === userTeam || t.name === lot.highBidder) continue;
    if ((lot.maxes[t.name] ?? 0) <= lot.price) continue;
    const at = lot.next[t.name] ?? 0;
    if (at <= now && at < earliest) {
      pick = t.name;
      earliest = at;
    }
  }
  if (!pick) return lot;

  const max = lot.maxes[pick];
  const amount =
    lot.price === 0
      ? Math.max(1, Math.min(max, Math.round(lot.player.mv * OPENING_FRAC)))
      : Math.min(max, lot.price + Math.max(1, Math.round((max - lot.price) * JUMP_FRAC)));
  return placeBid(lot, pick, amount, false, userTeam, now, cfg);
}

/** Drop the hammer on the open lot: award it, log it, and show the SOLD card. */
function hammer(st: LiveDraft, now: number, cfg: LiveConfig): LiveDraft {
  const lot = st.lot;
  if (!lot) return st;
  const teams = cloneTeams(st.teams);
  const userBids = lot.bids.filter((b) => b.isUser).map((b) => b.amount);
  const res: BidResult = {
    player: lot.player,
    winner: lot.highBidder,
    price: lot.price,
    topBids: [...lot.bids].reverse().slice(0, 3).map((b) => ({ name: b.bidder, bid: b.amount })),
    userBid: userBids.length > 0 ? Math.max(...userBids) : 0,
    userWon: lot.highBidder === st.userTeam,
  };
  if (lot.highBidder) {
    const winner = teams.find((t) => t.name === lot.highBidder);
    if (winner) applyWin(winner, lot.player, lot.price);
  }
  return {
    ...st,
    teams,
    pool: st.pool.slice(1),
    log: [res, ...st.log],
    lot: null,
    sold: res,
    soldUntil: now + cfg.soldMs,
  };
}

/**
 * Advance the live draft to `now`. Called on every animation/interval tick;
 * returns the identical object when nothing changed so React can skip the
 * re-render work.
 */
export function advanceLive(st: LiveDraft, now: number, cfg: LiveConfig): LiveDraft {
  if (st.sold) {
    if (now < st.soldUntil) return st;
    return openLot({ ...st, sold: null, soldUntil: 0 }, now, cfg);
  }
  if (!st.lot) {
    if (st.pool.length === 0) return st;
    return openLot(st, now, cfg);
  }
  if (now >= st.lot.deadline) return hammer(st, now, cfg);
  const lot = autoBid(st.lot, st.teams, st.userTeam, now, cfg);
  return lot === st.lot ? st : { ...st, lot };
}

/** The user clicks Bid. No-op if the amount doesn't beat the board. */
export function placeUserBid(
  st: LiveDraft,
  amount: number,
  now: number,
  cfg: LiveConfig,
): LiveDraft {
  const lot = st.lot;
  if (!lot) return st;
  const bid = Math.round(amount);
  if (bid < minUserBid(lot)) return st;
  return { ...st, lot: placeBid(lot, st.userTeam, bid, true, st.userTeam, now, cfg) };
}

/** Set (or clear, with 0) the user's standing auto-bid ceiling on this lot. */
export function setUserMax(st: LiveDraft, max: number): LiveDraft {
  if (!st.lot) return st;
  return { ...st, lot: { ...st.lot, userMax: Math.max(0, Math.round(max)) } };
}

/** Shift every deadline forward — used to keep a paused draft honest. */
export function shiftClock(st: LiveDraft, deltaMs: number): LiveDraft {
  if (deltaMs <= 0) return st;
  const lot = st.lot
    ? {
        ...st.lot,
        deadline: st.lot.deadline + deltaMs,
        next: Object.fromEntries(
          Object.entries(st.lot.next).map(([k, v]) => [k, v + deltaMs]),
        ),
      }
    : null;
  return { ...st, lot, soldUntil: st.soldUntil > 0 ? st.soldUntil + deltaMs : 0 };
}

/**
 * Resolve the next player with no clock at all — the sealed-bid path, used for
 * "skip to my next need", "auto-finish", and the turn-based mode. Any open lot
 * is discarded (its bids are re-run as a sealed auction) so the two modes stay
 * consistent about who ends up with the player.
 */
export function instantStep(st: LiveDraft, userBid: number, now: number): LiveDraft {
  if (st.pool.length === 0) return st;
  const player = st.pool[0];
  const teams = cloneTeams(st.teams);
  const res = resolveNominee(teams, player, st.userTeam, userBid, st.valuation);
  if (res.winner) {
    const winner = teams.find((t) => t.name === res.winner);
    if (winner) applyWin(winner, player, res.price);
  }
  return {
    ...st,
    teams,
    pool: st.pool.slice(1),
    log: [res, ...st.log],
    lot: null,
    sold: null,
    soldUntil: now,
  };
}
