/**
 * Canonical position-colored badge.
 *
 * Provides a consistent visual representation of player positions
 * across all views: tables, hover cards, search results, and player cards.
 */

import { POSITION_COLORS, type Position } from "@/lib/types";

interface PositionBadgeProps {
  position: string;
  /** "sm" for compact contexts (hover cards, search dropdowns), "md" for tables/headers */
  size?: "sm" | "md";
}

const SIZE_CLASSES = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-1.5 py-0.5 text-xs",
} as const;

export default function PositionBadge({
  position,
  size = "md",
}: PositionBadgeProps) {
  const color =
    POSITION_COLORS[position as Position] ?? "#6B7280";

  return (
    <span
      className={`inline-block rounded font-bold text-white ${SIZE_CLASSES[size]}`}
      style={{ backgroundColor: color }}
    >
      {position}
    </span>
  );
}
