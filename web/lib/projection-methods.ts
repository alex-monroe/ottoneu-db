/**
 * Projection methods for forecasting player PPG.
 *
 * Each method implements the ProjectionMethod interface:
 *   projectPpg(history) -> number | null
 *
 * Adding a new projection method = one new class, no pipeline changes needed.
 */

export interface SeasonData {
  season: number;
  ppg: number;
  games_played: number;
}

export interface ProjectionMethod {
  name: string;
  projectPpg(history: SeasonData[]): number | null;
}

/**
 * Games-weighted, recency-weighted average PPG.
 *
 * Most recent season gets highest recency weight. Each season's contribution
 * is further scaled by games_played / 17 to discount injury-shortened years.
 *
 * Recency weights (most recent first): 0.50, 0.30, 0.20
 */
export class WeightedAveragePPG implements ProjectionMethod {
  readonly name = "weighted_average_ppg";

  // Recency weights from most-recent to oldest season
  private static readonly RECENCY_WEIGHTS = [0.50, 0.30, 0.20];

  projectPpg(history: SeasonData[]): number | null {
    if (history.length === 0) return null;

    // Sort ascending by season and take up to 3 most recent
    const sorted = [...history].sort((a, b) => a.season - b.season);
    const recent = sorted.slice(-3); // at most 3, most recent last

    const n = recent.length;
    const weightsToUse = WeightedAveragePPG.RECENCY_WEIGHTS.slice(0, n);

    let numerator = 0;
    let denominator = 0;

    // Iterate from most recent (end of array) to oldest
    for (let i = 0; i < recent.length; i++) {
      const seasonData = recent[recent.length - 1 - i]; // most recent first
      const recencyW = weightsToUse[i];
      const gamesScale = seasonData.games_played / 17;
      const effectiveW = recencyW * gamesScale;

      numerator += seasonData.ppg * effectiveW;
      denominator += effectiveW;
    }

    if (denominator === 0) return null;
    return numerator / denominator;
  }
}
