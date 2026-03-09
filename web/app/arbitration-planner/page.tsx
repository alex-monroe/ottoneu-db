import {
  fetchAndMergeData,
  fetchArbitrationData,
  allocateArbitrationBudget,
  LEAGUE_ID,
  MY_TEAM,
  ARB_BUDGET_PER_TEAM,
  ARB_MIN_PER_TEAM,
  ARB_MAX_PER_TEAM,
  ARB_MAX_PER_PLAYER_PER_TEAM,
  NUM_TEAMS,
} from "@/lib/analysis";
import { supabase } from "@/lib/supabase";
import ArbPlannerClient from "./ArbPlannerClient";

export default async function ArbitrationPlannerPage() {
  // Fetch observed stats — matches the surplus value page's data source
  const allPlayers = await fetchAndMergeData();

  // Fetch surplus adjustments (applied separately in client, not baked into targets)
  const adjRes = await supabase
    .from("surplus_adjustments")
    .select("player_id, adjustment")
    .eq("league_id", LEAGUE_ID)
    .neq("adjustment", 0);

  // Use raw values (no adjustments) so Value/Surplus columns match the arbitration page.
  // Adjustments are shown separately in the "Adj. Surplus" column.
  const targets = await fetchArbitrationData(allPlayers);
  const suggestedAllocations = allocateArbitrationBudget(targets);

  // Get unique opponent team names
  const opponentTeams = [
    ...new Set(
      allPlayers
        .filter(
          (p) =>
            p.team_name != null &&
            p.team_name !== "" &&
            p.team_name !== "FA" &&
            p.team_name !== MY_TEAM
        )
        .map((p) => p.team_name!)
    ),
  ].sort();

  // Fetch saved plans
  const { data: plans } = await supabase
    .from("arbitration_plans")
    .select("id, name, notes, created_at, updated_at")
    .eq("league_id", LEAGUE_ID)
    .order("updated_at", { ascending: false });

  // Serialize adjustments for client
  const adjustedSurplusEntries = (adjRes.data ?? []).map((r) => ({
    player_id: String(r.player_id),
    adjustment: Number(r.adjustment),
  }));

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Arbitration Planner
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Plan your ${ARB_BUDGET_PER_TEAM} arbitration budget across {NUM_TEAMS - 1} opponent
            teams (${ARB_MIN_PER_TEAM}-${ARB_MAX_PER_TEAM} per team, max ${ARB_MAX_PER_PLAYER_PER_TEAM} per player).
          </p>
        </header>

        <ArbPlannerClient
          targets={targets}
          suggestedAllocations={suggestedAllocations}
          initialPlans={plans ?? []}
          opponentTeams={opponentTeams}
          adjustedSurplusEntries={adjustedSurplusEntries}
        />
      </div>
    </main>
  );
}
