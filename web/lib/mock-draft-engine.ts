/**
 * Mock-draft engine — the AI opponent heuristics and sealed-bid auction
 * resolution, ported from scripts/auction_simulator.py. Pure & framework-free
 * (no React, no Supabase) so it can run in the browser and be unit-tested
 * directly.
 *
 * Model: one nominee at a time (highest market value first). Every team computes
 * a private max bid; the highest wins and pays second-highest + 1 (Vickrey),
 * capped at MAX_BID. AI bids come from the heuristics below; the user's bid is
 * whatever they enter. See docs/references/auction-simulator.md for the model.
 * Optionally each AI manager also carries a *private valuation* of every player
 * — a deterministic ±spread multiplier on market value (see ValuationNoise) —
 * so rivals disagree about who is worth what.
 * The real-time (English) auction layer that reuses these heuristics lives in
 * mock-draft-live.ts; see docs/references/mock-draft.md.
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
const SPARE_DISC = 0.32; // …and for a best-available body past the depth target
const TASTE_SIGMA = 0.16; // per-bid valuation noise
const POUNCE = { frac: 0.85, minMarket: 45, max: 72 }; // AI reach for below-market elites

// ── budget pressure (cash that would otherwise go unspent) ──
const TAIL_DECAY = 0.7; // value falloff of the players still to be nominated
export const MAX_PRESSURE = 6; // ceiling on the over-market multiplier
const SPILL_CASH = 25; // surplus above which a team keeps buying past FILL_TO

// target roster shape every AI builds toward (starters, then bench)
const START: Record<Pos, number> = { QB: 2, RB: 2, WR: 2, TE: 1, K: 1 };
const BENCH: Record<Pos, number> = { QB: 1, RB: 2, WR: 3, TE: 1, K: 0 };
// hard positional ceiling — no amount of spare cash buys a 7th kicker
const MAX_AT_POS: Record<Pos, number> = { QB: 4, RB: 6, WR: 7, TE: 3, K: 1 };
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

// ── private manager valuations ──
/**
 * How far a manager's private valuation of a player may stray from Draft Sharks
 * market value. `spread` is a fraction (0.9 = ±90%); `seed` makes one draft's
 * opinions differ from the next while staying stable *within* a draft.
 */
export interface ValuationNoise {
  spread: number;
  seed: number;
}

export const MAX_VALUATION_SPREAD = 0.9;

export const NO_VALUATION_NOISE: ValuationNoise = { spread: 0, seed: 0 };

/** A fresh seed for a draft's set of private valuations. */
export const randomValuationSeed = () => Math.floor(Math.random() * 2 ** 31);

/** FNV-1a — a cheap, stable string hash (unsigned 32-bit). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * One manager's private multiplier on a player's market value: uniform in
 * [1 - spread, 1 + spread], deterministic in (seed, team, player). Deterministic
 * matters — a manager who is high on a player stays high on him all draft, and
 * across every bid within a single lot.
 */
export function valuationMultiplier(
  teamName: string,
  playerId: string,
  { spread, seed }: ValuationNoise,
): number {
  const s = Math.max(0, Math.min(MAX_VALUATION_SPREAD, spread));
  if (s === 0) return 1;
  const u = hash32(`${seed}|${teamName}|${playerId}`) / 2 ** 32; // [0, 1)
  return 1 + s * (2 * u - 1);
}

/** What `team` privately thinks `p` is worth (market value when noise is off). */
export function privateValue(
  teamName: string,
  p: FAPlayer,
  val: ValuationNoise = NO_VALUATION_NOISE,
): number {
  return p.mv * valuationMultiplier(teamName, p.id, val);
}

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

// ── budget pressure ──
/**
 * How many more bodies this team intends to buy. Teams normally stop at FILL_TO
 * and leave a couple of spots open for the season, but one still holding real
 * money keeps buying to the roster limit — an empty spot is a cheaper way to
 * convert cash into a player than banking it.
 */
export function openSpots(t: DraftTeam): number {
  const target = t.cap - RESERVE > SPILL_CASH ? ROSTER_SPOTS : FILL_TO;
  return Math.max(0, target - size(t));
}

/**
 * A >= 1 multiplier on every bid, so a team finishes the draft spent out instead
 * of sitting on cash it can no longer deploy.
 *
 * `marketMv` — the *market* value of the player on the block, not this manager's
 * private opinion of him — anchors an estimate of what filling the remaining
 * spots costs: nomination runs roughly high value -> low, so the rest of a
 * team's draft is modelled as a geometrically decaying tail off the current lot.
 * A team whose spendable cash exceeds that estimate is holding dollars it cannot
 * spend at market, so it bids them up instead.
 *
 * The anchor stays at market on purpose: a team's future spending happens at
 * market prices, so pricing it off a private valuation would let a manager who
 * is *low* on this player inflate his bid — cancelling out the very disagreement
 * ValuationNoise exists to create.
 */
export function budgetPressure(t: DraftTeam, marketMv: number): number {
  const spots = openSpots(t);
  const spendable = t.cap - RESERVE;
  if (spots <= 0 || spendable <= 0) return 1;
  const naturalSpend =
    (Math.max(1, marketMv) * (1 - TAIL_DECAY ** spots)) / (1 - TAIL_DECAY);
  return Math.min(MAX_PRESSURE, Math.max(1, spendable / naturalSpend));
}

/**
 * An AI team's private max bid for a player (0 = not interested).
 * `noise` toggles the taste multiplier — off for a stable "suggested bid" hint.
 * `val` gives this manager a private valuation of the player (see
 * ValuationNoise); with the default it values him exactly at market.
 */
export function aiBid(
  t: DraftTeam,
  p: FAPlayer,
  noise = true,
  val: ValuationNoise = NO_VALUATION_NOISE,
): number {
  // everything below reasons about what *this* manager thinks the player is
  // worth, not the market price — including whether he counts as a starter
  const mv = privateValue(t.name, p, val);
  const startNeed = STARTABLE[p.pos] !== undefined && mv >= STARTABLE[p.pos];
  const spots = openSpots(t);
  let base = 0;
  if (startableCount(t, p.pos) < START[p.pos] && startNeed) {
    base = mv * (p.pos === "QB" ? SF_PREMIUM : 1); // lock down a starter (QBs first)
  } else if (posCount(t, p.pos) < START[p.pos] + BENCH[p.pos]) {
    base = mv * DEPTH_DISC; // bench depth
  } else if (spots > 0 && posCount(t, p.pos) < MAX_AT_POS[p.pos]) {
    base = mv * SPARE_DISC; // best available — a roster spot still needs a body
  }
  // unspendable cash is worth less than face: lean over market rather than bank it
  const pressure = budgetPressure(t, p.mv);
  const afford = t.cap - RESERVE - Math.max(0, spots - 1); // keep reserve + $1/open spot
  let want = base > 0 ? base * pressure * (noise ? taste() : 1) : 0;
  // pounce: reach for a below-market elite regardless of positional *need* —
  // but never past the hard positional ceiling
  if (mv >= POUNCE.minMarket && spots > 0 && posCount(t, p.pos) < MAX_AT_POS[p.pos]) {
    want = Math.max(want, Math.min(POUNCE.frac * mv, POUNCE.max) * pressure);
  }
  return Math.max(0, Math.min(want, afford, MAX_BID));
}

/**
 * A neutral "what the book says you'd pay" hint for the user's team — always at
 * market value, never noised: the private valuations belong to the AI managers.
 */
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
  val: ValuationNoise = NO_VALUATION_NOISE,
): BidResult {
  const bids = teams
    .map((t) => ({
      name: t.name,
      bid:
        t.name === userTeamName
          ? Math.max(0, Math.round(userBid))
          : Math.round(aiBid(t, player, true, val)),
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
