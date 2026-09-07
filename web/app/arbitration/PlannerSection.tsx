import {
  fetchHoverExtras,
  buildHoverDataMap,
  analyzeArbitration,
  allocateArbitrationBudget,
  fetchPlayersPreArb,
  LEAGUE_ID,
  ARB_BUDGET_PER_TEAM,
  ARB_MIN_PER_TEAM,
  ARB_MAX_PER_TEAM,
  ARB_MAX_PER_PLAYER_PER_TEAM,
  NUM_TEAMS,
} from "@/lib/analysis";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/auth";
import { getViewerTeam } from "@/lib/viewer-team";
import ArbPlannerClient from "@/app/arbitration-planner/ArbPlannerClient";

/**
 * Arbitration budget planner panel. Rendered inside the tabbed /arbitration
 * page; no page chrome of its own.
 */
export default async function PlannerSection() {
  const [user, viewerTeam] = await Promise.all([getAuthenticatedUser(), getViewerTeam()]);

  // Fetch players with pre-arbitration salaries (after auto bump, before arb results)
  const allPlayers = await fetchPlayersPreArb();

  // Fetch surplus adjustments (applied separately in client, not baked into targets)
  const adjRes = user
    ? await getSupabaseAdmin()
        .from("surplus_adjustments")
        .select("player_id, adjustment")
        .eq("league_id", LEAGUE_ID)
        .eq("user_id", user.userId)
        .neq("adjustment", 0)
    : { data: [], error: null };

  const { projMap, dsMap } = await fetchHoverExtras(!!user?.hasProjectionsAccess);
  const hoverDataMap = buildHoverDataMap(allPlayers, projMap, dsMap);

  // Use raw values (no adjustments) so Value/Surplus columns match the arbitration page.
  // Adjustments are shown separately in the "Adj. Surplus" column.
  const targets = analyzeArbitration(allPlayers, viewerTeam);
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
            (viewerTeam == null || p.team_name !== viewerTeam)
        )
        .map((p) => p.team_name!)
    ),
  ].sort();

  // Fetch saved plans
  const { data: plans } = user
    ? await getSupabaseAdmin()
        .from("arbitration_plans")
        .select("id, name, notes, created_at, updated_at")
        .eq("league_id", LEAGUE_ID)
        .eq("user_id", user.userId)
        .order("updated_at", { ascending: false })
    : { data: [] };

  // Serialize adjustments for client
  const adjustedSurplusEntries = (adjRes.data ?? []).map((r) => ({
    player_id: String(r.player_id),
    adjustment: Number(r.adjustment),
  }));

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-ink">
          Arbitration Planner
        </h2>
        <p className="text-ink-subtle mt-2">
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
        hoverDataMap={hoverDataMap}
      />
    </div>
  );
}
