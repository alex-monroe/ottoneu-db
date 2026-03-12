/**
 * Pure metric calculation functions for projection accuracy backtesting.
 * No side effects, no imports from app code.
 */

import type { BacktestPlayer } from "@/lib/types";

export interface PositionMetrics {
  position: string;
  count: number;
  mae: number;
  bias: number;
  r2: number;
  rmse: number;
  [key: string]: string | number | null | undefined;
}

// ⚡ Bolt: Replaced multiple .reduce() calls with a single-pass loop to eliminate O(5N) iteration overhead.
export function calculateMetrics(
  players: BacktestPlayer[],
  position = "ALL"
): PositionMetrics {
  const n = players.length;
  if (n === 0) {
    return { position, count: 0, mae: 0, bias: 0, r2: 0, rmse: 0 };
  }

  let sum_abs_error = 0;
  let sum_error = 0;
  let sum_actual_ppg = 0;

  for (let i = 0; i < n; i++) {
    const p = players[i];
    sum_abs_error += p.abs_error;
    sum_error += p.error;
    sum_actual_ppg += p.actual_ppg;
  }

  const mae = sum_abs_error / n;
  const bias = sum_error / n;
  const mean_actual = sum_actual_ppg / n;

  let ss_tot = 0;
  let ss_res = 0;

  for (let i = 0; i < n; i++) {
    const p = players[i];
    const diff_tot = p.actual_ppg - mean_actual;
    ss_tot += diff_tot * diff_tot;
    const diff_res = p.actual_ppg - p.projected_ppg;
    ss_res += diff_res * diff_res;
  }

  const r2 = ss_tot === 0 ? 0 : Math.max(0, 1 - ss_res / ss_tot);
  const rmse = Math.sqrt(ss_res / n);

  return { position, count: n, mae, bias, r2, rmse };
}

/**
 * Returns metrics for all positions combined (index 0) followed by one entry
 * per position in the provided list.
 */
// ⚡ Bolt: Replaced O(P * N) .filter() scanning with a single-pass O(N) Map grouping.
export function calculateMetricsByPosition(
  players: BacktestPlayer[],
  positions: readonly string[]
): PositionMetrics[] {
  const byPosition = new Map<string, BacktestPlayer[]>();
  for (let i = 0; i < positions.length; i++) {
    byPosition.set(positions[i], []);
  }

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const arr = byPosition.get(p.position);
    // Ignore players with positions not in the requested positions array
    if (arr !== undefined) arr.push(p);
  }

  const all = calculateMetrics(players, "ALL");
  const perPosition = positions.map((pos) =>
    calculateMetrics(byPosition.get(pos) || [], pos)
  );
  return [all, ...perPosition];
}
