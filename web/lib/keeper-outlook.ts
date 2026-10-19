/**
 * Reading a keeper outlook against a salary — pure.
 *
 * Ottoneu offseason cuts are free, so a contract is a call option on next
 * season's value: worth E[max(0, V − salary)], not E[V] − salary. A young
 * player whose median outcome is below his salary can still be worth keeping
 * for the chance he breaks out, and the old point read (`max(0, value −
 * salary)`) priced that chance at zero.
 *
 * The distributions are fitted and stored by scripts/keeper_value/publish.py
 * (`keeper_outlook`, migration 052) as 20 equal-probability quantiles, so an
 * expectation is a plain mean over them. See docs/references/keeper-value.md.
 */

import type { KeeperOutlook, KeeperRead } from "./types";

/** E[max(0, V − salary)] over the quantile grid. */
export function optionValue(quantiles: readonly number[], salary: number): number {
  if (quantiles.length === 0) return 0;
  return quantiles.reduce((s, q) => s + Math.max(0, q - salary), 0) / quantiles.length;
}

/** P(V > salary): the share of the grid above it (5% resolution). */
export function probKeepable(quantiles: readonly number[], salary: number): number {
  if (quantiles.length === 0) return 0;
  return quantiles.filter((q) => q > salary).length / quantiles.length;
}

export function readKeeper(outlook: KeeperOutlook, nextSalary: number): KeeperRead {
  return {
    optionValue: Math.round(optionValue(outlook.quantiles, nextSalary) * 100) / 100,
    pKeepable: probKeepable(outlook.quantiles, nextSalary),
    p10: outlook.p10,
    p50: outlook.p50,
    p90: outlook.p90,
    ownWeight: outlook.ownWeight,
    season: outlook.season,
    asOfWeek: outlook.asOfWeek,
  };
}

/** player id → that player's snapshots for one season, oldest week first. */
export type OutlookSeason = Map<string, KeeperOutlook[]>;

/** Group rows by season and player, each player's snapshots sorted by week. */
export function groupOutlooks(rows: readonly KeeperOutlook[]): Map<number, OutlookSeason> {
  const out = new Map<number, OutlookSeason>();
  for (const r of rows) {
    const season = out.get(r.season) ?? new Map<string, KeeperOutlook[]>();
    const list = season.get(r.playerId) ?? [];
    list.push(r);
    season.set(r.playerId, list);
    out.set(r.season, season);
  }
  for (const season of out.values()) {
    for (const list of season.values()) list.sort((a, b) => a.asOfWeek - b.asOfWeek);
  }
  return out;
}

/**
 * The newest snapshot taken no later than `week` — what was knowable then.
 * Null when the player has none that early (or none at all).
 */
export function outlookAsOf(
  snapshots: readonly KeeperOutlook[] | undefined,
  week: number = Number.POSITIVE_INFINITY,
): KeeperOutlook | null {
  if (!snapshots) return null;
  let best: KeeperOutlook | null = null;
  for (const s of snapshots) if (s.asOfWeek <= week) best = s;
  return best;
}
