/**
 * Shared column definitions for DataTable components.
 *
 * Centralizes column configurations to ensure consistency across
 * analysis pages and reduce duplication.
 *
 * ARCHITECTURE NOTE: This file is in web/lib/ and MUST NOT import from
 * web/components/. Column factories that inject React components
 * (PositionBadge, PlayerName, etc.) live in web/components/columns.tsx.
 */

import { Column } from "@/lib/types";

// =====================================================================
// Static column definitions (pure data, no React components)
// =====================================================================

export const CORE_PLAYER_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "Team" },
];

export const SALARY_COLUMNS: Column[] = [
  { key: "price", label: "Salary", format: "currency" },
  { key: "dollar_value", label: "Value", format: "currency", explain: "dollar_value" },
  { key: "surplus", label: "Surplus", format: "currency", explain: "surplus" },
];

export const STATS_COLUMNS: Column[] = [
  { key: "ppg", label: "PPG", format: "decimal", explain: "ppg" },
  { key: "total_points", label: "Points", format: "decimal" },
  { key: "games_played", label: "GP", format: "number" },
];

export const VORP_COLUMNS: Column[] = [
  { key: "vorp_per_game", label: "VORP/G", format: "decimal", explain: "vorp" },
  { key: "full_season_vorp", label: "Full VORP", format: "decimal", explain: "vorp" },
];

export const SURPLUS_TABLE_COLUMNS: Column[] = [
  ...CORE_PLAYER_COLUMNS,
  ...SALARY_COLUMNS,
  { key: "ppg", label: "PPG", format: "decimal", explain: "ppg" },
  { key: "full_season_vorp", label: "VORP", format: "decimal", explain: "vorp" },
  { key: "team_name", label: "Owner" },
];
