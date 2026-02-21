import { fetchAndMergeData, calculateSurplus, SEASON, LEAGUE_ID } from "@/lib/analysis";
import { supabase } from "@/lib/supabase";
import AdjustmentsTable from "./AdjustmentsTable";
import Link from "next/link";

export const revalidate = 0;

export default async function SurplusAdjustmentsPage() {
  const [allPlayers, adjRes] = await Promise.all([
    fetchAndMergeData(),
    supabase
      .from("surplus_adjustments")
      .select("player_id, adjustment, notes")
      .eq("league_id", LEAGUE_ID),
  ]);

  const surplusPlayers = calculateSurplus(allPlayers).filter(
    (p) => p.position !== "K"
  );

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
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Surplus Value Adjustments ({SEASON})
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Override each player&apos;s VORP-calculated dollar value with your own scouting
            judgment. Enter a positive number to increase value (e.g. injury recovery,
            scheme upgrade) or negative to decrease it. Adjustments persist in the
            database and can be applied on the{" "}
            <Link href="/arbitration?mode=adjusted" className="text-blue-600 dark:text-blue-400 underline">
              Arbitration
            </Link>
            {" "}and{" "}
            <Link href="/arbitration-simulation?mode=adjusted" className="text-blue-600 dark:text-blue-400 underline">
              Arb Simulation
            </Link>{" "}
            pages by toggling to &ldquo;Adjusted&rdquo; mode.
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
        />
      </div>
    </main>
  );
}
