import { supabase } from '@/lib/supabase'
import PlayerScatterChart from '@/components/ScatterChart'
import PositionTierBreakdown from '@/components/PositionTierBreakdown'
import { ChartPoint, PositionTierData, FlexTierData, TierStat, Position, POSITIONS } from '@/lib/types'

export const revalidate = 3600 // Revalidate every hour

export default async function Home() {
  // Fetch Players
  const { data: players } = await supabase.from('players').select('*')
  const { data: stats } = await supabase.from('player_stats').select('*').eq('season', 2025)
  const { data: prices } = await supabase.from('league_prices').select('*').eq('league_id', 309)

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

  // Tier breakdown computation
  const TIER_LABELS: Record<number, string> = { 1: 'Top 1', 12: 'Top 12', 24: 'Top 24', 36: 'Top 36' }
  const tierSizes: Record<Position, number[]> = {
    QB: [1, 12, 24],
    RB: [1, 12, 24],
    WR: [1, 12, 24],
    TE: [1, 12, 24],
    K:  [1, 12],
  }

  function computeTier(players: ChartPoint[], size: number): TierStat {
    const slice = players.slice(0, size)
    const n = slice.length
    return {
      label: TIER_LABELS[size],
      tierSize: size,
      n,
      avgPpg: n > 0 ? slice.reduce((s, p) => s + p.ppg, 0) / n : 0,
      avgPrice: n > 0 ? slice.reduce((s, p) => s + p.price, 0) / n : 0,
    }
  }

  const byPosition = new Map<Position, ChartPoint[]>()
  for (const pos of POSITIONS) {
    byPosition.set(pos, [...data.filter(d => d.position === pos)].sort((a, b) => b.ppg - a.ppg))
  }

  const positionTiers: PositionTierData[] = POSITIONS.map(pos => ({
    position: pos,
    tiers: tierSizes[pos].map(size => computeTier(byPosition.get(pos) ?? [], size)),
  }))

  const flexPool = [...data.filter(d => ['RB', 'WR', 'TE'].includes(d.position))]
    .sort((a, b) => b.ppg - a.ppg)
  const flexTier: FlexTierData = { top36: computeTier(flexPool, 36) }

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

        <PositionTierBreakdown positionTiers={positionTiers} flexTier={flexTier} />

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
