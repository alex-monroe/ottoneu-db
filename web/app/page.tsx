import { supabase } from '@/lib/supabase'
import PlayerScatterChart from '@/components/ScatterChart'
import { ChartPoint } from '@/lib/types'

export const revalidate = 3600 // Revalidate every hour

export default async function Home() {
  // Fetch Players
  const { data: players } = await supabase.from('players').select('*')
  const { data: stats } = await supabase.from('player_stats').select('*').eq('season', 2025)
  const { data: prices } = await supabase.from('league_prices').select('*').eq('league_id', 309).eq('season', 2025)

  if (!players || !stats || !prices) {
    return <div>Error loading data or no data found.</div>
  }

  // Merge Data
  const data = players.map(player => {
    const pStats = stats.find(s => s.player_id === player.id)
    const pPrice = prices.find(p => p.player_id === player.id)

    if (!pStats || !pPrice) return null;

    const ppg = Number(pStats.ppg) || 0
    const pps = Number(pStats.pps) || 0
    const price = Number(pPrice.price) || 0
    const total_points = Number(pStats.total_points) || 0

    const cost_per_ppg = ppg > 0 ? price / ppg : 0
    const cost_per_pps = pps > 0 ? price / pps : 0

    // Filter out low volume or 0 ppg?
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
      games_played: pStats.games_played,
      snaps: pStats.snaps
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

        <section>
          <PlayerScatterChart data={data} />
        </section>

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
