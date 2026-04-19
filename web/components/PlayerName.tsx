/**
 * Canonical player name renderer.
 *
 * Provides three modes of rendering so every player name across the app
 * uses the same visual treatment:
 *
 * - "link" (default): clickable link to /players/{ottoneuId}
 * - "hover": link wrapped in PlayerHoverCard for rich previews
 * - "plain": no link, just text (for public/read-only contexts)
 *
 * Optional badge slot for appending tags like "Rookie" or "College".
 */

"use client";

import Link from "next/link";
import type { PlayerHoverData } from "@/lib/types";
import PlayerHoverCard from "./PlayerHoverCard";
import type React from "react";

interface PlayerNameProps {
  name: string;
  /** Ottoneu ID used for building /players/{id} links */
  ottoneuId?: number;
  /** "link" = clickable, "hover" = link + hover card, "plain" = text only */
  mode?: "link" | "hover" | "plain";
  /** Required when mode is "hover" — the data to display in the hover card */
  hoverData?: PlayerHoverData;
  /** Optional inline elements to render after the name (e.g. Rookie/College badges) */
  badges?: React.ReactNode;
}

export default function PlayerName({
  name,
  ottoneuId,
  mode = "link",
  hoverData,
  badges,
}: PlayerNameProps) {
  if (mode === "plain" || !ottoneuId) {
    return (
      <span className="text-slate-900 dark:text-white font-medium">
        {name}
        {badges}
      </span>
    );
  }

  if (mode === "hover") {
    return (
      <span>
        <PlayerHoverCard
          name={name}
          ottoneuId={ottoneuId}
          hoverData={hoverData}
        />
        {badges}
      </span>
    );
  }

  // mode === "link"
  return (
    <span>
      <Link
        href={`/players/${ottoneuId}`}
        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
        onClick={(e) => e.stopPropagation()}
      >
        {name}
      </Link>
      {badges}
    </span>
  );
}
