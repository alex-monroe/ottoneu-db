/**
 * Reusable position filter button group.
 *
 * Provides a consistent UI for filtering players by position across
 * analysis pages. Supports multi-select and optional "All" button.
 */

import { Position, POSITION_COLORS } from "@/lib/types";

interface PositionFilterProps {
  positions: readonly Position[];
  selectedPositions: Position[];
  onToggle: (position: Position) => void;
  showAll?: boolean;
  onToggleAll?: () => void;
}

export default function PositionFilter({
  positions,
  selectedPositions,
  onToggle,
  showAll = false,
  onToggleAll,
}: PositionFilterProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by Position">
      {showAll && onToggleAll && (
        <button
          onClick={onToggleAll}
          aria-pressed={selectedPositions.length === positions.length ? "true" : "false"}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 ${
            selectedPositions.length === positions.length
              ? "bg-slate-700 text-white border-transparent"
              : "bg-transparent text-slate-500 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          All
        </button>
      )}
      {positions.map((pos) => (
        <button
          key={pos}
          onClick={() => onToggle(pos)}
          aria-pressed={selectedPositions.includes(pos) ? "true" : "false"}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 ${
            selectedPositions.includes(pos)
              ? "text-white border-transparent"
              : "bg-transparent text-slate-500 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
          style={{
            backgroundColor: selectedPositions.includes(pos)
              ? POSITION_COLORS[pos]
              : undefined,
          }}
        >
          {pos}
        </button>
      ))}
    </div>
  );
}
