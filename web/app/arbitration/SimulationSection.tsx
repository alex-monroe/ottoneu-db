import {
  fetchAndMergeProjectedData,
  fetchHoverExtras,
  buildHoverDataMap,
  fetchPlayersPreArb,
  LEAGUE_ID,
} from "@/lib/analysis";
import { getStatsSeason, getProjectionSeason } from "@/lib/season";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/auth";
import SimulationControls from "@/app/arbitration-simulation/SimulationControls";
import ModeToggle, { ValueMode } from "@/components/ModeToggle";

/**
 * Monte Carlo arbitration simulation panel. Rendered inside the tabbed
 * /arbitration page; the value mode is owned by the parent and passed in.
 */
export default async function SimulationSection({ mode }: { mode: ValueMode }) {
  const isAdjusted = mode === "adjusted";
  const isProjected = mode === "projected";

  const [user, statsSeason, projectionSeason] = await Promise.all([
    getAuthenticatedUser(),
    getStatsSeason(),
    getProjectionSeason(),
  ]);
  const [rawPlayers, adjRes] = await Promise.all([
    isProjected
      ? fetchAndMergeProjectedData(projectionSeason, fetchPlayersPreArb)
      : fetchPlayersPreArb(),
    user
      ? getSupabaseAdmin()
          .from("surplus_adjustments")
          .select("player_id, adjustment")
          .eq("league_id", LEAGUE_ID)
          .eq("user_id", user.userId)
          .neq("adjustment", 0)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const hasAdjustments = (adjRes.data?.length ?? 0) > 0;

  let initialAdjustments: Record<string, number> | undefined;
  if (isAdjusted && adjRes.data && adjRes.data.length > 0) {
    initialAdjustments = Object.fromEntries(
      adjRes.data.map((r) => [String(r.player_id), Number(r.adjustment)])
    );
  }

  const label = isProjected ? projectionSeason : statsSeason;

  const { projMap, dsMap } = await fetchHoverExtras(!!user?.hasProjectionsAccess);
  const hoverDataMap = buildHoverDataMap(rawPlayers, projMap, dsMap);

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Arbitration Simulation ({label})
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              Monte Carlo simulation of how all 12 teams will allocate their arbitration budgets.
              {isProjected && (
                <> Using <strong>projected PPG</strong> values.</>
              )}
              {!isProjected && (
                <> Adjust parameters below to explore different scenarios.</>
              )}
            </p>
          </div>
          <ModeToggle
            currentMode={mode}
            basePath="/arbitration"
            extraParams={{ tab: "simulation" }}
            hasAdjustments={hasAdjustments}
          />
        </div>
        {isAdjusted && hasAdjustments && (
          <div className="mt-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2 text-sm text-blue-800 dark:text-blue-300">
            Showing results with your manual surplus adjustments applied.
          </div>
        )}
      </header>

      <SimulationControls
        initialPlayers={rawPlayers}
        initialAdjustments={initialAdjustments}
        hoverDataMap={hoverDataMap}
      />
    </div>
  );
}
