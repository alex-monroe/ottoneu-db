"use client";

import { useState, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LEAGUE_ID } from "@/lib/config";
import HeatIcon from "./HeatIcon";
import { useRankLookup } from "./PositionalRanksProvider";
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
    const rankOf = useRankLookup();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        function handlePointerOutside(e: PointerEvent | MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setMobileSearchOpen(false);
            }
        }
        document.addEventListener("pointerdown", handlePointerOutside);
        return () => document.removeEventListener("pointerdown", handlePointerOutside);
    }, []);

    useEffect(() => {
        const handleShortcut = (e: KeyboardEvent) => {
            if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
                e.preventDefault();
                setMobileSearchOpen(true);
                inputRef.current?.focus();
            }
        };
        document.addEventListener("keydown", handleShortcut);
        return () => document.removeEventListener("keydown", handleShortcut);
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

    const openMobileSearch = () => {
        // Synchronous commit inside the tap handler so iOS Safari opens the keyboard.
        flushSync(() => {
            setMobileSearchOpen(true);
        });
        inputRef.current?.focus();
    };

    const closeMobileSearch = () => {
        setMobileSearchOpen(false);
        setIsOpen(false);
        setQuery("");
        setResults([]);
        inputRef.current?.blur();
    };

    const clearQuery = () => {
        setQuery("");
        setResults([]);
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.focus();
    };

    const handleSelect = (playerId: number) => {
        router.push(`/players/${playerId}`);
        setIsOpen(false);
        setMobileSearchOpen(false);
        setQuery("");
        inputRef.current?.blur();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            setIsOpen(false);
            setMobileSearchOpen(false);
            inputRef.current?.blur();
            return;
        }
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
        }
    };

    // On phones (< sm) the container deliberately omits `relative` so the
    // expanded search bar and results sheet anchor to `<nav className="relative">`
    // across the full header width rather than colliding with the hamburger.
    return (
        <div className="sm:relative" ref={containerRef}>
            {!mobileSearchOpen && (
                <button
                    type="button"
                    onClick={openMobileSearch}
                    aria-label="Open player search"
                    className="sm:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line-strong bg-sunken text-sm text-ink-subtle hover:text-ink transition-colors"
                >
                    <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Search</span>
                </button>
            )}

            <div
                className={
                    mobileSearchOpen
                        ? "absolute inset-x-0 top-0 z-50 flex h-14 items-center gap-2 bg-raised px-4 sm:static sm:inset-auto sm:z-auto sm:h-auto sm:bg-transparent sm:px-0"
                        : "hidden sm:block"
                }
            >
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle pointer-events-none" aria-hidden="true" />
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
                        className="w-full sm:w-56 md:w-64 pl-9 pr-8 py-1.5 rounded-md border border-line-strong bg-sunken text-base sm:text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all sm:focus:w-72 md:focus:w-80"
                        aria-label="Search players globally"
                    />

                    {isLoading ? (
                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle animate-spin" />
                    ) : query ? (
                        <button
                            type="button"
                            onClick={clearQuery}
                            aria-label="Clear search"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-ink-subtle hover:text-ink transition-colors"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    ) : (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:block">
                            <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle border border-line rounded bg-white dark:bg-slate-800">
                                /
                            </kbd>
                        </div>
                    )}
                </div>

                {mobileSearchOpen && (
                    <button
                        type="button"
                        onClick={closeMobileSearch}
                        className="sm:hidden shrink-0 px-2 py-1.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
                    >
                        Cancel
                    </button>
                )}
            </div>

            {isOpen && query.trim() && (
                <div className="absolute inset-x-2 sm:inset-x-auto sm:right-0 top-full mt-1 sm:mt-2 sm:w-80 min-w-[280px] z-50 rounded-md border border-line bg-raised shadow-xl overflow-hidden">
                    {results.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-ink-subtle text-center">
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
                                            : "hover:bg-sunken/50"
                                    }`}
                                >
                                    <div className="flex flex-col min-w-0 pr-2">
                                        <span className="text-sm font-medium text-ink truncate">
                                            {player.name}
                                        </span>
                                        <span className="text-xs text-ink-subtle">
                                            {player.nfl_team}
                                        </span>
                                    </div>
                                    {/* The position chip becomes the rank tag once he has played. */}
                                    <span className="flex shrink-0 items-center gap-0.5">
                                        <PositionBadge
                                            position={player.position}
                                            rank={rankOf(player.ottoneu_id)}
                                            size="sm"
                                        />
                                        <HeatIcon rank={rankOf(player.ottoneu_id)} size="sm" />
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
