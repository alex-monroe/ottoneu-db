/**
 * Snake-draft engine — a generic (non-Ottoneu) mock snake draft against AI
 * opponents. Pure & framework-free (no React, no Supabase) so it runs in the
 * browser and is unit-tested directly.
 *
 * This is deliberately NOT the Ottoneu keeper auction in mock-draft-engine.ts:
 * there is no salary cap, no keeper roster to seed from, and no league. You
 * choose the number of teams, your draft slot, the starting lineup and the
 * length, and the bots draft against you snake-style. The only shared machinery
 * is the private-valuation noise (lib/valuation-noise.ts).
 *
 * The board is built from Draft Sharks' half-PPR *superflex* consensus auction
 * values, re-expressed as value over replacement for the lineup you configured
 * — which is what makes it format-aware: with one QB slot and 12 teams the QB
 * replacement level is QB12 and quarterbacks fall down the board; add a
 * superflex slot and replacement moves to ~QB22 and they climb back up.
 *
 * See docs/references/snake-draft.md.
 */

import {
  lognormalNoise,
  NO_VALUATION_NOISE,
  valuationMultiplier,
  type ValuationNoise,
} from "@/lib/valuation-noise";

export type Pos = "QB" | "RB" | "WR" | "TE";
export const POS_LIST: Pos[] = ["QB", "RB", "WR", "TE"];

/** A player as the market prices him, before any league format is applied. */
export interface MarketPlayer {
  id: string;
  name: string;
  pos: Pos;
  mv: number; // half-PPR superflex consensus auction value ($400 scale)
  nflTeam?: string | null;
}

/** …and after: `value` is what the board is actually sorted and drafted on. */
export interface BoardPlayer extends MarketPlayer {
  value: number; // value over replacement for the configured lineup
  rank: number; // overall board rank, 1 = best
  posRank: number; // rank within position
}

export interface LineupSettings {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number; // RB/WR/TE
  SF: number; // superflex: QB/RB/WR/TE
}

export interface DraftSettings {
  teams: number;
  rounds: number;
  slot: number; // the user's draft position, 1-based
  lineup: LineupSettings;
}

// ── limits & defaults ──
export const MIN_TEAMS = 4;
export const MAX_TEAMS = 20;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 30;

export const LINEUP_1QB: LineupSettings = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SF: 0 };
export const LINEUP_SUPERFLEX: LineupSettings = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SF: 1 };

export const DEFAULT_SETTINGS: DraftSettings = {
  teams: 12,
  rounds: 15,
  slot: 1,
  lineup: { ...LINEUP_1QB },
};

const FLEX_POS: Pos[] = ["RB", "WR", "TE"];
const SF_POS: Pos[] = ["QB", "RB", "WR", "TE"];
/**
 * Who a drafter actually *plans* to put in the superflex slot. The slot is
 * legal for any position (SF_POS, which is what the lineup display and scoring
 * honour), but nobody drafts a tight end intending to start him there — leaving
 * TE in gave bots a phantom starting job and a third tight end in a one-TE
 * league. Roster planning uses this narrower list.
 */
const SF_NEED_POS: Pos[] = ["QB", "RB", "WR"];

/**
 * How a league's FLEX and SUPERFLEX slots are actually filled, league-wide.
 * Used only to place the replacement level: a flex slot doesn't belong to one
 * position, but across a league it is filled by RBs and WRs most of the time,
 * and a superflex slot is a quarterback nearly always.
 */
const FLEX_SHARE: Record<Pos, number> = { QB: 0, RB: 0.4, WR: 0.5, TE: 0.1 };
const SF_SHARE: Record<Pos, number> = { QB: 0.85, RB: 0.05, WR: 0.08, TE: 0.02 };

/**
 * Value retained by a player priced below replacement, as a fraction of his
 * market value. Their value-over-replacement is zero or negative, but the board
 * still has to order them against each other — this keeps that ordering (and
 * keeps the bots' multiplicative valuation noise meaningful down there).
 */
const BELOW_REPL_FLOOR = 0.1;

const SNAKE_TASTE_SIGMA = 0.08; // per-pick jitter, on top of the noise slider

// ── board construction ──

/**
 * The rank, within each position, of the last starter the league will roster —
 * i.e. where replacement level sits. Dedicated slots plus that position's share
 * of the flex and superflex slots, times the number of teams.
 */
export function replacementRanks(s: DraftSettings): Record<Pos, number> {
  const out = {} as Record<Pos, number>;
  for (const pos of POS_LIST) {
    const perTeam =
      s.lineup[pos] + s.lineup.FLEX * FLEX_SHARE[pos] + s.lineup.SF * SF_SHARE[pos];
    out[pos] = Math.max(1, Math.round(s.teams * perTeam));
  }
  return out;
}

/**
 * Re-price the market pool for one league's format and rank it.
 *
 * A player's board value is his market value less the market value of the last
 * startable player at his position (`replacementRanks`) — the standard VORP
 * transform, which is what makes the same underlying superflex board usable for
 * a 1-QB league. Below replacement, value falls back to `BELOW_REPL_FLOOR × mv`
 * so late-round players stay ordered sensibly.
 */
export function buildBoard(pool: MarketPlayer[], s: DraftSettings): BoardPlayer[] {
  const repl = replacementRanks(s);
  const replValue = {} as Record<Pos, number>;
  for (const pos of POS_LIST) {
    const atPos = pool
      .filter((p) => p.pos === pos)
      .map((p) => p.mv)
      .sort((a, b) => b - a);
    replValue[pos] = atPos.length === 0 ? 0 : (atPos[Math.min(repl[pos], atPos.length) - 1] ?? 0);
  }

  const valued = pool
    .map((p) => ({
      ...p,
      value: Math.max(p.mv - replValue[p.pos], p.mv * BELOW_REPL_FLOOR),
    }))
    .sort((a, b) => b.value - a.value || b.mv - a.mv || a.name.localeCompare(b.name));

  const posSeen = { QB: 0, RB: 0, WR: 0, TE: 0 } as Record<Pos, number>;
  return valued.map((p, i) => ({ ...p, rank: i + 1, posRank: ++posSeen[p.pos] }));
}

// ── teams & pick order ──

export interface SnakeTeam {
  name: string;
  slot: number; // 1-based draft position
  isUser: boolean;
  roster: BoardPlayer[];
}

export function makeTeams(s: DraftSettings): SnakeTeam[] {
  return Array.from({ length: s.teams }, (_, i) => ({
    name: i + 1 === s.slot ? `You (${i + 1})` : `Team ${i + 1}`,
    slot: i + 1,
    isUser: i + 1 === s.slot,
    roster: [],
  }));
}

/**
 * The team index (0-based) picking at each overall pick, snake style: odd
 * rounds run 1→N, even rounds run N→1.
 */
export function snakeOrder(teams: number, rounds: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < teams; i++) out.push(r % 2 === 0 ? i : teams - 1 - i);
  }
  return out;
}

export interface SnakePick {
  overall: number; // 1-based
  round: number;
  pickInRound: number;
  teamSlot: number;
  teamName: string;
  isUser: boolean;
  player: BoardPlayer;
}

export interface SnakeDraft {
  settings: DraftSettings;
  teams: SnakeTeam[]; // index = slot - 1
  board: BoardPlayer[]; // still available, best value first
  picks: SnakePick[]; // chronological
  order: number[]; // team index per overall pick
  valuation: ValuationNoise; // how far bots' private prices stray from the board
}

export function newDraft(
  settings: DraftSettings,
  pool: MarketPlayer[],
  valuation: ValuationNoise = NO_VALUATION_NOISE,
): SnakeDraft {
  return {
    settings,
    teams: makeTeams(settings),
    board: buildBoard(pool, settings),
    picks: [],
    order: snakeOrder(settings.teams, settings.rounds),
    valuation,
  };
}

export interface OnClock {
  overall: number;
  round: number;
  pickInRound: number;
  teamIdx: number;
  team: SnakeTeam;
}

/** Who is picking right now — null once the draft is over. */
export function onClock(d: SnakeDraft): OnClock | null {
  const n = d.picks.length;
  if (n >= d.order.length || d.board.length === 0) return null;
  const teamIdx = d.order[n];
  return {
    overall: n + 1,
    round: Math.floor(n / d.settings.teams) + 1,
    pickInRound: (n % d.settings.teams) + 1,
    teamIdx,
    team: d.teams[teamIdx],
  };
}

export const isComplete = (d: SnakeDraft) => onClock(d) === null;
export const isUserOnClock = (d: SnakeDraft) => onClock(d)?.team.isUser ?? false;

/** Overall pick numbers still owned by `slot`, soonest first. */
export function upcomingPicks(d: SnakeDraft, slot: number): number[] {
  const out: number[] = [];
  for (let i = d.picks.length; i < d.order.length; i++) {
    if (d.order[i] === slot - 1) out.push(i + 1);
  }
  return out;
}

// ── roster shape & needs ──

export interface LineupSlot {
  slot: string;
  player: BoardPlayer | null;
}

/** The best legal starting lineup a roster can field (greedy, by board value). */
export function startingLineup(t: SnakeTeam, lineup: LineupSettings): LineupSlot[] {
  const pool = [...t.roster].sort((a, b) => b.value - a.value);
  const used = new Set<string>();
  const take = (positions: Pos[]): BoardPlayer | null => {
    const p = pool.find((x) => !used.has(x.id) && positions.includes(x.pos));
    if (p) used.add(p.id);
    return p ?? null;
  };
  const slots: LineupSlot[] = [];
  for (const pos of POS_LIST) {
    for (let i = 0; i < lineup[pos]; i++) slots.push({ slot: pos, player: take([pos]) });
  }
  for (let i = 0; i < lineup.FLEX; i++) slots.push({ slot: "FLEX", player: take(FLEX_POS) });
  for (let i = 0; i < lineup.SF; i++) slots.push({ slot: "SF", player: take(SF_POS) });
  return slots;
}

export const posCount = (t: SnakeTeam, pos: Pos) =>
  t.roster.filter((p) => p.pos === pos).length;

/**
 * Hard ceiling on how many of a position anyone will roster: the slots it can
 * fill plus a position-appropriate bench. Nobody carries a third tight end in a
 * one-TE league however the board is priced.
 */
export function maxAtPos(lineup: LineupSettings, pos: Pos): number {
  const bench: Record<Pos, number> = { QB: 1, RB: 4, WR: 5, TE: 0 };
  const flexable = FLEX_POS.includes(pos) ? lineup.FLEX : 0;
  const sfable = SF_NEED_POS.includes(pos) ? lineup.SF : 0;
  return lineup[pos] + flexable + sfable + bench[pos];
}

/** True if this player would step straight into an empty starting slot. */
export function fillsAStarterSlot(t: SnakeTeam, p: MarketPlayer, lineup: LineupSettings): boolean {
  const slots = startingLineup(t, lineup);
  for (const s of slots) {
    if (s.player) continue;
    if (s.slot === "FLEX" && FLEX_POS.includes(p.pos)) return true;
    if (s.slot === "SF" && SF_NEED_POS.includes(p.pos)) return true;
    if (s.slot === p.pos) return true;
  }
  return false;
}

/** How many starting slots this roster still cannot fill. */
export const openStarterSlots = (t: SnakeTeam, lineup: LineupSettings) =>
  startingLineup(t, lineup).filter((s) => !s.player).length;

/**
 * How much a team wants a position right now, as a multiplier on value.
 *
 * A starter it cannot yet field is worth full value; a backup is worth
 * progressively less the deeper the team already is at the position; past the
 * positional ceiling it is worth nothing. This is what stops a bot from taking
 * its fifth quarterback just because the board says he is the best player left.
 */
export function needMultiplier(t: SnakeTeam, p: MarketPlayer, lineup: LineupSettings): number {
  const have = posCount(t, p.pos);
  if (have >= maxAtPos(lineup, p.pos)) return 0;
  if (fillsAStarterSlot(t, p, lineup)) return 1;
  const depth = have - lineup[p.pos]; // bodies already behind the starters
  return 0.6 * 0.8 ** Math.max(0, depth);
}

// ── bot picks ──

/**
 * The pick a bot makes: the highest score on the board, where score is its
 * *private* valuation (board value × its personal multiplier, per the noise
 * slider) times how badly it needs the position, times a little per-pick taste.
 *
 * Late in the draft, a team that still cannot field a lineup stops taking best
 * available and fills its holes — the roster-crunch behaviour real drafters
 * show in the last few rounds.
 */
export function botPick(
  d: SnakeDraft,
  teamIdx: number,
  noise = true,
): BoardPlayer | null {
  const t = d.teams[teamIdx];
  if (d.board.length === 0) return null;

  const picksLeft = d.settings.rounds - t.roster.length;
  const mustFill = picksLeft <= openStarterSlots(t, d.settings.lineup);

  let best: BoardPlayer | null = null;
  let bestScore = -Infinity;
  let bestFallback: BoardPlayer | null = null;
  let bestFallbackScore = -Infinity;

  for (const p of d.board) {
    const need = needMultiplier(t, p, d.settings.lineup);
    const priv = p.value * valuationMultiplier(t.name, p.id, d.valuation);
    const score = priv * (noise ? lognormalNoise(SNAKE_TASTE_SIGMA) : 1);
    if (score > bestFallbackScore) {
      bestFallbackScore = score;
      bestFallback = p;
    }
    if (need <= 0) continue;
    if (mustFill && !fillsAStarterSlot(t, p, d.settings.lineup)) continue;
    const scored = score * need;
    if (scored > bestScore) {
      bestScore = scored;
      best = p;
    }
  }
  // every remaining player is capped-out (or nothing fills a hole): take the
  // best body left rather than forfeit the pick
  return best ?? bestFallback;
}

/** The board's own recommendation for the user: best value they can start. */
export function suggestedPick(d: SnakeDraft): BoardPlayer | null {
  const oc = onClock(d);
  if (!oc) return null;
  const t = oc.team;
  let best: BoardPlayer | null = null;
  let bestScore = -Infinity;
  for (const p of d.board) {
    const score = p.value * needMultiplier(t, p, d.settings.lineup);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

// ── state transitions (all immutable) ──

/** Record `player` as the pick of whoever is on the clock. */
export function makePick(d: SnakeDraft, player: BoardPlayer): SnakeDraft {
  const oc = onClock(d);
  if (!oc) return d;
  if (!d.board.some((p) => p.id === player.id)) return d;

  const teams = d.teams.map((t, i) =>
    i === oc.teamIdx ? { ...t, roster: [...t.roster, player] } : t,
  );
  const pick: SnakePick = {
    overall: oc.overall,
    round: oc.round,
    pickInRound: oc.pickInRound,
    teamSlot: oc.team.slot,
    teamName: oc.team.name,
    isUser: oc.team.isUser,
    player,
  };
  return {
    ...d,
    teams,
    board: d.board.filter((p) => p.id !== player.id),
    picks: [...d.picks, pick],
  };
}

/** Let whoever is on the clock pick for themselves (bot heuristic). */
export function autoPick(d: SnakeDraft): SnakeDraft {
  const oc = onClock(d);
  if (!oc) return d;
  const p = botPick(d, oc.teamIdx);
  return p ? makePick(d, p) : d;
}

/**
 * Run bot picks until the user is on the clock (or the draft ends). Bounded by
 * the number of picks left, so it can never spin.
 */
export function simToUser(d: SnakeDraft): SnakeDraft {
  let cur = d;
  for (let i = d.picks.length; i < d.order.length; i++) {
    if (isUserOnClock(cur) || isComplete(cur)) break;
    const next = autoPick(cur);
    if (next === cur) break; // nothing left to pick
    cur = next;
  }
  return cur;
}

/** Run the rest of the draft, the user's picks included, on the heuristic. */
export function simToEnd(d: SnakeDraft): SnakeDraft {
  let cur = d;
  for (let i = d.picks.length; i < d.order.length; i++) {
    const next = autoPick(cur);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

// ── post-draft grading ──

export interface TeamScore {
  team: SnakeTeam;
  starterValue: number; // board value of the best lineup it can field
  totalValue: number; // …and of the whole roster
  rank: number; // 1 = best starting lineup in the league
}

/**
 * Rank every roster by the board value of the lineup it can actually start —
 * the honest way to score a snake draft, since bench value is mostly insurance.
 */
export function scoreTeams(d: SnakeDraft): TeamScore[] {
  const rows = d.teams.map((team) => ({
    team,
    starterValue: startingLineup(team, d.settings.lineup).reduce(
      (a, s) => a + (s.player?.value ?? 0),
      0,
    ),
    totalValue: team.roster.reduce((a, p) => a + p.value, 0),
    rank: 0,
  }));
  return rows
    .sort((a, b) => b.starterValue - a.starterValue)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
