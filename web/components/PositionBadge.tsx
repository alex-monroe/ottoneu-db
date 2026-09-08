/**
 * Canonical position-colored badge.
 *
 * The fill is set through CSS custom properties rather than a plain
 * `backgroundColor`, so the badge can carry a light-mode and a dark-mode value
 * from a server component with no client JS. The old version hard-coded one
 * 500-weight hex per position, which meant (a) the badge never adapted to dark
 * mode at all, and (b) every one of the five failed WCAG AA against its own
 * white label — TE measured 2.15:1.
 */

import { POSITION_COLORS, POSITION_COLORS_DARK, type Position } from "@/lib/types";

interface PositionBadgeProps {
  position: string;
  /** "sm" for compact contexts (hover cards, search dropdowns), "md" for tables/headers */
  size?: "sm" | "md";
}

const SIZE_CLASSES = {
  sm: "px-1.5 py-0.5 text-[11px]",
  md: "px-2 py-0.5 text-xs",
} as const;

export default function PositionBadge({
  position,
  size = "md",
}: PositionBadgeProps) {
  const key = position as Position;
  const light = POSITION_COLORS[key] ?? "#475569"; // slate-600
  const dark = POSITION_COLORS_DARK[key] ?? "#cbd5e1"; // slate-300

  return (
    <span
      className={`position-badge inline-block rounded font-bold ${SIZE_CLASSES[size]}`}
      style={
        {
          "--pos-light": light,
          "--pos-dark": dark,
        } as React.CSSProperties
      }
    >
      {position}
    </span>
  );
}
