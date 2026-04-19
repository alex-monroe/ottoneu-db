/**
 * Shared TypeScript type definitions for Ottoneu DB frontend.
 *
 * This module provides type safety across the application for player data,
 * analysis metrics, chart components, and UI helpers.
 */

import type React from "react";

// === Core Player Types ===
// Layered type hierarchy: CorePlayer → RosteredPlayer → StatsPlayer
// Each layer adds data from a different source.

/** Core identity — always available from the `players` table. */
export interface CorePlayer {
  player_id: string;
  ottoneu_id: number;
  name: string;
  position: string;
  nfl_team: string;
  birth_date: string | null;
  is_college: boolean;
}

/** CorePlayer + Ottoneu league context from `league_prices`. */
export interface RosteredPlayer extends CorePlayer {
  price: number;            // from league_prices (0 if unrostered)
  team_name: string | null; // from league_prices (null if FA)
}

/** RosteredPlayer + current season stats from `player_stats`. */
export interface StatsPlayer extends RosteredPlayer {
  total_points: number;
  games_played: number;
  snaps: number;
  ppg: number;
  pps: number;
}

/** Full player with stats — used by analysis pages (VORP, surplus, arb, etc.). */
export type Player = StatsPlayer;

export interface VorpPlayer extends Player {
  replacement_ppg: number;
  vorp_per_game: number;
  full_season_vorp: number;
}

export interface SurplusPlayer extends VorpPlayer {
  dollar_value: number;
  surplus: number;
}

export interface ProjectedSalaryPlayer extends SurplusPlayer {
  recommendation: string;
}

export interface ArbitrationTarget extends SurplusPlayer {
  salary_after_arb: number;
  surplus_after_arb: number;
}

/** Rostered player with PPG and games — used by the public arb planner. */
export interface PublicArbPlayer extends RosteredPlayer {
  ppg: number;
  games_played: number;
}

export interface TeamAllocation {
  team: string;
  suggested: number;
  players: {
    name: string;
    position: string;
    price: number;
    dollar_value: number;
    surplus: number;
    surplus_after_arb: number;
  }[];
}

export interface SimulationResult extends SurplusPlayer {
  mean_arb: number;
  std_arb: number;
  min_arb: number;
  max_arb: number;
  pct_protected: number;
  salary_after_arb: number;
  surplus_after_arb: number;
}

// === Chart Types ===

export interface ChartPoint {
  name: string;
  position: string;
  nfl_team: string;
  total_points: number;
  ppg: number;
  pps: number;
  price: number;
  cost_per_ppg: number;
  cost_per_pps: number;
  games_played: number;
  snaps: number;
}

// === Tier Breakdown Types ===

export interface TierStat {
  label: string;     // "#1", "#12", "#24", "#36"
  tierSize: number;  // requested rank (1, 12, 24, 36)
  n: number;         // actual player count at this position (0 = no player at this rank)
  ppg: number;       // PPG of the Nth-ranked player
  price: number;     // salary of the Nth-ranked player
}

export interface PositionTierData {
  position: Position;
  tiers: TierStat[];
}

export interface FlexTierData {
  top36: TierStat;  // composite RB + WR + TE pool, top 36 by PPG
}

export interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  metric?: 'PPG' | 'PPS';
}

// === Player Card Types ===

export interface SeasonStats {
  season: number;
  total_points: number | null;
  games_played: number | null;
  snaps: number | null;
  ppg: number | null;
  pps: number | null;
}

export interface MultiSeasonStats {
  player_id: string;
  season: number;
  ppg: number;
  games_played: number;
  h1_snaps?: number;
  h1_games?: number;
  h2_snaps?: number;
  h2_games?: number;
}

/**
 * Player list item for the /players directory page.
 * Uses `id` (not `player_id`) because it maps directly from the players table.
 * Stats and price are nullable because not all players have current-season data.
 */
export interface PlayerListItem {
  id: string;
  ottoneu_id: number;
  name: string;
  position: string;
  nfl_team: string;
  price: number | null;
  team_name: string | null;
  total_points: number | null;
  ppg: number | null;
  games_played: number | null;
}

export interface Transaction {
  id: string;
  transaction_type: string;
  team_name: string | null;
  from_team: string | null;
  salary: number | null;
  transaction_date: string | null;
  raw_description: string | null;
}

export interface PlayerCardData {
  id: string;
  ottoneu_id: number;
  name: string;
  position: string;
  nfl_team: string;
  birth_date: string | null;
  price: number | null;
  team_name: string | null;
  seasonStats: SeasonStats[];
  transactions: Transaction[];
}

// === Backtest Types ===

export interface BacktestPlayer {
  player_id: string;
  name: string;
  position: string;
  nfl_team: string;
  team_name: string | null;
  price: number;
  projected_ppg: number;
  actual_ppg: number;
  error: number;              // actual - projected (signed)
  abs_error: number;
  seasons_used: string;       // pre-serialized: "2022, 2023, 2024"
  games_played: number;
  projection_method: string;  // "rookie_trajectory" | "weighted_average_ppg" | "model"
  feature_values?: Record<string, number | null> | null;
}

// === Projection Model Types ===

export interface ProjectionModel {
  id: string;
  name: string;
  version: number;
  description: string | null;
  features: string[];
  is_baseline: boolean;
  is_active: boolean;
}

export interface BacktestMetrics {
  model_id: string;
  season: number;
  position: string | null;
  player_count: number | null;
  mae: number | null;
  bias: number | null;
  r_squared: number | null;
  rmse: number | null;
}

// === Arbitration Planner Types ===

export interface ArbitrationPlan {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArbitrationPlanWithAllocations extends ArbitrationPlan {
  allocations: Record<string, number>; // player_id -> amount (0-4)
}

export interface TeamBudgetStatus {
  team_name: string;
  allocated: number;
  isValid: boolean;
}

// === DataTable Types ===

/**
 * Column definition for DataTable, generic over the row type so renderCell
 * receives a typed `row` instead of an opaque `TableRow`.
 *
 * `key` stays `string` (not `keyof Row`) on purpose — pages routinely add
 * derived columns (computed deltas, projection method labels, etc.) that
 * don't exist on the source row's static type.
 */
export interface Column<Row = TableRow> {
  key: string;
  label: string;
  format?: "currency" | "number" | "decimal" | "percent";
  renderCell?: (value: unknown, row: Row) => React.ReactNode;
}

export interface HighlightRule<Row = TableRow> {
  key: keyof Row & string;
  op: "lt" | "gt" | "gte" | "lte" | "eq";
  value: number | string;
  className: string;
}

/**
 * Default row shape for tables that don't supply a generic argument.
 * Loosened to `unknown` (from a primitive union) so rows carrying nested
 * objects — e.g. BacktestPlayer.feature_values — can flow through DataTable
 * without an unsafe cast.
 */
export type TableRow = Record<string, unknown>;

// === Player Hover Card Types ===

export interface PlayerHoverData {
  ottoneu_id: number;
  position: string;
  nfl_team: string;
  price: number;
  team_name: string | null;
  ppg: number;
  games_played: number;
  projected_ppg?: number;
  projection_method?: string;
}

// === Position Constants ===

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K';

export const POSITIONS: readonly Position[] = ["QB", "RB", "WR", "TE", "K"];

export const POSITION_COLORS: Record<Position, string> = {
  QB: '#EF4444',
  RB: '#3B82F6',
  WR: '#10B981',
  TE: '#F59E0B',
  K: '#8B5CF6',
};
