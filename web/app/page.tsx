import { fetchPlayers } from '@/lib/data'
import PlayerEfficiencyClient from '@/components/PlayerEfficiencyClient'
import { ChartPoint } from '@/lib/types'

export const revalidate = 3600 // Revalidate every hour

export default async function Home() {
  const players = await fetchPlayers()

  const data = players.map(player => {
    const ppg = player.ppg
    const pps = player.pps
    const price = player.price
    const total_points = player.total_points

    const cost_per_ppg = ppg > 0 ? price / ppg : 0
    const cost_per_pps = pps > 0 ? price / pps : 0

    if (ppg === 0) return null;

    return {
      name: player.name,
      position: player.position,
      nfl_team: player.nfl_team,
      total_points,
      ppg,
      pps,
      price,
      cost_per_ppg,
      cost_per_pps,
      games_played: player.games_played,
      snaps: player.snaps
    }
  }).filter(Boolean) as ChartPoint[]

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Ottoneu Player Efficiency
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Analyzing player value: Salary vs Production (Points Per Game or Points Per Snap)
          </p>
        </header>

        <PlayerEfficiencyClient data={data} />

        <section className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-800">
          <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-white">Analysis Notes</h2>
          <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-400">
            <li><strong>Y-Axis (Salary)</strong>: Higher is more expensive.</li>
            <li><strong>X-Axis (PPG/PPS)</strong>: Further right means more efficient production per game/snap.</li>
            <li><strong>Bubble Size</strong>: Represents Total Points. Large bubblesPercent = High total volume.</li>
            <li>Ideally, you want players in the <strong>Bottom-Right</strong> quadrant (High Production, Low Salary).</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
