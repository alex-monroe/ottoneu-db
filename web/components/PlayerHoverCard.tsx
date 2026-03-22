"use client";

import Link from "next/link";
import * as HoverCard from "@radix-ui/react-hover-card";
import type { Column, PlayerHoverData, Position, TableRow } from "@/lib/types";
import { POSITION_COLORS } from "@/lib/types";

interface PlayerHoverCardProps {
  name: string;
  ottoneuId: number;
  hoverData?: PlayerHoverData;
}

export default function PlayerHoverCard({
  name,
  ottoneuId,
  hoverData,
}: PlayerHoverCardProps) {
  const posColor =
    hoverData
      ? POSITION_COLORS[hoverData.position as Position] ?? "#6B7280"
      : "#6B7280";

  return (
    <HoverCard.Root openDelay={200} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <Link
          href={`/players/${ottoneuId}`}
          className="text-blue-600 dark:text-blue-400 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {name}
        </Link>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="bottom"
          align="start"
          sideOffset={4}
          className="z-50 w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-3 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {hoverData ? (
            <div className="space-y-2">
              {/* Header: Name + Position + Team */}
              <div className="flex items-center gap-2">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                  style={{ backgroundColor: posColor }}
                >
                  {hoverData.position}
                </span>
                <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                  {name}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {hoverData.nfl_team}
              </p>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Salary</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                    ${hoverData.price}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Owner</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate ml-1">
                    {hoverData.team_name ?? "FA"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">PPG</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                    {hoverData.ppg.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Games</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                    {hoverData.games_played}
                  </span>
                </div>
                {hoverData.projected_ppg != null && (
                  <div className="flex justify-between col-span-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      Proj. PPG
                    </span>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {hoverData.projected_ppg.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {name}
            </p>
          )}
          <HoverCard.Arrow className="fill-white dark:fill-slate-900" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

/**
 * Factory function to create a player name column with hover cards.
 * Pass null for hoverDataMap to get a plain text column (no hover).
 */
export function makePlayerNameColumn(
  hoverDataMap: Record<string, PlayerHoverData> | null,
  label = "Player"
): Column {
  if (!hoverDataMap) {
    return { key: "name", label };
  }
  return {
    key: "name",
    label,
    renderCell: (value: unknown, row: TableRow) => {
      const playerId = row.player_id as string | undefined;
      const ottoneuId = row.ottoneu_id as number | undefined;
      if (!playerId || !ottoneuId) return String(value ?? "—");
      return (
        <PlayerHoverCard
          name={String(value)}
          ottoneuId={ottoneuId}
          hoverData={hoverDataMap[playerId]}
        />
      );
    },
  };
}
