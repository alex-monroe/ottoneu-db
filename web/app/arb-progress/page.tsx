import { getSupabaseAdmin } from "@/lib/supabase";
import { LEAGUE_ID, SEASON, NUM_TEAMS } from "@/lib/config";
import { fetchAndMergeData, fetchProjectionMap, buildHoverDataMap, DEFAULT_PROJECTION_YEAR } from "@/lib/analysis";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  AllocationDetailRow,
  AllocationRow,
  TeamStatus,
  applyProjectedRaises,
  buildAllocations,
  buildDetailsByPlayer,
  buildOttoneuToPlayerIdMap,
  buildTeamRaiseTotals,
  buildTeamSpending,
} from "@/lib/arb-progress";
import AllocationsSection from "./AllocationsSection";
import CompletionSummary from "./CompletionSummary";
import TeamRaisesSummary from "./TeamRaisesSummary";
import TeamSpendingSection from "./TeamSpendingSection";
import TeamStatusGrid from "./TeamStatusGrid";

export const metadata = {
  title: "Arbitration Progress | Ottoneu Analytics",
  description: "Live arbitration allocation progress for Ottoneu League 309",
};

function formatScrapedAt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default async function ArbProgressPage() {
  const supabase = getSupabaseAdmin();

  const [teamsRes, allocationsRes, detailsRes, allPlayers, user] = await Promise.all([
    supabase
      .from("arbitration_progress_teams")
      .select("team_name, is_complete, scraped_at")
      .eq("league_id", LEAGUE_ID)
      .eq("season", SEASON)
      .order("team_name"),
    supabase
      .from("arbitration_progress")
      .select("player_name, ottoneu_id, team_name, current_salary, raise_amount, new_salary")
      .eq("league_id", LEAGUE_ID)
      .eq("season", SEASON)
      .order("raise_amount", { ascending: false }),
    supabase
      .from("arbitration_allocation_details")
      .select("ottoneu_id, player_name, owner_team_name, allocating_team_name, amount")
      .eq("league_id", LEAGUE_ID)
      .eq("season", SEASON),
    fetchAndMergeData(),
    getAuthenticatedUser(),
  ]);

  const projMap = user?.hasProjectionsAccess ? await fetchProjectionMap(DEFAULT_PROJECTION_YEAR) : null;
  const hoverDataMap = buildHoverDataMap(allPlayers, projMap);

  const teams: TeamStatus[] = teamsRes.data ?? [];
  const allocationRows = (allocationsRes.data ?? []) as AllocationRow[];
  const detailRows = (detailsRes.data ?? []) as AllocationDetailRow[];

  const allocations = buildAllocations(allocationRows, buildOttoneuToPlayerIdMap(allPlayers));
  applyProjectedRaises(allocations, teams);

  const teamRaiseTotals = buildTeamRaiseTotals(allocations);
  const detailsByPlayer = buildDetailsByPlayer(detailRows);
  const { entries: teamSpendingData, teamSpentTotals } = buildTeamSpending(detailRows);

  const completeCount = teams.filter((t) => t.is_complete).length;
  const allComplete = completeCount === NUM_TEAMS;
  const hasAllocations = allocations.length > 0;
  const hasDetails = detailRows.length > 0;
  const scrapedDate = formatScrapedAt(teams[0]?.scraped_at ?? null);

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Arbitration Progress ({SEASON})
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Live arbitration allocation status for League {LEAGUE_ID}.{" "}
            {scrapedDate && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Last updated: {scrapedDate}
              </span>
            )}
          </p>
        </header>

        <CompletionSummary
          completeCount={completeCount}
          incompleteCount={teams.length - completeCount}
          teamsWithData={teams.length}
        />

        <TeamStatusGrid
          teams={teams}
          teamRaiseTotals={hasAllocations ? teamRaiseTotals : new Map()}
          teamSpentTotals={hasDetails ? teamSpentTotals : new Map()}
        />

        {hasAllocations && (
          <AllocationsSection
            allocations={allocations}
            detailsByPlayer={detailsByPlayer}
            hoverDataMap={hoverDataMap}
            completeCount={completeCount}
            allComplete={allComplete}
          />
        )}

        {hasAllocations && (
          <TeamRaisesSummary teamRaiseTotals={teamRaiseTotals} allocations={allocations} />
        )}

        {hasDetails && <TeamSpendingSection data={teamSpendingData} />}

        {!hasAllocations && teams.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">
              No Allocations Yet
            </h2>
            <p className="text-sm text-blue-800 dark:text-blue-300">
              Arbitration is in progress but no allocation data has been published yet. Teams may still be submitting their allocations. Check back later for updates.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
