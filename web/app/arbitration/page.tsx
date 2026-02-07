import {
  fetchAndMergeData,
  analyzeArbitration,
  ARB_BUDGET_PER_TEAM,
  ARB_MIN_PER_TEAM,
  ARB_MAX_PER_TEAM,
  ARB_MAX_PER_PLAYER_PER_TEAM,
  NUM_TEAMS,
  SEASON,
} from "@/lib/analysis";
import DataTable, { Column, HighlightRule } from "@/components/DataTable";
import ArbitrationTeams from "./ArbitrationTeams";

export const revalidate = 3600;

const TARGET_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "NFL Team" },
  { key: "team_name", label: "Owner" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "surplus", label: "Surplus", format: "currency" },
  { key: "salary_after_arb", label: "After Arb", format: "currency" },
  { key: "surplus_after_arb", label: "Surplus (Post-Arb)", format: "currency" },
];

const ARB_TARGET_RULES: HighlightRule[] = [
  { key: "surplus_after_arb", op: "lt", value: 0, className: "bg-red-50 dark:bg-red-950/30" },
];

export default async function ArbitrationPage() {
  const allPlayers = await fetchAndMergeData();
  const targets = analyzeArbitration(allPlayers);

  if (targets.length === 0) {
    return (
      <main className="min-h-screen bg-white dark:bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            No arbitration targets found.
          </h1>
        </div>
      </main>
    );
  }

  // Group targets by team
  const teamTargets = new Map<string, typeof targets>();
  for (const t of targets) {
    const team = t.team_name!;
    const list = teamTargets.get(team) ?? [];
    list.push(t);
    teamTargets.set(team, list);
  }

  // Sort teams by number of targets (most first)
  const sortedTeams = [...teamTargets.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([team, players]) => {
      const numOpponents = NUM_TEAMS - 1;
      const baseAllocation = ARB_MIN_PER_TEAM;
      const remainingBudget =
        ARB_BUDGET_PER_TEAM - numOpponents * baseAllocation;
      const suggested = Math.min(
        ARB_MAX_PER_TEAM,
        baseAllocation + Math.min(remainingBudget, players.length * 2)
      );

      return {
        team,
        suggested,
        players: players.slice(0, 5).map((p) => ({
          name: p.name,
          position: p.position,
          price: p.price,
          dollar_value: p.dollar_value,
          surplus: p.surplus,
          surplus_after_arb: p.surplus_after_arb,
        })),
      };
    });

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Arbitration Targets ({SEASON})
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Opponents&apos; players most vulnerable to a ${ARB_MAX_PER_PLAYER_PER_TEAM}{" "}
            arbitration raise. Negative surplus after arb = likely cut.
          </p>
        </header>

        {/* Budget Info */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Arbitration Budget
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Total Budget</p>
              <p className="font-bold text-slate-900 dark:text-white">
                ${ARB_BUDGET_PER_TEAM}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Per Team Range</p>
              <p className="font-bold text-slate-900 dark:text-white">
                ${ARB_MIN_PER_TEAM}-${ARB_MAX_PER_TEAM}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">
                Max Per Player (from you)
              </p>
              <p className="font-bold text-slate-900 dark:text-white">
                ${ARB_MAX_PER_PLAYER_PER_TEAM}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Opponents</p>
              <p className="font-bold text-slate-900 dark:text-white">
                {NUM_TEAMS - 1}
              </p>
            </div>
          </div>
        </div>

        {/* Top 20 Targets */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            Top 20 Arbitration Targets
          </h2>
          <DataTable
            columns={TARGET_COLUMNS}
            data={targets.slice(0, 20)}
            highlightRules={ARB_TARGET_RULES}
          />
        </section>

        {/* Per-Team Sections */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            Targets by Opponent
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Suggested allocation based on number of vulnerable targets per team.
          </p>
          <ArbitrationTeams teams={sortedTeams} />
        </section>
      </div>
    </main>
  );
}
