"use client";

import DataTable from "@/components/DataTable";
import PositionBadge from "@/components/PositionBadge";
import {
  fantasyTeamCol,
  gamesPlayedCol,
  nflTeamCol,
  playerNameCol,
  ppgCol,
  totalPointsCol,
} from "@/components/columns";
import type { Column, PlayerHoverData, PositionalRank } from "@/lib/types";

export interface RankingRow {
  player_id: string;
  ottoneu_id: number;
  name: string;
  nfl_team: string;
  team_name: string | null;
  price: number;
  /** Numeric, so the column sorts; rendered from `positional_rank`. */
  rank: number;
  positional_rank: PositionalRank;
  games_played: number;
  total_points: number;
  ppg: number;
}

/**
 * One position's rankings. Columns carry `renderCell` functions, so they are
 * built here in a client component rather than passed from the server page.
 */
export default function RankingsTable({
  rows,
  hoverDataMap,
}: {
  rows: RankingRow[];
  hoverDataMap: Record<string, PlayerHoverData>;
}) {
  const columns: Column<RankingRow>[] = [
    {
      key: "rank",
      label: "Rank",
      renderCell: (_value, row) => (
        <PositionBadge position={row.positional_rank.position} rank={row.positional_rank} />
      ),
    },
    playerNameCol<RankingRow>({ hoverDataMap }),
    nflTeamCol<RankingRow>(),
    fantasyTeamCol<RankingRow>("Owner"),
    {
      key: "price",
      label: "Salary",
      // An unrostered player has no salary, not a $0 one.
      renderCell: (value, row) => (row.team_name ? `$${value}` : "—"),
    },
    totalPointsCol<RankingRow>(),
    gamesPlayedCol<RankingRow>(),
    ppgCol<RankingRow>(),
  ];

  return <DataTable columns={columns} data={rows} hoverDataMap={hoverDataMap} />;
}
