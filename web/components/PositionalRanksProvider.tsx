"use client";

/**
 * Makes the current season's positional ranks available to every player name
 * on the site.
 *
 * Player names are rendered in dozens of places — DataTables, hand-rolled
 * tables, lineup slots, box scores — most of them client components fed rows
 * that know nothing about ranks. Threading a rank map through each would be
 * two dozen props that a new list would forget. Instead the root layout reads
 * the table once and provides it here, keyed by Ottoneu ID, and `PlayerName` /
 * `PlayerHoverCard` look their player up. A new list gets the tag by default.
 */
import { createContext, useContext, type ReactNode } from "react";
import { unpackRank } from "@/lib/positional-rank";
import type { PositionalRank, RankTable } from "@/lib/types";

const RanksContext = createContext<RankTable | null>(null);

export default function PositionalRanksProvider({
  table,
  children,
}: {
  table: RankTable | null;
  children: ReactNode;
}) {
  return <RanksContext.Provider value={table}>{children}</RanksContext.Provider>;
}

/**
 * A lookup for many players at once — for a list rendered in a `.map()`, where
 * a hook per row is not allowed.
 */
export function useRankLookup(): (ottoneuId: number | null | undefined) => PositionalRank | null {
  const table = useContext(RanksContext);
  return (ottoneuId) => unpackRank(table, ottoneuId);
}

/** This player's current-season rank, or null (no games yet, or no provider). */
export function usePositionalRank(ottoneuId: number | null | undefined): PositionalRank | null {
  return unpackRank(useContext(RanksContext), ottoneuId);
}
