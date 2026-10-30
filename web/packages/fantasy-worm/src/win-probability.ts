/**
 * The win-probability model: each side's expected final is its points so far
 * plus its projected points still to come; the uncertainty left in a lineup is
 * `sd` scaled by the square root of the share of it still to play; the win
 * probability is the normal chance the expected margin survives both sides'
 * uncertainty.
 *
 * Pure, dependency-free. A TypeScript port of the model ottoneu-db runs in
 * scripts/rebuild_score_worm.py (`win_probability`, `WinModel`); the parity
 * test pins this to values from Python's `statistics.NormalDist`.
 */

/** Two totals closer than this are the same score (points are kept to 2 dp). */
const EPSILON = 0.005;

const SQRT_PI = Math.sqrt(Math.PI);

/** erf(x) for |x| < 3, by its all-positive series (no cancellation). */
function erfSeries(x: number): number {
  let term = x;
  let sum = x;
  for (let n = 1; n < 200; n++) {
    term *= (2 * x * x) / (2 * n + 1);
    sum += term;
    if (Math.abs(term) < 1e-17 * Math.abs(sum)) break;
  }
  return ((2 / SQRT_PI) * Math.exp(-x * x)) * sum;
}

/** erfc(x) for x ≥ 3, by its continued fraction (evaluated bottom-up). */
function erfcFraction(x: number): number {
  let k = x;
  for (let n = 60; n >= 1; n--) k = x + n / 2 / k;
  return Math.exp(-x * x) / (SQRT_PI * k);
}

/** The standard normal CDF, accurate to ~1e-14. */
export function normalCdf(z: number): number {
  const t = z / Math.SQRT2;
  if (t >= 3) return 1 - 0.5 * erfcFraction(t);
  if (t <= -3) return 0.5 * erfcFraction(-t);
  return 0.5 * (1 + erfSeries(t));
}

/**
 * P(the side `margin` favours wins) when `variance` points² of uncertainty
 * remain. With nothing left to play it is settled: 1, 0, or ½ for a tie.
 */
export function winProbability(margin: number, variance: number): number {
  if (variance <= 1e-9) return margin >= EPSILON ? 1 : margin <= -EPSILON ? 0 : 0.5;
  return normalCdf(margin / Math.sqrt(variance));
}

/** One side's state at a moment. */
export interface SideState {
  points: number;
  /** Projected points still to come. */
  remaining: number;
  /** Share (0–1) of the lineup played; null when unknown (adds no uncertainty). */
  progress: number | null;
}

/** The left side's win probability (0–1, to 4 dp) at a moment, given a full lineup's spread `sd`. */
export function leftWinProbability(left: SideState, right: SideState, sd: number): number {
  const margin = left.points + left.remaining - (right.points + right.remaining);
  const variance = [left.progress, right.progress]
    .filter((share): share is number => share != null)
    .reduce((sum, share) => sum + sd ** 2 * (1 - share), 0);
  return Math.round(winProbability(margin, variance) * 10000) / 10000;
}
