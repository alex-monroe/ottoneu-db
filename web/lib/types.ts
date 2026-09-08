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
  // Expected games played (0–17) for the projection that set `ppg`, from
  // player_projections.projected_games (#587). Only populated on the projection
  // value paths (arbitration/projected modes); undefined on observed-PPG pages.
  // Value math (calculateVorp) uses it to availability-discount projected PPG;
  // `ppg` itself stays the raw rate for display.
  projected_games?: number | null;
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
  projection_method: string;  // active model name (e.g. "v25_draft_capital_residual"), "college_prospect", or "model" for ad-hoc backtests
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
  /**
   * Glossary term for this column, rendered as a "?" beside the header.
   * Keys come from `web/lib/glossary.ts`; typed loosely here because lib/types
   * must not import from a module that pulls in React components.
   */
  explain?: string;
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
  ds_auction_value?: number | null;
  market_auction_value?: number | null;
}

// === Position Constants ===

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K';

export const POSITIONS: readonly Position[] = ["QB", "RB", "WR", "TE", "K"];

/**
 * Position badge fills, paired with white text.
 *
 * These were the 500-weight Tailwind hues, every one of which failed WCAG AA
 * against the white label they carry — TE at 2.15:1 and WR at 2.54:1 were
 * effectively unreadable at the 10-12px the badge renders at. The 600/700
 * weights below keep the same hue identity and clear 4.5:1.
 *
 * `POSITION_COLORS_DARK` is the same set lightened for a dark ground, where the
 * badge is drawn with dark text instead; `PositionBadge` picks between them.
 */
export const POSITION_COLORS: Record<Position, string> = {
  QB: '#B91C1C', // red-700    5.94:1
  RB: '#1D4ED8', // blue-700   6.98:1
  WR: '#047857', // emerald-700 4.99:1
  TE: '#B45309', // amber-700  4.94:1
  K: '#6D28D9',  // violet-700 7.15:1
};

/** Lightened fills for dark mode; these carry dark text, not white. */
export const POSITION_COLORS_DARK: Record<Position, string> = {
  QB: '#FCA5A5', // red-300
  RB: '#93C5FD', // blue-300
  WR: '#6EE7B7', // emerald-300
  TE: '#FCD34D', // amber-300
  K: '#C4B5FD',  // violet-300
};
