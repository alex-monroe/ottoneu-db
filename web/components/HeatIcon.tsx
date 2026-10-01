/**
 * 🔥 / ❄️ beside a positional-rank chip, when a player's PPG rank and his
 * total-points rank disagree dramatically (web/lib/positional-rank.ts,
 * `classifyHeat`). Renders nothing otherwise — which is almost always.
 */
import { describeHeat } from "@/lib/positional-rank";
import type { PositionalRank } from "@/lib/types";

export default function HeatIcon({
  rank,
  size = "md",
}: {
  rank: PositionalRank | null | undefined;
  size?: "sm" | "md";
}) {
  const text = rank ? describeHeat(rank) : null;
  if (!rank?.heat || !text) return null;
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      className={`cursor-help leading-none ${size === "sm" ? "text-sm" : "text-lg"}`}
    >
      {rank.heat === "fire" ? "🔥" : "❄️"}
    </span>
  );
}
