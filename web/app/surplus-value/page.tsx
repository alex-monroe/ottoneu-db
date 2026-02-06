import {
  fetchAndMergeData,
  calculateSurplus,
  MY_TEAM,
  SEASON,
} from "@/lib/analysis";
import DataTable, { Column, HighlightRule } from "@/components/DataTable";

export const revalidate = 3600;

const CORE_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "Team" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "surplus", label: "Surplus", format: "currency" },
  { key: "ppg", label: "PPG", format: "decimal" },
  { key: "full_season_vorp", label: "VORP", format: "decimal" },
  { key: "team_name", label: "Owner" },
];

const MY_TEAM_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "surplus", label: "Surplus", format: "currency" },
  { key: "ppg", label: "PPG", format: "decimal" },
  { key: "full_season_vorp", label: "VORP", format: "decimal" },
];

const FA_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "Team" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "ppg", label: "PPG", format: "decimal" },
  { key: "full_season_vorp", label: "VORP", format: "decimal" },
];

const TEAM_SUMMARY_COLUMNS: Column[] = [
  { key: "team_name", label: "Team" },
  { key: "players", label: "Players", format: "number" },
  { key: "total_salary", label: "Total Salary", format: "currency" },
  { key: "total_value", label: "Total Value", format: "currency" },
  { key: "total_surplus", label: "Total Surplus", format: "currency" },
];

const BARGAIN_RULES: HighlightRule[] = [
  { key: "surplus", op: "gte", value: 30, className: "bg-green-50 dark:bg-green-950/30" },
];

const OVERPAID_RULES: HighlightRule[] = [
  { key: "surplus", op: "lt", value: -20, className: "bg-red-50 dark:bg-red-950/30" },
];

const MY_TEAM_RULES: HighlightRule[] = [
  { key: "surplus", op: "lt", value: 0, className: "bg-red-50 dark:bg-red-950/30" },
  { key: "surplus", op: "gte", value: 20, className: "bg-green-50 dark:bg-green-950/30" },
];

const TEAM_SUMMARY_RULES: HighlightRule[] = [
  { key: "team_name", op: "eq", value: MY_TEAM, className: "bg-blue-50 dark:bg-blue-950/30" },
];

export default async function SurplusValuePage() {
  const allPlayers = await fetchAndMergeData();
  const surplusPlayers = calculateSurplus(allPlayers);

  if (surplusPlayers.length === 0) {
    return (
      <main className="min-h-screen bg-white dark:bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            No surplus data available.
          </h1>
        </div>
      </main>
    );
  }

  // Best bargains (top 20 positive surplus, rostered)
  const rostered = surplusPlayers.filter(
    (p) => p.team_name != null && p.team_name !== "" && p.team_name !== "FA"
  );
  const bestBargains = [...rostered]
    .sort((a, b) => b.surplus - a.surplus)
    .slice(0, 20);

  // Most overpaid (bottom 20)
  const mostOverpaid = [...rostered]
    .sort((a, b) => a.surplus - b.surplus)
    .slice(0, 20);

  // My team
  const myTeam = rostered
    .filter((p) => p.team_name === MY_TEAM)
    .sort((a, b) => b.surplus - a.surplus);
  const myTotalSalary = myTeam.reduce((s, p) => s + p.price, 0);
  const myTotalValue = myTeam.reduce((s, p) => s + p.dollar_value, 0);
  const myTotalSurplus = myTeam.reduce((s, p) => s + p.surplus, 0);

  // Free agents
  const freeAgents = surplusPlayers
    .filter(
      (p) => p.team_name == null || p.team_name === "" || p.team_name === "FA"
    )
    .sort((a, b) => b.dollar_value - a.dollar_value)
    .slice(0, 20);

  // Per-team summary
  const teamMap = new Map<
    string,
    { players: number; total_salary: number; total_value: number; total_surplus: number }
  >();
  for (const p of rostered) {
    const t = p.team_name!;
    const entry = teamMap.get(t) ?? {
      players: 0,
      total_salary: 0,
      total_value: 0,
      total_surplus: 0,
    };
    entry.players++;
    entry.total_salary += p.price;
    entry.total_value += p.dollar_value;
    entry.total_surplus += p.surplus;
    teamMap.set(t, entry);
  }
  const teamSummary = [...teamMap.entries()]
    .map(([team_name, stats]) => ({
      team_name,
      ...stats,
      total_salary: Math.round(stats.total_salary),
      total_value: Math.round(stats.total_value),
      total_surplus: Math.round(stats.total_surplus),
    }))
    .sort((a, b) => b.total_surplus - a.total_surplus);

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Surplus Value Rankings ({SEASON})
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Dollar value (from VORP) minus current salary. Positive surplus =
            bargain.
          </p>
        </header>

        {/* Best Bargains */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            Top 20 Bargains
          </h2>
          <DataTable
            columns={CORE_COLUMNS}
            data={bestBargains}
            highlightRules={BARGAIN_RULES}
          />
        </section>

        {/* Most Overpaid */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            Top 20 Most Overpaid
          </h2>
          <DataTable
            columns={CORE_COLUMNS}
            data={mostOverpaid}
            highlightRules={OVERPAID_RULES}
          />
        </section>

        {/* My Team */}
        {myTeam.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              {MY_TEAM} — Surplus Breakdown
            </h2>
            <DataTable
              columns={MY_TEAM_COLUMNS}
              data={myTeam}
              highlightRules={MY_TEAM_RULES}
            />
            <div className="mt-3 flex flex-wrap gap-6 text-sm text-slate-600 dark:text-slate-400">
              <span>
                Total Salary:{" "}
                <strong className="text-slate-900 dark:text-white">
                  ${myTotalSalary}
                </strong>
              </span>
              <span>
                Total Value:{" "}
                <strong className="text-slate-900 dark:text-white">
                  ${myTotalValue}
                </strong>
              </span>
              <span>
                Total Surplus:{" "}
                <strong
                  className={
                    myTotalSurplus >= 0
                      ? "text-green-700 dark:text-green-400"
                      : "text-red-700 dark:text-red-400"
                  }
                >
                  ${myTotalSurplus}
                </strong>
              </span>
            </div>
          </section>
        )}

        {/* Free Agent Targets */}
        {freeAgents.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Top Free Agents by Value
            </h2>
            <DataTable columns={FA_COLUMNS} data={freeAgents} />
          </section>
        )}

        {/* Per-Team Summary */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            Per-Team Summary
          </h2>
          <DataTable
            columns={TEAM_SUMMARY_COLUMNS}
            data={teamSummary}
            highlightRules={TEAM_SUMMARY_RULES}
          />
        </section>
      </div>
    </main>
  );
}
