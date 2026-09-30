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
import PlayerRankTag from "./PlayerRankTag";
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
  /**
   * The "WR17 🔥" current-season rank tag after the name (PlayerRankTag). On by
   * default so every list carries it; turn off where the row already shows it.
   */
  showRankTag?: boolean;
}

export default function PlayerName({
  name,
  ottoneuId,
  mode = "link",
  hoverData,
  badges,
  showRankTag = true,
}: PlayerNameProps) {
  const tag = showRankTag ? <PlayerRankTag ottoneuId={ottoneuId} /> : null;

  if (mode === "plain" || !ottoneuId) {
    return (
      <span className="text-ink font-medium">
        {name}
        {tag}
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
          showRankTag={showRankTag}
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
        className="text-accent hover:underline font-medium"
        onClick={(e) => e.stopPropagation()}
      >
        {name}
      </Link>
      {tag}
      {badges}
    </span>
  );
}
