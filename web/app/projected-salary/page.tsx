import {
  fetchAndMergeData,
  analyzeProjectedSalary,
  CAP_PER_TEAM,
  POSITIONS,
  MY_TEAM,
} from "@/lib/analysis";
import ProjectedSalaryClient from "./ProjectedSalaryClient";
import SummaryCard from "@/components/SummaryCard";

export const revalidate = 3600;

export default async function ProjectedSalaryPage() {
  const allPlayers = await fetchAndMergeData();
  const roster = analyzeProjectedSalary(allPlayers);

  if (roster.length === 0) {
    return (
      <main className="min-h-screen bg-white dark:bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            No roster data found.
          </h1>
        </div>
      </main>
    );
  }

  const totalSalary = roster.reduce((s, p) => s + p.price, 0);
  const totalValue = roster.reduce((s, p) => s + p.dollar_value, 0);
  const totalSurplus = roster.reduce((s, p) => s + p.surplus, 0);
  const capSpace = CAP_PER_TEAM - totalSalary;

  // Group by position for tables
  const byPosition: Record<string, typeof roster> = {};
  for (const pos of POSITIONS) {
    const posPlayers = roster
      .filter((p) => p.position === pos)
      .sort((a, b) => b.surplus - a.surplus);
    if (posPlayers.length > 0) byPosition[pos] = posPlayers;
  }

  // Serialize for client
  const serialized = Object.entries(byPosition).map(([pos, players]) => ({
    pos,
    players: players.map((p) => ({
      name: p.name,
      position: p.position,
      nfl_team: p.nfl_team,
      price: p.price,
      dollar_value: p.dollar_value,
      surplus: p.surplus,
      ppg: p.ppg,
      total_points: p.total_points,
      games_played: p.games_played,
      recommendation: p.recommendation,
    })),
  }));

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Salary Analysis — {MY_TEAM}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Keep vs. cut decisions based on surplus value (dollar value - salary).
            Accounts for positional scarcity via VORP.
          </p>
        </header>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard label="Total Salary" value={totalSalary} />
          <SummaryCard label="Total Value" value={totalValue} />
          <SummaryCard
            label="Total Surplus"
            value={totalSurplus}
            variant={totalSurplus >= 0 ? 'positive' : 'negative'}
          />
          <SummaryCard
            label="Cap Space"
            value={capSpace}
            variant={capSpace >= 0 ? 'positive' : 'negative'}
          />
        </div>

        <ProjectedSalaryClient positionGroups={serialized} />
      </div>
    </main>
  );
}
