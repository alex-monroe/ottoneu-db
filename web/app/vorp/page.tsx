import {
  fetchAndMergeData,
  calculateVorp,
  REPLACEMENT_LEVEL,
  POSITIONS,
  SEASON,
} from "@/lib/analysis";
import VorpClient from "./VorpClient";

export const revalidate = 3600;

export default async function VorpPage() {
  const allPlayers = await fetchAndMergeData();
  const { players, replacementPpg } = calculateVorp(allPlayers);

  if (players.length === 0) {
    return (
      <main className="min-h-screen bg-white dark:bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            No VORP data available.
          </h1>
        </div>
      </main>
    );
  }

  // Replacement benchmarks
  const benchmarks = POSITIONS.map((pos) => ({
    position: pos,
    rank: REPLACEMENT_LEVEL[pos],
    ppg: Math.round((replacementPpg[pos] ?? 0) * 100) / 100,
  }));

  // Top 15 overall for bar chart
  const top15 = [...players]
    .sort((a, b) => b.full_season_vorp - a.full_season_vorp)
    .slice(0, 15)
    .map((p) => ({
      name: p.name,
      position: p.position,
      full_season_vorp: p.full_season_vorp,
    }));

  // All players for table
  const tableData = players.map((p) => ({
    name: p.name,
    position: p.position,
    nfl_team: p.nfl_team,
    ppg: p.ppg,
    total_points: p.total_points,
    games_played: p.games_played,
    vorp_per_game: p.vorp_per_game,
    full_season_vorp: p.full_season_vorp,
    price: p.price,
    team_name: p.team_name ?? "FA",
  }));

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            VORP Analysis ({SEASON})
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Value Over Replacement Player — measures positional scarcity.
            Higher VORP = more valuable above replacement level.
          </p>
        </header>

        {/* Replacement Benchmarks */}
        <section className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
            Replacement Level Benchmarks
          </h2>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400">
                  <th className="pr-6 py-1 text-left font-medium">Position</th>
                  <th className="pr-6 py-1 text-left font-medium">
                    Replacement Rank
                  </th>
                  <th className="pr-6 py-1 text-left font-medium">
                    Replacement PPG
                  </th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map((b) => (
                  <tr
                    key={b.position}
                    className="text-slate-800 dark:text-slate-200"
                  >
                    <td className="pr-6 py-1 font-medium">{b.position}</td>
                    <td className="pr-6 py-1">{b.rank}</td>
                    <td className="pr-6 py-1">{b.ppg.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <VorpClient top15={top15} tableData={tableData} />
      </div>
    </main>
  );
}
