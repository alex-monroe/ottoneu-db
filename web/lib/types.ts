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
  total_points: number;
  games_played: number;
  snaps: number;
  ppg: number;
  pps: number;
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
  error: number;         // actual - projected (signed)
  abs_error: number;
  seasons_used: string;  // pre-serialized: "2022, 2023, 2024"
  games_played: number;
  [key: string]: string | number | null | undefined;
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
