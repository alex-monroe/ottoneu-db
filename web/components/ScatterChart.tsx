"use client"

import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Legend } from 'recharts'
import { useState } from 'react'
import { ChartPoint, TooltipProps, Position, POSITIONS, POSITION_COLORS } from '@/lib/types'
import PositionFilter from './PositionFilter'

interface ScatterChartProps {
    data: ChartPoint[]
    onMinGamesChange?: (n: number) => void
}

const CustomTooltip = ({ active, payload, metric }: TooltipProps & { metric?: 'PPG' | 'PPS' }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload
        const isPPG = metric === 'PPG';
        return (
            <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 p-3 rounded shadow-lg text-sm">
                <p className="font-bold text-slate-900 dark:text-slate-100">{data.name}</p>
                <p className="text-slate-600 dark:text-slate-400">{data.nfl_team} - {data.position}</p>
                <div className="mt-2 space-y-1">
                    <p>Price: <span className="font-mono font-medium">${data.price}</span></p>
                    <p>Points: <span className="font-mono font-medium">{data.total_points}</span></p>
                    <div className="border-t border-slate-200 dark:border-slate-700 my-1 pt-1">
                        {isPPG ? (
                            <>
                                <p className="font-semibold text-blue-600 dark:text-blue-400">PPG: {data.ppg}</p>
                                <p className="text-xs text-slate-500">(${data.cost_per_ppg.toFixed(2)} / PPG)</p>
                            </>
                        ) : (
                            <>
                                <p className="font-semibold text-blue-600 dark:text-blue-400">PPS: {data.pps}</p>
                                <p className="text-xs text-slate-500">(${data.cost_per_pps.toFixed(2)} / PPS)</p>
                            </>
                        )}
                    </div>
                </div>
            </div>
        )
    }
    return null
}

export default function PlayerScatterChart({ data, onMinGamesChange }: ScatterChartProps) {
    // Basic interaction state if needed, simpler to just use Recharts default for now.
    // Group data by position for the legend to work naturally with colors
    const [selectedPositions, setSelectedPositions] = useState<Position[]>([...POSITIONS]);
    const [metric, setMetric] = useState<'PPG' | 'PPS'>('PPG');
    const [minGames, setMinGames] = useState<number>(0);

    const togglePosition = (pos: Position) => {
        setSelectedPositions(prev =>
            prev.includes(pos)
                ? prev.filter(p => p !== pos)
                : [...prev, pos]
        );
    };

    return (
        <div className="w-full h-[600px] bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex bg-slate-200 dark:bg-slate-800 rounded-lg p-1">
                        <button
                            onClick={() => setMetric('PPG')}
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${metric === 'PPG'
                                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                        >
                            Points/Game
                        </button>
                        <button
                            onClick={() => setMetric('PPS')}
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${metric === 'PPS'
                                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                        >
                            Points/Snap
                        </button>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Min Games: {minGames}</span>
                        <input
                            type="range"
                            min="0"
                            max="17"
                            value={minGames}
                            onChange={(e) => { const n = Number(e.target.value); setMinGames(n); onMinGamesChange?.(n) }}
                            className="w-24 accent-blue-600"
                        />
                    </div>
                </div>

                <PositionFilter
                    positions={POSITIONS}
                    selectedPositions={selectedPositions}
                    onToggle={togglePosition}
                />
            </div>

            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart
                        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                    >
                        <XAxis
                            type="number"
                            dataKey={metric === 'PPG' ? "ppg" : "pps"}
                            name={metric === 'PPG' ? "Points Per Game" : "Points Per Snap"}
                            label={{ value: metric === 'PPG' ? 'Points Per Game' : 'Points Per Snap', position: 'bottom', offset: 0 }}
                        />
                        <YAxis
                            type="number"
                            dataKey="price"
                            name="Price"
                            unit="$"
                            label={{ value: 'Salary ($)', angle: -90, position: 'left' }}
                        />
                        <ZAxis type="number" dataKey="total_points" range={[50, 400]} name="Total Points" />
                        <Tooltip content={<CustomTooltip metric={metric} />} cursor={{ strokeDasharray: '3 3' }} />
                        <Legend verticalAlign="top" />

                        {POSITIONS.filter(pos => selectedPositions.includes(pos)).map((pos) => (
                            <Scatter
                                key={pos}
                                name={pos}
                                data={data.filter(d => d.position === pos && d.games_played >= minGames)}
                                fill={POSITION_COLORS[pos]}
                            />
                        ))}

                    </ScatterChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
