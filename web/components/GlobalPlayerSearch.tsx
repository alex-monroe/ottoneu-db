"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LEAGUE_ID } from "@/lib/config";
import PositionBadge from "@/components/PositionBadge";

interface SearchResult {
    id: string;
    ottoneu_id: number;
    name: string;
    nfl_team: string;
    position: string;
}

// Raw shape returned when we embed roster + stats data for ranking.
interface RawSearchRow extends SearchResult {
    league_prices: { team_name: string | null; league_id: number }[] | null;
    player_stats: { season: number }[] | null;
}

// A player counts as "active" if they have fantasy stats in the current or
// previous season; older-but-present means "historic".
/**
 * Relevance tier for search ranking (lower = surfaced first):
 *   0 rostered in our league · 1 active · 2 historic · 3 no fantasy stats
 *
 * A player counts as "active" if they have fantasy stats in or after
 * `activeSinceSeason` (the season before the current stats season).
 */
function relevanceTier(row: RawSearchRow, activeSinceSeason: number): number {
    const rostered = row.league_prices?.some(
        (lp) =>
            lp.league_id === LEAGUE_ID &&
            lp.team_name != null &&
            lp.team_name !== "" &&
            lp.team_name !== "FA"
    );
    if (rostered) return 0;

    const lastSeason = row.player_stats?.length
        ? Math.max(...row.player_stats.map((s) => s.season))
        : null;
    if (lastSeason == null) return 3;
    return lastSeason >= activeSinceSeason ? 1 : 2;
}

function lastSeasonOf(row: RawSearchRow): number {
    return row.player_stats?.length
        ? Math.max(...row.player_stats.map((s) => s.season))
        : 0;
}

export default function GlobalPlayerSearch({ activeSinceSeason }: { activeSinceSeason: number }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    useEffect(() => {
        let isCancelled = false;

        async function fetchResults() {
            if (!query.trim()) {
                setResults([]);
                setIsOpen(false);
                return;
            }

            setIsLoading(true);
            // Fetch a generous candidate pool with the roster + recency signals
            // needed to rank, then sort by relevance tier and show the top 8.
            // Ranking client-side (rather than alphabetically in SQL) keeps
            // rostered/active players from being buried by historic ones.
            const { data, error } = await supabase
                .from("players")
                .select(
                    "id, ottoneu_id, name, nfl_team, position, league_prices(team_name, league_id), player_stats(season)"
                )
                .or(`name.ilike.%${query}%,nfl_team.ilike.%${query}%`)
                .order("name")
                .limit(50);

            if (!isCancelled) {
                if (!error && data) {
                    const ranked = (data as unknown as RawSearchRow[])
                        .map((row) => ({ row, tier: relevanceTier(row, activeSinceSeason) }))
                        .sort(
                            (a, b) =>
                                a.tier - b.tier ||
                                lastSeasonOf(b.row) - lastSeasonOf(a.row) ||
                                a.row.name.localeCompare(b.row.name)
                        )
                        .slice(0, 8)
                        .map(({ row }) => ({
                            id: row.id,
                            ottoneu_id: row.ottoneu_id,
                            name: row.name,
                            nfl_team: row.nfl_team,
                            position: row.position,
                        }));
                    setResults(ranked);
                    setIsOpen(true);
                    setSelectedIndex(-1);
                } else {
                    setResults([]);
                }
                setIsLoading(false);
            }
        }

        const timeoutId = setTimeout(fetchResults, 300);
        return () => {
            isCancelled = true;
            clearTimeout(timeoutId);
        };
    }, [query, activeSinceSeason]);

    const handleSelect = (playerId: number) => {
        router.push(`/players/${playerId}`);
        setIsOpen(false);
        setQuery("");
        inputRef.current?.blur();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen || results.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        } else if (e.key === "Enter" && selectedIndex >= 0) {
            e.preventDefault();
            handleSelect(results[selectedIndex].ottoneu_id);
        } else if (e.key === "Escape") {
            setIsOpen(false);
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Search players..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                        if (query.trim() && results.length > 0) setIsOpen(true);
                    }}
                    onKeyDown={handleKeyDown}
                    className="w-48 sm:w-64 pl-9 pr-8 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all focus:w-64 sm:focus:w-80"
                    aria-label="Search players globally"
                />
                
                {isLoading ? (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                ) : (
                    !query && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:block">
                            <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-slate-400 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800">
                                /
                            </kbd>
                        </div>
                    )
                )}
            </div>

            {isOpen && query.trim() && (
                <div className="absolute right-0 sm:left-0 top-full mt-2 w-72 sm:w-full min-w-[280px] z-50 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
                    {results.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 text-center">
                            No players found
                        </div>
                    ) : (
                        <ul className="max-h-[300px] overflow-y-auto py-1">
                            {results.map((player, index) => (
                                <li
                                    key={player.id}
                                    onClick={() => handleSelect(player.ottoneu_id)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    className={`px-3 py-2 cursor-pointer flex items-center justify-between transition-colors ${
                                        selectedIndex === index
                                            ? "bg-blue-50 dark:bg-slate-800"
                                            : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                    }`}
                                >
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                                            {player.name}
                                        </span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                            {player.nfl_team}
                                        </span>
                                    </div>
                                    <PositionBadge position={player.position} size="sm" />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
