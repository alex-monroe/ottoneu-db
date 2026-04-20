import { ARB_MAX_PER_PLAYER_LEAGUE, NUM_TEAMS } from "@/lib/config";
import type { PlayerHoverData } from "@/lib/types";
import type { Allocation, PlayerAllocationDetail } from "@/lib/arb-progress";
import AllocationDetailsTable from "./AllocationDetailsTable";

interface AllocationsSectionProps {
  allocations: Allocation[];
  detailsByPlayer: Record<number, PlayerAllocationDetail[]>;
  hoverDataMap: Record<string, PlayerHoverData> | null;
  completeCount: number;
  allComplete: boolean;
}

export default function AllocationsSection({
  allocations,
  detailsByPlayer,
  hoverDataMap,
  completeCount,
  allComplete,
}: AllocationsSectionProps) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
        Current Allocations
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        Players with salary raises from arbitration. Red rows indicate raises of $10 or more.
        {!allComplete && completeCount > 0 && (
          <> Projected columns extrapolate final raises assuming remaining teams allocate at the same rate ({completeCount} of {NUM_TEAMS} teams complete, max ${ARB_MAX_PER_PLAYER_LEAGUE} cap).</>
        )}
      </p>
      <AllocationDetailsTable
        data={allocations}
        hoverDataMap={hoverDataMap}
        detailsByPlayer={detailsByPlayer}
      />
    </section>
  );
}
