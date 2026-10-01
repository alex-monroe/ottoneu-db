"use client";

/**
 * The rank tag beside a player's name in a list: "WR17", plus 🔥/❄️ when his
 * PPG rank and total-points rank disagree dramatically. The same chip and icon
 * as the player page header, at list size. Renders nothing for a player with
 * no current-season rank (he has not played), so a list never shows a gap.
 */
import { usePositionalRank } from "./PositionalRanksProvider";
import PositionBadge from "./PositionBadge";
import HeatIcon from "./HeatIcon";

export default function PlayerRankTag({ ottoneuId }: { ottoneuId: number | null | undefined }) {
  const rank = usePositionalRank(ottoneuId);
  if (!rank) return null;
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 whitespace-nowrap align-middle">
      <PositionBadge position={rank.position} rank={rank} size="sm" />
      <HeatIcon rank={rank} size="sm" />
    </span>
  );
}
