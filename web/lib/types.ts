/**
 * Shared TypeScript type definitions for Ottoneu DB frontend.
 *
 * This module provides type safety across the application for player data,
 * analysis metrics, chart components, and UI helpers.
 */

// === Core Player Types ===

export interface Player {
  player_id: string;
  name: string;
  position: string;
  nfl_team: string;
  price: number;
  team_name: string | null;
  birth_date?: string | null;
  is_college?: boolean;
  total_points: number;
  games_played: number;
  snaps: number;
  ppg: number;
  pps: number;
  [key: string]: string | number | boolean | null | undefined;
}

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
  projection_method: string;  // "rookie_trajectory" | "weighted_average_ppg"
  [key: string]: string | number | null | undefined;
}

// === DataTable Types ===

export interface Column {
  key: string;
  label: string;
  format?: "currency" | "number" | "decimal" | "percent";
}

export interface HighlightRule {
  key: string;
  op: "lt" | "gt" | "gte" | "lte" | "eq";
  value: number | string;
  className: string;
}

export type TableRow = Record<string, string | number | boolean | null | undefined>;

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
