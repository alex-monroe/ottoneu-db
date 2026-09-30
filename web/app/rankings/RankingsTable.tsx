"use client";

import { useMemo, useState } from "react";
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
import { rankByPpg } from "@/lib/positional-rank";
import type { Column, PlayerHoverData, PositionalRank } from "@/lib/types";

export interface RankingRow {
  player_id: string;
  ottoneu_id: number;
  name: string;
  position: string;
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

export type RankingSort = "points" | "ppg";

/**
 * Put the choice in the URL without a server round trip, so a reload or a
 * shared link reads the same way, and switching position tabs (which does go
 * to the server, through TabBar, preserving other params) keeps it.
 */
function syncUrl(sort: RankingSort, minGames: number) {
  const params = new URLSearchParams(window.location.search);
  if (sort === "ppg") {
    params.set("sort", "ppg");
    params.set("min", String(minGames));
  } else {
    params.delete("sort");
    params.delete("min");
  }
  const qs = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

/**
 * One position's rankings, by total points or by PPG. PPG is re-ranked here —
 * among only the players with enough games, since a one-game rate tops the
 * list otherwise — rather than on the server, so the slider is instant.
 *
 * Columns carry `renderCell` functions, so they are built here in a client
 * component rather than passed from the server page.
 */
export default function RankingsTable({
  rows,
  hoverDataMap,
  season,
  maxGames,
  initialSort,
  initialMinGames,
}: {
  /** Every player at the position who has played, ranked by total points. */
  rows: RankingRow[];
  hoverDataMap: Record<string, PlayerHoverData>;
  season: number;
  /** How many games deep the season is — the slider's top. */
  maxGames: number;
  initialSort: RankingSort;
  initialMinGames: number;
}) {
  const [sort, setSort] = useState<RankingSort>(initialSort);
  const [minGames, setMinGames] = useState(initialMinGames);

  const shown = useMemo(() => {
    if (sort === "points") return rows;
    const ppgRanks = rankByPpg(rows, season, minGames);
    return rows
      .filter((r) => ppgRanks.has(r.player_id))
      .map((r) => {
        const pr = ppgRanks.get(r.player_id)!;
        return { ...r, rank: pr.rank, positional_rank: pr };
      })
      .sort((a, b) => a.rank - b.rank);
  }, [rows, season, sort, minGames]);

  const choose = (next: RankingSort, min = minGames) => {
    setSort(next);
    setMinGames(min);
    syncUrl(next, min);
  };

  const columns: Column<RankingRow>[] = [
    {
      key: "rank",
      label: sort === "ppg" ? "PPG Rank" : "Rank",
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-subtle">Rank by:</span>
          <div
            className="flex overflow-hidden rounded-md border border-line text-sm font-medium"
            role="group"
            aria-label="Rank by"
          >
            {(
              [
                ["points", "Total points"],
                ["ppg", "PPG"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={sort === id}
                onClick={() => choose(id)}
                className={`whitespace-nowrap px-3 py-1.5 transition-colors ${
                  sort === id
                    ? "bg-blue-600 text-white"
                    : "bg-raised text-ink-muted hover:bg-sunken"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {sort === "ppg" && maxGames > 1 && (
          <div className="w-full max-w-xs">
            <div className="flex items-baseline justify-between">
              <label htmlFor="min-games" className="text-sm font-medium text-ink-muted">
                Minimum games
              </label>
              <span className="font-mono text-sm font-semibold text-accent">{minGames}</span>
            </div>
            <input
              id="min-games"
              type="range"
              min={1}
              max={maxGames}
              step={1}
              value={minGames}
              onChange={(e) => choose("ppg", Number(e.target.value))}
              className="mt-1 w-full accent-blue-600"
            />
            <div className="flex justify-between font-mono text-[10px] text-ink-subtle">
              <span>1</span>
              <span>{maxGames}</span>
            </div>
          </div>
        )}
      </div>

      {sort === "ppg" && (
        <p className="text-xs text-ink-subtle">
          {shown.length} of {rows.length} players with at least {minGames}{" "}
          {minGames === 1 ? "game" : "games"}, ranked by points per game.
        </p>
      )}

      <DataTable columns={columns} data={shown} hoverDataMap={hoverDataMap} />
    </div>
  );
}
