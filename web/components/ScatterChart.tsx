"use client"

import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Legend } from 'recharts'
import { useState } from 'react'

interface PlayerData {
    name: string
    position: string
    nfl_team: string
    total_points: number
    ppg: number
    pps: number
    price: number
    cost_per_ppg: number
    cost_per_pps: number
    games_played: number
    snaps: number
}

interface ScatterChartProps {
    data: PlayerData[]
}

const COLORS = {
    QB: '#EF4444', // Red
    RB: '#3B82F6', // Blue
    WR: '#10B981', // Green
    TE: '#F59E0B', // Yellow
    K: '#8B5CF6', // Purple
}

const CustomTooltip = ({ active, payload, metric }: any) => {
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
                    {isPPG ? (
                        <>
                            <p>PPG: <span className="font-mono font-medium">{data.ppg}</span></p>
                            <p>$/PPG: <span className="font-mono font-medium text-blue-600 dark:text-blue-400">${data.cost_per_ppg.toFixed(2)}</span></p>
                        </>
                    ) : (
                        <>
                            <p>PPS: <span className="font-mono font-medium">{data.pps}</span></p>
                            <p>$/PPS: <span className="font-mono font-medium text-blue-600 dark:text-blue-400">${data.cost_per_pps.toFixed(2)}</span></p>
                        </>
                    )}
                </div>
            </div>
        )
    }
    return null
}

export default function PlayerScatterChart({ data }: ScatterChartProps) {
    // Basic interaction state if needed, simpler to just use Recharts default for now.
    // Group data by position for the legend to work naturally with colors
    const positions = ['QB', 'RB', 'WR', 'TE', 'K'];
    const [selectedPositions, setSelectedPositions] = useState<string[]>(positions);
    const [metric, setMetric] = useState<'PPG' | 'PPS'>('PPG');

    const togglePosition = (pos: string) => {
        setSelectedPositions(prev =>
            prev.includes(pos)
                ? prev.filter(p => p !== pos)
                : [...prev, pos]
        );
    };

    return (
        <div className="w-full h-[600px] bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <div className="flex bg-slate-200 dark:bg-slate-800 rounded-lg p-1">
                     <button
                        onClick={() => setMetric('PPG')}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                            metric === 'PPG'
                                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                    >
                        Points/Game
                    </button>
                    <button
                        onClick={() => setMetric('PPS')}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                            metric === 'PPS'
                                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                    >
                        Points/Snap
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 justify-center">
                    {positions.map(pos => (
                        <button
                            key={pos}
                            onClick={() => togglePosition(pos)}
                            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
                                selectedPositions.includes(pos)
                                    ? 'text-white border-transparent'
                                    : 'bg-transparent text-slate-500 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                            style={{
                                backgroundColor: selectedPositions.includes(pos) ? COLORS[pos as keyof typeof COLORS] : undefined
                            }}
                        >
                            {pos}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart
                        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                    >
                        <XAxis
                            type="number"
                            dataKey="total_points"
                            name="Total Points"
                            label={{ value: 'Total Points', position: 'bottom', offset: 0 }}
                        />
                        <YAxis
                            type="number"
                            dataKey={metric === 'PPG' ? "cost_per_ppg" : "cost_per_pps"}
                            name={metric === 'PPG' ? "$/PPG" : "$/PPS"}
                            label={{ value: metric === 'PPG' ? 'Salary / PPG ($)' : 'Salary / PPS ($)', angle: -90, position: 'left' }}
                        />
                        <ZAxis type="number" dataKey="price" range={[50, 400]} name="Price" />
                        <Tooltip content={<CustomTooltip metric={metric} />} cursor={{ strokeDasharray: '3 3' }} />
                        <Legend verticalAlign="top" />

                        {positions.filter(pos => selectedPositions.includes(pos)).map((pos) => (
                            <Scatter
                                key={pos}
                                name={pos}
                                data={data.filter(d => d.position === pos)}
                                fill={COLORS[pos as keyof typeof COLORS] || '#6366f1'}
                            />
                        ))}

                    </ScatterChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
