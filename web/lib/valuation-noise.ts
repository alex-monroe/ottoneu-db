/**
 * Private manager valuations — the "not everybody prices the pool the same"
 * knob shared by the draft tools.
 *
 * Both the Ottoneu keeper auction (`mock-draft-engine.ts`) and the generic
 * snake draft (`snake-draft-engine.ts`) need the same thing: give each AI
 * manager a private opinion of every player that is *stable within a draft* and
 * *fresh between drafts*. A deterministic hash of (seed, team, player) buys both
 * — re-rolling an opinion mid-draft would let a bot walk past its own ceiling in
 * an English auction, or flip-flop between two players from pick to pick.
 */

/**
 * How far a manager's private valuation of a player may stray from the
 * consensus value. `spread` is a fraction (0.9 = ±90%); `seed` makes one
 * draft's opinions differ from the next while staying stable *within* a draft.
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
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * One manager's private multiplier on a player's consensus value: uniform in
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

/** lognormal(0, sigma) multiplier via Box–Muller — per-pick / per-bid taste. */
export function lognormalNoise(sigma: number): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const n = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(sigma * n);
}
