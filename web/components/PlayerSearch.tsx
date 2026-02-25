"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { PlayerListItem, POSITIONS, Position, POSITION_COLORS } from "@/lib/types";

interface PlayerSearchProps {
    players: PlayerListItem[];
}

export default function PlayerSearch({ players }: PlayerSearchProps) {
    const [query, setQuery] = useState("");
    const [position, setPosition] = useState<Position | "ALL">("ALL");

    const filtered = players.filter((p) => {
        const matchesQuery =
            query === "" ||
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.nfl_team.toLowerCase().includes(query.toLowerCase());
        const matchesPosition =
            position === "ALL" || p.position === position;
        return matchesQuery && matchesPosition;
    });

    return (
        <div className="space-y-4">
            {/* Search + Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
                    <input
                        type="text"
                        placeholder="Search by name or team…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search players"
                        className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                    {query && (
                        <button
                            onClick={() => setQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none focus:text-slate-600 dark:focus:text-slate-200"
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    )}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                    <button
                        onClick={() => setPosition("ALL")}
                        aria-pressed={position === "ALL" ? "true" : "false"}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${position === "ALL"
                                ? "bg-slate-800 text-white dark:bg-white dark:text-black"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                            }`}
                    >
                        ALL
                    </button>
                    {POSITIONS.map((pos) => (
                        <button
                            key={pos}
                            onClick={() => setPosition(pos)}
                            aria-pressed={position === pos ? "true" : "false"}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${position === pos
                                    ? "text-white"
                                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                                }`}
                            style={
                                position === pos
                                    ? { backgroundColor: POSITION_COLORS[pos] }
                                    : undefined
                            }
                        >
                            {pos}
                        </button>
                    ))}
                </div>
            </div>

            {/* Results count */}
            <p className="text-xs text-slate-500 dark:text-slate-400">
                {filtered.length} player{filtered.length !== 1 ? "s" : ""}
            </p>

            {/* Player table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                {filtered.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                        <p className="text-lg font-medium mb-1">No players found</p>
                        <p className="text-sm">
                            Try adjusting your search for "{query}" or changing the position filter.
                        </p>
                    </div>
                ) : (
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="bg-slate-100 dark:bg-slate-800">
                                <th className="px-3 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Player</th>
                                <th className="px-3 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Pos</th>
                                <th className="px-3 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Team</th>
                                <th className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">Salary</th>
                                <th className="px-3 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Owner</th>
                                <th className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">PPG</th>
                                <th className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">Points</th>
                                <th className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">GP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((p, i) => (
                                <tr
                                    key={p.id}
                                    className={`border-t border-slate-100 dark:border-slate-800 hover:bg-blue-50 dark:hover:bg-slate-800/50 transition-colors ${i % 2 === 0
                                            ? "bg-white dark:bg-slate-950"
                                            : "bg-slate-50 dark:bg-slate-900"
                                        }`}
                                >
                                    <td className="px-3 py-2">
                                        <Link
                                            href={`/players/${p.ottoneu_id}`}
                                            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                        >
                                            {p.name}
                                        </Link>
                                    </td>
                                    <td className="px-3 py-2">
                                        <span
                                            className="inline-block px-1.5 py-0.5 rounded text-xs font-bold text-white"
                                            style={{
                                                backgroundColor:
                                                    POSITION_COLORS[p.position as Position] ?? "#6B7280",
                                            }}
                                        >
                                            {p.position}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{p.nfl_team}</td>
                                    <td className="px-3 py-2 text-right font-mono text-slate-800 dark:text-slate-200">
                                        {p.price != null ? `$${p.price}` : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 text-xs truncate max-w-[180px]">
                                        {p.team_name ?? "Free Agent"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-slate-800 dark:text-slate-200">
                                        {p.ppg != null ? Number(p.ppg).toFixed(1) : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-slate-800 dark:text-slate-200">
                                        {p.total_points != null ? Number(p.total_points).toFixed(1) : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-slate-800 dark:text-slate-200">
                                        {p.games_played ?? "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
