/**
 * Column factory functions for DataTable.
 *
 * These factories inject React components (PositionBadge, PlayerName)
 * into column renderCell callbacks, ensuring every table renders player
 * data identically. This file lives in web/components/ because it
 * imports React components (web/lib/ must not).
 *
 * Usage:
 *   import { corePlayerCols, salaryCol, ppgCol } from "@/components/columns";
 *   const columns = [...corePlayerCols({ hoverDataMap }), salaryCol(), ppgCol()];
 */

import type React from "react";
import type { Column, PlayerHoverData } from "@/lib/types";
import PositionBadge from "@/components/PositionBadge";
import PlayerName from "@/components/PlayerName";

// =====================================================================
// Individual column factories
// =====================================================================

/**
 * Player name column. Supports three modes via hoverDataMap:
 * - Pass a map → hover card mode (link + rich preview)
 * - Pass null → link-only mode
 * - Pass undefined → plain text mode
 */
export function playerNameCol<Row>(opts?: {
  hoverDataMap?: Record<string, PlayerHoverData> | null;
  label?: string;
}): Column<Row> {
  const { hoverDataMap, label = "Player" } = opts ?? {};

  // Plain text — no links
  if (hoverDataMap === undefined) {
    return { key: "name", label };
  }

  // Link mode (null) or hover mode (map)
  return {
    key: "name",
    label,
    renderCell: (value: unknown, row: Row) => {
      const r = row as { player_id?: string; ottoneu_id?: number };
      const playerId = r.player_id;
      const ottoneuId = r.ottoneu_id;

      if (!ottoneuId) {
        return String(value ?? "—");
      }

      if (hoverDataMap && playerId) {
        return (
          PlayerName({
            name: String(value ?? "—"),
            ottoneuId,
            mode: "hover",
            hoverData: hoverDataMap[playerId],
          }) as React.ReactNode
        );
      }

      return (
        PlayerName({
          name: String(value ?? "—"),
          ottoneuId,
          mode: "link",
        }) as React.ReactNode
      );
    },
  };
}

/** Position column — renders a colored PositionBadge. */
export function positionCol<Row>(): Column<Row> {
  return {
    key: "position",
    label: "Pos",
    renderCell: (value: unknown) =>
      PositionBadge({ position: String(value ?? "") }) as React.ReactNode,
  };
}

/** NFL team column. */
export function nflTeamCol<Row>(label = "Team"): Column<Row> {
  return { key: "nfl_team", label };
}

/** Owner / team_name column. */
export function ownerCol<Row>(label = "Owner"): Column<Row> {
  return { key: "team_name", label };
}

/** Salary column (currency format). */
export function salaryCol<Row>(label = "Salary"): Column<Row> {
  return { key: "price", label, format: "currency" };
}

/** Dollar value column (currency format). */
export function valueCol<Row>(label = "Value"): Column<Row> {
  return { key: "dollar_value", label, format: "currency" };
}

/** Surplus column (currency format). */
export function surplusCol<Row>(label = "Surplus"): Column<Row> {
  return { key: "surplus", label, format: "currency" };
}

/** PPG column (2 decimal places). */
export function ppgCol<Row>(label = "PPG"): Column<Row> {
  return { key: "ppg", label, format: "decimal" };
}

/** Total points column (2 decimal places). */
export function totalPointsCol<Row>(label = "Points"): Column<Row> {
  return { key: "total_points", label, format: "decimal" };
}

/** Games played column. */
export function gamesPlayedCol<Row>(label = "GP"): Column<Row> {
  return { key: "games_played", label, format: "number" };
}

/** VORP per game column. */
export function vorpPerGameCol<Row>(label = "VORP/G"): Column<Row> {
  return { key: "vorp_per_game", label, format: "decimal" };
}

/** Full season VORP column. */
export function fullVorpCol<Row>(label = "Full VORP"): Column<Row> {
  return { key: "full_season_vorp", label, format: "decimal" };
}

// =====================================================================
// Precomposed column sets
// =====================================================================

/**
 * Core player identity columns: Player name + Position badge + NFL Team.
 * Pass hoverDataMap for hover cards, null for link-only, undefined for plain text.
 */
export function corePlayerCols<Row>(opts?: {
  hoverDataMap?: Record<string, PlayerHoverData> | null;
  nameLabel?: string;
}): Column<Row>[] {
  return [
    playerNameCol<Row>({
      hoverDataMap: opts?.hoverDataMap,
      label: opts?.nameLabel,
    }),
    positionCol<Row>(),
    nflTeamCol<Row>(),
  ];
}

/** Salary + Value + Surplus columns. */
export function surplusCols<Row>(): Column<Row>[] {
  return [salaryCol<Row>(), valueCol<Row>(), surplusCol<Row>()];
}

/** PPG + Total Points + Games Played. */
export function statsCols<Row>(): Column<Row>[] {
  return [ppgCol<Row>(), totalPointsCol<Row>(), gamesPlayedCol<Row>()];
}

/** VORP/G + Full Season VORP. */
export function vorpCols<Row>(): Column<Row>[] {
  return [vorpPerGameCol<Row>(), fullVorpCol<Row>()];
}
