/**
 * Snake-draft engine — a generic (non-Ottoneu) mock snake draft against AI
 * opponents. Pure & framework-free (no React, no Supabase, no database) so it
 * runs in the browser and is unit-tested directly.
 *
 * This is deliberately NOT the Ottoneu keeper auction in mock-draft-engine.ts:
 * there is no salary cap, no keeper roster to seed from, and no league. You
 * choose the number of teams, your draft slot, the starting lineup and the
 * length, and the bots draft against you snake-style. The only shared machinery
 * is the private-valuation noise (lib/valuation-noise.ts).
 *
 * The board is The Athletic's published VORP board for a 12-team, 1-QB, PPR
 * league (lib/data/athletic-vorp.ts), used as published. A different league
 * format is handled by shifting each position's replacement baseline in points
 * space — a correction that is exactly zero at the format the board was built
 * for, so at 12-team 1QB you are drafting off their numbers and their order.
 *
 * See docs/references/snake-draft.md.
 */

import { ATHLETIC_BOARD, SOURCE_FORMAT } from "@/lib/data/athletic-vorp";
import {
  lognormalNoise,
  NO_VALUATION_NOISE,
  valuationMultiplier,
  type ValuationNoise,
} from "@/lib/valuation-noise";

export type Pos = "QB" | "RB" | "WR" | "TE";
export const POS_LIST: Pos[] = ["QB", "RB", "WR", "TE"];

/** A player as the source board publishes him, before any format correction. */
export interface MarketPlayer {
  id: string;
  name: string;
  pos: Pos;
  points: number; // projected season points, in the source board's scoring
  vorp: number; // the publisher's value over replacement, at SOURCE_FORMAT
  bye: number;
}

/** …and after: `value` is what the board is actually sorted and drafted on. */
export interface BoardPlayer extends MarketPlayer {
  value: number; // VORP, corrected to the configured format
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

/** The lineup the published board is calibrated for. */
export const SOURCE_LINEUP: LineupSettings = { ...SOURCE_FORMAT.lineup };
export const LINEUP_1QB: LineupSettings = { ...SOURCE_LINEUP };
export const LINEUP_SUPERFLEX: LineupSettings = { ...SOURCE_LINEUP, SF: 1 };

/** Defaults match SOURCE_FORMAT, so an untouched setup drafts off it verbatim. */
export const DEFAULT_SETTINGS: DraftSettings = {
  teams: SOURCE_FORMAT.teams,
  rounds: 15,
  slot: 1,
  lineup: { ...SOURCE_LINEUP },
};

/** The published board as a draftable pool. */
export function athleticPool(): MarketPlayer[] {
  return ATHLETIC_BOARD.map(([name, pos, posRank, bye, points, vorp]) => ({
    id: `${pos}${posRank}`, // stable within the board, and the noise hash's key
    name,
    pos,
    points,
    vorp,
    bye,
  }));
}

export interface BoardStats {
  /** Positional rank the publisher's replacement level sits at (12 teams). */
  replRank: Record<Pos, number>;
  /** Projected points of the player at that rank. */
  baseline: Record<Pos, number>;
  /** VORP gained per projected point, fitted from the published values. */
  slope: Record<Pos, number>;
}

const _statsCache = new WeakMap<object, BoardStats>();

/**
 * What a published board says about its own baselines, read back out of the
 * numbers rather than hardcoded.
 *
 * `replRank` is where VORP crosses zero; `baseline` is that player's projected
 * points (so the format correction is exactly zero at SOURCE_FORMAT, by
 * construction); `slope` is the least-squares VORP-per-point. The slope is 1.00
 * at WR and TE and 0.80 at RB, which is exact — the publisher's VORP is affine
 * in points at those positions. At QB it is not (their implied baseline climbs
 * from ~247 for the QB1 to ~330 for the QB40, which reads as a streaming-aware
 * replacement), so the fitted 1.16 is an approximation, used only to price a
 * change of format away from 1 QB.
 */
export function boardStats(pool: MarketPlayer[]): BoardStats {
  const cached = _statsCache.get(pool);
  if (cached) return cached;

  const replRank = {} as Record<Pos, number>;
  const baseline = {} as Record<Pos, number>;
  const slope = {} as Record<Pos, number>;

  for (const pos of POS_LIST) {
    const at = pool.filter((p) => p.pos === pos).sort((a, b) => b.vorp - a.vorp);
    if (at.length === 0) {
      replRank[pos] = 1;
      baseline[pos] = 0;
      slope[pos] = 1;
      continue;
    }
    const points = at.map((p) => p.points);
    const vorps = at.map((p) => p.vorp);

    const n = Math.max(1, at.filter((p) => p.vorp >= 0).length);
    replRank[pos] = n;
    baseline[pos] = points[Math.min(n, points.length) - 1];

    const mx = points.reduce((a, b) => a + b, 0) / points.length;
    const my = vorps.reduce((a, b) => a + b, 0) / vorps.length;
    const cov = points.reduce((a, x, i) => a + (x - mx) * (vorps[i] - my), 0);
    const varx = points.reduce((a, x) => a + (x - mx) ** 2, 0);
    slope[pos] = varx === 0 ? 1 : cov / varx;
  }
  const stats = { replRank, baseline, slope };
  _statsCache.set(pool, stats);
  return stats;
}

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

const SNAKE_TASTE_SIGMA = 0.08; // per-pick jitter, on top of the noise slider

/**
 * Floor on the value a bot *scores* a player at. Real VORP goes negative below
 * replacement, and the scoring model is multiplicative — a negative value would
 * invert both the need discount and the manager's private multiplier, so a bot
 * would start preferring positions it has no room for. Clamping to a small
 * positive number leaves every below-replacement player effectively tied, and
 * the board's own order (which the scan follows) breaks the tie. Displayed and
 * scored values are untouched; this only affects who gets picked.
 */
const MIN_PICK_VALUE = 0.1;

/** What a bot's scoring model treats a player as worth (see MIN_PICK_VALUE). */
const pickValue = (p: BoardPlayer) => Math.max(p.value, MIN_PICK_VALUE);

// ── board construction ──

/** Starting slots one team fills at a position, flex/superflex share included. */
function startersPerTeam(lineup: LineupSettings, pos: Pos): number {
  return lineup[pos] + lineup.FLEX * FLEX_SHARE[pos] + lineup.SF * SF_SHARE[pos];
}

/**
 * Where replacement level sits at each position, as a rank within that
 * position, for a given format.
 *
 * This is anchored on the source board's *own* baselines rather than derived
 * from scratch. The publisher draws replacement level deeper than "last
 * starter" — at 12 teams it lands on WR60, RB44, TE21, QB16, i.e. the last
 * player anyone rosters, not the last one anyone starts. Re-deriving it would
 * silently re-rank their board, so instead the source ranks are scaled for
 * league size and shifted by the difference in starting slots between the
 * configured lineup and theirs. At SOURCE_FORMAT this returns their ranks
 * exactly, and the whole correction below vanishes.
 */
export function replacementRanks(pool: MarketPlayer[], s: DraftSettings): Record<Pos, number> {
  const src = boardStats(pool);
  const out = {} as Record<Pos, number>;
  for (const pos of POS_LIST) {
    const scaled = src.replRank[pos] * (s.teams / SOURCE_FORMAT.teams);
    const lineupShift =
      s.teams * (startersPerTeam(s.lineup, pos) - startersPerTeam(SOURCE_LINEUP, pos));
    out[pos] = Math.max(1, Math.round(scaled + lineupShift));
  }
  return out;
}

/**
 * Apply the configured format to the published board and rank it.
 *
 * The published VORP is used as-is; only the *baseline* moves. If the format
 * pushes replacement level deeper at a position, every player there is worth
 * more by the points between the two baselines, converted into VORP by that
 * position's published VORP-per-point slope (`sourceBoard`). A 12-team, 1-QB
 * league moves nothing and reproduces the publisher's board exactly.
 *
 * The clearest case is superflex: QB starters go from 1.0 to ~1.85 per team, so
 * QB replacement falls from QB16 to about QB26 and every quarterback gains the
 * ~50 points between them — which is what lifts the QB1 from the back of round
 * 2 to the top of round 1, where a superflex draft actually takes him.
 */
export function buildBoard(pool: MarketPlayer[], s: DraftSettings): BoardPlayer[] {
  const src = boardStats(pool);
  const repl = replacementRanks(pool, s);

  const shift = {} as Record<Pos, number>;
  for (const pos of POS_LIST) {
    const atPos = pool
      .filter((p) => p.pos === pos)
      .map((p) => p.points)
      .sort((a, b) => b - a);
    // points of the player now at replacement level (the deepest one we have,
    // if the format reaches past the end of the published board)
    const baseline =
      atPos.length === 0 ? src.baseline[pos] : atPos[Math.min(repl[pos], atPos.length) - 1];
    shift[pos] = src.slope[pos] * (src.baseline[pos] - baseline);
  }

  const valued = pool
    .map((p) => ({ ...p, value: p.vorp + shift[p.pos] }))
    .sort((a, b) => b.value - a.value || b.points - a.points || a.name.localeCompare(b.name));

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
    const priv = pickValue(p) * valuationMultiplier(t.name, p.id, d.valuation);
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
    const score = pickValue(p) * needMultiplier(t, p, d.settings.lineup);
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
