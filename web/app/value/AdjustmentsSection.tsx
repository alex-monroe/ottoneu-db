import { fetchAndMergeProjectedData, fetchHoverExtras, buildHoverDataMap, calculateSurplus, fetchPlayersPreArb, LEAGUE_ID } from "@/lib/analysis";
import { getStatsSeason, getProjectionSeason } from "@/lib/season";
import { computeDollarPerVorp } from "@/lib/surplus";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/auth";
import AdjustmentsTable from "@/app/surplus-adjustments/AdjustmentsTable";
import Link from "next/link";

/**
 * Manual surplus-value adjustments panel. Rendered inside the tabbed /value
 * page; no page chrome of its own.
 */
export default async function AdjustmentsSection() {
  const user = await getAuthenticatedUser();
  const [statsSeason, projectionSeason] = await Promise.all([
    getStatsSeason(),
    getProjectionSeason(),
  ]);
  const [allPlayers, projectedPlayers, adjRes] = await Promise.all([
    fetchPlayersPreArb(),
    fetchAndMergeProjectedData(projectionSeason, fetchPlayersPreArb),
    user
      ? getSupabaseAdmin()
          .from("surplus_adjustments")
          .select("player_id, adjustment, notes")
          .eq("league_id", LEAGUE_ID)
          .eq("user_id", user.userId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const { projMap, dsMap } = await fetchHoverExtras(!!user?.hasProjectionsAccess);
  const hoverDataMap = buildHoverDataMap(allPlayers, projMap, dsMap);

  const surplusPlayers = calculateSurplus(allPlayers).filter(
    (p) => p.position !== "K"
  );
  const dollarPerVorp = computeDollarPerVorp(allPlayers);

  // Build projected surplus values for comparison
  const projectedSurplus = calculateSurplus(projectedPlayers).filter(
    (p) => p.position !== "K"
  );
  const projectedValues: Record<string, { projected_dollar_value: number; projected_surplus: number }> = {};
  for (const p of projectedSurplus) {
    projectedValues[p.player_id] = {
      projected_dollar_value: p.dollar_value,
      projected_surplus: p.surplus,
    };
  }

  const existingAdjustments: Record<string, { adjustment: number; notes: string }> = {};
  for (const row of adjRes.data ?? []) {
    existingAdjustments[String(row.player_id)] = {
      adjustment: Number(row.adjustment) || 0,
      notes: row.notes ?? "",
    };
  }

  const savedCount = Object.values(existingAdjustments).filter(
    (a) => a.adjustment !== 0
  ).length;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Surplus Value Adjustments ({statsSeason})
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          Adjust player values by entering a target PPG or target surplus — the system
          calculates the underlying dollar adjustment automatically. Adjustments persist
          in the database and can be applied on the{" "}
          <Link href="/arbitration?mode=adjusted" className="text-blue-600 dark:text-blue-400 underline">
            Arbitration
          </Link>
          {" "}and{" "}
          <Link href="/arbitration?tab=simulation&mode=adjusted" className="text-blue-600 dark:text-blue-400 underline">
            Arb Simulation
          </Link>{" "}
          tabs by toggling to &ldquo;Adjusted&rdquo; mode.
        </p>
        <p className="text-slate-400 dark:text-slate-500 mt-1 text-sm">
          <strong>Proj. Value</strong> and <strong>Proj. Surplus</strong> show {projectionSeason} projected
          dollar values based on recency-weighted PPG projections. <strong>Δ</strong> = projected minus observed value.
        </p>
      </header>

      {savedCount > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-5 py-3 text-sm text-blue-800 dark:text-blue-300">
          {savedCount} player{savedCount !== 1 ? "s" : ""} currently have non-zero adjustments saved.
        </div>
      )}

      <AdjustmentsTable
        players={surplusPlayers}
        existingAdjustments={existingAdjustments}
        projectedValues={projectedValues}
        dollarPerVorp={dollarPerVorp}
        hoverDataMap={hoverDataMap}
        projectionSeason={projectionSeason}
      />
    </div>
  );
}
