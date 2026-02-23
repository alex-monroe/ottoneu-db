"use client"

import { useState, useMemo } from 'react'
import { ChartPoint, PositionTierData, FlexTierData, TierStat, Position, POSITIONS } from '@/lib/types'
import PlayerScatterChart from './ScatterChart'
import PositionTierBreakdown from './PositionTierBreakdown'

const TIER_SIZES: Record<Position, number[]> = {
  QB: [1, 12, 24],
  RB: [1, 12, 24],
  WR: [1, 12, 24],
  TE: [1, 12, 24],
  K:  [1, 12],
}

// PPG rank and salary rank are independent: #12 PPG = the 12th-best scorer's PPG;
// #12 salary = the 12th-highest salary at that position.
function computeTier(byPpg: ChartPoint[], bySalary: ChartPoint[], rank: number): TierStat {
  return {
    label: `#${rank}`,
    tierSize: rank,
    n: byPpg.length,
    ppg: byPpg[rank - 1]?.ppg ?? 0,
    price: bySalary[rank - 1]?.price ?? 0,
  }
}

export default function PlayerEfficiencyClient({ data }: { data: ChartPoint[] }) {
  const [minGames, setMinGames] = useState(0)

  const { positionTiers, flexTier } = useMemo(() => {
    const filtered = data.filter(d => d.games_played >= minGames)

    const byPosPpg = new Map<Position, ChartPoint[]>()
    const byPosSalary = new Map<Position, ChartPoint[]>()
    for (const pos of POSITIONS) {
      const players = filtered.filter(d => d.position === pos)
      byPosPpg.set(pos, [...players].sort((a, b) => b.ppg - a.ppg))
      byPosSalary.set(pos, [...players].sort((a, b) => b.price - a.price))
    }

    const positionTiers: PositionTierData[] = POSITIONS.map(pos => ({
      position: pos,
      tiers: TIER_SIZES[pos].map(size =>
        computeTier(byPosPpg.get(pos) ?? [], byPosSalary.get(pos) ?? [], size)
      ),
    }))

    const flexPlayers = filtered.filter(d => ['RB', 'WR', 'TE'].includes(d.position))
    const flexByPpg = [...flexPlayers].sort((a, b) => b.ppg - a.ppg)
    const flexBySalary = [...flexPlayers].sort((a, b) => b.price - a.price)
    const flexTier: FlexTierData = { top36: computeTier(flexByPpg, flexBySalary, 36) }

    return { positionTiers, flexTier }
  }, [data, minGames])

  return (
    <>
      <section>
        <PlayerScatterChart data={data} onMinGamesChange={setMinGames} />
      </section>
      <PositionTierBreakdown positionTiers={positionTiers} flexTier={flexTier} />
    </>
  )
}
