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
    // Bolt Optimization: Single-pass grouping avoids O(P*N) array filtering
    const byPos = new Map<Position, ChartPoint[]>();
    for (const pos of POSITIONS) {
      byPos.set(pos, []);
    }
    const flexPlayers: ChartPoint[] = [];

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.games_played >= minGames) {
        const posGroup = byPos.get(d.position as Position);
        if (posGroup) posGroup.push(d);
        if (d.position === 'RB' || d.position === 'WR' || d.position === 'TE') {
          flexPlayers.push(d);
        }
      }
    }

    const positionTiers: PositionTierData[] = POSITIONS.map(pos => {
      const players = byPos.get(pos) ?? [];
      const byPosPpg = [...players].sort((a, b) => b.ppg - a.ppg);
      const byPosSalary = [...players].sort((a, b) => b.price - a.price);

      return {
        position: pos,
        tiers: TIER_SIZES[pos].map(size => computeTier(byPosPpg, byPosSalary, size))
      };
    });

    const flexByPpg = [...flexPlayers].sort((a, b) => b.ppg - a.ppg);
    const flexBySalary = [...flexPlayers].sort((a, b) => b.price - a.price);
    const flexTier: FlexTierData = { top36: computeTier(flexByPpg, flexBySalary, 36) };

    return { positionTiers, flexTier };
  }, [data, minGames]);

  return (
    <>
      <section>
        <PlayerScatterChart data={data} onMinGamesChange={setMinGames} />
      </section>
      <PositionTierBreakdown positionTiers={positionTiers} flexTier={flexTier} />
    </>
  )
}
