import {
  fetchAndMergeData,
  analyzeProjectedSalary,
  CAP_PER_TEAM,
  POSITIONS,
  MY_TEAM,
  SEASON,
} from "@/lib/analysis";
import ProjectedSalaryClient from "./ProjectedSalaryClient";

export const revalidate = 3600;

const REC_COLORS: Record<string, string> = {
  "Strong Keep": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Keep: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Borderline: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  "Cut Candidate": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

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

  const totalCurrent = roster.reduce((s, p) => s + p.price, 0);
  const totalProjected = roster.reduce((s, p) => s + p.projected_salary, 0);
  const capSpace = CAP_PER_TEAM - totalProjected;

  // Group by position for tables
  const byPosition: Record<string, typeof roster> = {};
  for (const pos of POSITIONS) {
    const posPlayers = roster
      .filter((p) => p.position === pos)
      .sort((a, b) => a.price_per_ppg - b.price_per_ppg);
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
      projected_salary: p.projected_salary,
      ppg: p.ppg,
      total_points: p.total_points,
      games_played: p.games_played,
      price_per_ppg: p.price_per_ppg,
      recommendation: p.recommendation,
    })),
  }));

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Projected Salary — {MY_TEAM}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Keep vs. cut decisions based on projected {SEASON + 1} salary efficiency.
            Lower price_per_ppg is better.
          </p>
        </header>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Current Salary
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              ${totalCurrent}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Projected Salary
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              ${totalProjected}
            </p>
          </div>
          <div
            className={`rounded-lg p-5 border ${
              capSpace >= 0
                ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
            }`}
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Cap Space (Projected)
            </p>
            <p
              className={`text-2xl font-bold ${
                capSpace >= 0
                  ? "text-green-700 dark:text-green-300"
                  : "text-red-700 dark:text-red-300"
              }`}
            >
              ${capSpace}
            </p>
          </div>
        </div>

        <ProjectedSalaryClient
          positionGroups={serialized}
          recColors={REC_COLORS}
        />
      </div>
    </main>
  );
}
