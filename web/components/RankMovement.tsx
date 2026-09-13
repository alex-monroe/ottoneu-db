import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { movementLabel } from "@/lib/power-rankings";

/** Movement chip: climbed, fell, held, or brand new to the ranking. */
export default function RankMovement({ movement }: { movement: number | null }) {
  const label = movementLabel(movement);
  if (movement === null) {
    return (
      <span className="inline-flex items-center rounded bg-sunken px-2 py-0.5 text-xs font-medium text-ink-subtle">
        new
      </span>
    );
  }
  if (movement === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-sunken px-2 py-0.5 text-xs font-medium text-ink-subtle">
        <Minus size={12} aria-hidden="true" />
        held
      </span>
    );
  }
  const up = movement > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
        up
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
          : "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200"
      }`}
      title={`${up ? "Up" : "Down"} ${Math.abs(movement)} from last week`}
    >
      {up ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
      {label}
    </span>
  );
}
