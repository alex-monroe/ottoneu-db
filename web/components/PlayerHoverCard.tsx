"use client";

import TeamName from "./TeamName";
import Link from "next/link";
import * as HoverCard from "@radix-ui/react-hover-card";
import type { Column, PlayerHoverData } from "@/lib/types";
import PositionBadge from "./PositionBadge";

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
  return (
    <HoverCard.Root openDelay={200} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <Link
          href={`/players/${ottoneuId}`}
          className="text-accent hover:underline"
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
          className="z-50 w-64 rounded-lg border border-line bg-raised shadow-lg p-3 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {hoverData ? (
            <div className="space-y-2">
              {/* Header: Name + Position + Team */}
              <div className="flex items-center gap-2">
                <PositionBadge position={hoverData.position} size="sm" />
                <span className="font-semibold text-sm text-ink truncate">
                  {name}
                </span>
              </div>
              <p className="text-xs text-ink-subtle">
                {hoverData.nfl_team}
              </p>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-subtle">Salary</span>
                  <span className="font-mono font-medium text-ink-muted">
                    ${hoverData.price}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-subtle">Owner</span>
                  <span className="font-medium truncate ml-1">
                    <TeamName name={hoverData.team_name} />
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-subtle">PPG</span>
                  <span className="font-mono font-medium text-ink-muted">
                    {hoverData.ppg.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-subtle">Games</span>
                  <span className="font-mono font-medium text-ink-muted">
                    {hoverData.games_played}
                  </span>
                </div>
                {hoverData.projected_ppg != null && (
                  <div className="flex justify-between col-span-2 pt-1 border-t border-line">
                    <span className="text-accent font-medium">
                      Proj. PPG
                    </span>
                    <span className="font-mono font-bold text-accent">
                      {hoverData.projected_ppg.toFixed(2)}
                    </span>
                  </div>
                )}
                {hoverData.ds_auction_value != null && (
                  <div className="flex justify-between">
                    <span className="text-violet-600 dark:text-violet-400 font-medium">
                      DS Projected Value
                    </span>
                    <span className="font-mono font-medium text-violet-600 dark:text-violet-400">
                      ${hoverData.ds_auction_value}
                    </span>
                  </div>
                )}
                {hoverData.market_auction_value != null && (
                  <div className="flex justify-between">
                    <span className="text-violet-600 dark:text-violet-400 font-medium">
                      Benchmark Value
                    </span>
                    <span className="font-mono font-medium text-violet-600 dark:text-violet-400">
                      ${hoverData.market_auction_value}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink-subtle">
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
export function makePlayerNameColumn<Row>(
  hoverDataMap: Record<string, PlayerHoverData> | null,
  label = "Player"
): Column<Row> {
  if (!hoverDataMap) {
    return { key: "name", label };
  }
  return {
    key: "name",
    label,
    renderCell: (value: unknown, row: Row) => {
      const r = row as { player_id?: string; ottoneu_id?: number };
      const playerId = r.player_id;
      const ottoneuId = r.ottoneu_id;
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
