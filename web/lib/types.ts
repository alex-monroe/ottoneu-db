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
