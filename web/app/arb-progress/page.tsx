import { getSupabaseAdmin } from "@/lib/supabase";
import { LEAGUE_ID, SEASON, NUM_TEAMS } from "@/lib/config";
import DataTable, { Column, HighlightRule } from "@/components/DataTable";

export const revalidate = 300; // Revalidate every 5 minutes

export const metadata = {
  title: "Arbitration Progress | Ottoneu Analytics",
  description: "Live arbitration allocation progress for Ottoneu League 309",
};

interface TeamStatus {
  team_name: string;
  is_complete: boolean;
  scraped_at: string;
}

interface Allocation {
  [key: string]: string | number | boolean | null | undefined;
  player_name: string;
  ottoneu_id: number | null;
  team_name: string | null;
  current_salary: number | null;
  raise_amount: number;
  new_salary: number | null;
}

const ALLOCATION_COLUMNS: Column[] = [
  { key: "player_name", label: "Player" },
  { key: "team_name", label: "Owner" },
  { key: "current_salary", label: "Salary", format: "currency" },
  { key: "raise_amount", label: "Raise", format: "currency" },
  { key: "new_salary", label: "New Salary", format: "currency" },
];

const ALLOCATION_RULES: HighlightRule[] = [
  {
    key: "raise_amount",
    op: "gte",
    value: 10,
    className: "bg-red-50 dark:bg-red-950/30",
  },
];

export default async function ArbProgressPage() {
  const supabase = getSupabaseAdmin();

  // Fetch team status and allocations in parallel
  const [teamsRes, allocationsRes] = await Promise.all([
    supabase
      .from("arbitration_progress_teams")
      .select("team_name, is_complete, scraped_at")
      .eq("league_id", LEAGUE_ID)
      .eq("season", SEASON)
      .order("team_name"),
    supabase
      .from("arbitration_progress")
      .select(
        "player_name, ottoneu_id, team_name, current_salary, raise_amount, new_salary"
      )
      .eq("league_id", LEAGUE_ID)
      .eq("season", SEASON)
      .order("raise_amount", { ascending: false }),
  ]);

  const teams: TeamStatus[] = teamsRes.data ?? [];
  const allocations: Allocation[] = allocationsRes.data ?? [];

  const completeCount = teams.filter((t) => t.is_complete).length;
  const incompleteCount = teams.filter((t) => !t.is_complete).length;
  const hasAllocations = allocations.length > 0;

  // Get last scraped time
  const lastScraped = teams.length > 0 ? teams[0].scraped_at : null;
  const scrapedDate = lastScraped
    ? new Date(lastScraped).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : null;

  // Summarize allocations per team (total raised against each team)
  const teamRaiseTotals = new Map<string, number>();
  for (const a of allocations) {
    if (a.team_name) {
      teamRaiseTotals.set(
        a.team_name,
        (teamRaiseTotals.get(a.team_name) ?? 0) + a.raise_amount
      );
    }
  }

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

        {/* Completion Summary */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
            Team Completion
          </h2>
          <div className="grid grid-cols-3 gap-4 text-sm mb-4">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Complete</p>
              <p className="font-bold text-2xl text-green-600 dark:text-green-400">
                {completeCount}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Incomplete</p>
              <p className="font-bold text-2xl text-amber-600 dark:text-amber-400">
                {incompleteCount}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Total</p>
              <p className="font-bold text-2xl text-slate-900 dark:text-white">
                {NUM_TEAMS}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
            <div
              className="bg-green-500 dark:bg-green-400 h-3 rounded-full transition-all duration-500"
              style={{
                width: `${teams.length > 0 ? (completeCount / teams.length) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {teams.length > 0
              ? `${Math.round((completeCount / teams.length) * 100)}% complete`
              : "No data yet"}
          </p>
        </div>

        {/* Team Status Grid */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            Teams
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {teams.map((team) => (
              <div
                key={team.team_name}
                className={`rounded-lg border p-3 text-sm ${
                  team.is_complete
                    ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      team.is_complete
                        ? "bg-green-500 dark:bg-green-400"
                        : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  />
                  <span
                    className={`font-medium ${
                      team.is_complete
                        ? "text-green-800 dark:text-green-300"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {team.team_name}
                  </span>
                </div>
                {hasAllocations && teamRaiseTotals.has(team.team_name) && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-4.5">
                    ${teamRaiseTotals.get(team.team_name)} raised against
                  </p>
                )}
              </div>
            ))}
          </div>
          {teams.length === 0 && (
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              No team data available. Run the arbitration progress scraper to
              populate.
            </p>
          )}
        </section>

        {/* Allocation Details */}
        {hasAllocations && (
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Current Allocations
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Players with salary raises from arbitration. Red rows indicate
              raises of $10 or more.
            </p>
            <DataTable
              columns={ALLOCATION_COLUMNS}
              data={allocations}
              highlightRules={ALLOCATION_RULES}
            />
          </section>
        )}

        {/* Per-Team Raise Summary (only when allocations exist) */}
        {hasAllocations && teamRaiseTotals.size > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Raises by Team
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Total salary increases received per team from arbitration.
            </p>
            <DataTable
              columns={[
                { key: "team_name", label: "Team" },
                {
                  key: "total_raise",
                  label: "Total Raise",
                  format: "currency",
                },
                {
                  key: "player_count",
                  label: "Players Affected",
                  format: "number",
                },
              ]}
              data={Array.from(teamRaiseTotals.entries())
                .map(([team, total]) => ({
                  team_name: team,
                  total_raise: total,
                  player_count: allocations.filter(
                    (a) => a.team_name === team
                  ).length,
                }))
                .sort((a, b) => b.total_raise - a.total_raise)}
            />
          </section>
        )}

        {/* No allocations message */}
        {!hasAllocations && teams.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">
              No Allocations Yet
            </h2>
            <p className="text-sm text-blue-800 dark:text-blue-300">
              Arbitration is in progress but no allocation data has been
              published yet. Teams may still be submitting their allocations.
              Check back later for updates.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
