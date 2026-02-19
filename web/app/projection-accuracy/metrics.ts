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

export function calculateMetrics(
  players: BacktestPlayer[],
  position = "ALL"
): PositionMetrics {
  const n = players.length;
  if (n === 0) {
    return { position, count: 0, mae: 0, bias: 0, r2: 0, rmse: 0 };
  }

  const mae = players.reduce((sum, p) => sum + p.abs_error, 0) / n;
  const bias = players.reduce((sum, p) => sum + p.error, 0) / n;

  const mean_actual = players.reduce((sum, p) => sum + p.actual_ppg, 0) / n;
  const ss_tot = players.reduce(
    (sum, p) => sum + Math.pow(p.actual_ppg - mean_actual, 2),
    0
  );
  const ss_res = players.reduce(
    (sum, p) => sum + Math.pow(p.actual_ppg - p.projected_ppg, 2),
    0
  );
  const r2 = ss_tot === 0 ? 0 : Math.max(0, 1 - ss_res / ss_tot);
  const rmse = Math.sqrt(ss_res / n);

  return { position, count: n, mae, bias, r2, rmse };
}

/**
 * Returns metrics for all positions combined (index 0) followed by one entry
 * per position in the provided list.
 */
export function calculateMetricsByPosition(
  players: BacktestPlayer[],
  positions: readonly string[]
): PositionMetrics[] {
  const all = calculateMetrics(players, "ALL");
  const perPosition = positions.map((pos) =>
    calculateMetrics(
      players.filter((p) => p.position === pos),
      pos
    )
  );
  return [all, ...perPosition];
}
