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

function computeTier(players: ChartPoint[], rank: number): TierStat {
  const player = players[rank - 1] // Nth-ranked player (1-indexed)
  return {
    label: `#${rank}`,
    tierSize: rank,
    n: players.length,
    ppg: player?.ppg ?? 0,
    price: player?.price ?? 0,
  }
}

export default function PlayerEfficiencyClient({ data }: { data: ChartPoint[] }) {
  const [minGames, setMinGames] = useState(0)

  const { positionTiers, flexTier } = useMemo(() => {
    const filtered = data.filter(d => d.games_played >= minGames)

    const byPos = new Map<Position, ChartPoint[]>()
    for (const pos of POSITIONS) {
      byPos.set(pos, filtered.filter(d => d.position === pos).sort((a, b) => b.ppg - a.ppg))
    }

    const positionTiers: PositionTierData[] = POSITIONS.map(pos => ({
      position: pos,
      tiers: TIER_SIZES[pos].map(size => computeTier(byPos.get(pos) ?? [], size)),
    }))

    const flexPool = filtered
      .filter(d => ['RB', 'WR', 'TE'].includes(d.position))
      .sort((a, b) => b.ppg - a.ppg)
    const flexTier: FlexTierData = { top36: computeTier(flexPool, 36) }

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
