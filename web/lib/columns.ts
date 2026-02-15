/**
 * Shared column definitions for DataTable components.
 *
 * Centralizes column configurations to ensure consistency across
 * analysis pages and reduce duplication.
 */

import { Column } from "@/components/DataTable";

export const CORE_PLAYER_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "Team" },
];

export const SALARY_COLUMNS: Column[] = [
  { key: "price", label: "Salary", format: "currency" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "surplus", label: "Surplus", format: "currency" },
];

export const STATS_COLUMNS: Column[] = [
  { key: "ppg", label: "PPG", format: "decimal" },
  { key: "total_points", label: "Points", format: "decimal" },
  { key: "games_played", label: "GP", format: "number" },
];

export const VORP_COLUMNS: Column[] = [
  { key: "vorp_per_game", label: "VORP/G", format: "decimal" },
  { key: "full_season_vorp", label: "Full VORP", format: "decimal" },
];

export const SURPLUS_TABLE_COLUMNS: Column[] = [
  ...CORE_PLAYER_COLUMNS,
  ...SALARY_COLUMNS,
  { key: "ppg", label: "PPG", format: "decimal" },
  { key: "full_season_vorp", label: "VORP", format: "decimal" },
  { key: "team_name", label: "Owner" },
];
