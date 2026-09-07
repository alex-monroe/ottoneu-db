"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { PlayerListItem, POSITIONS, Position } from "@/lib/types";
import type { Column } from "@/lib/types";
import DataTable from "@/components/DataTable";
import PositionFilter from "@/components/PositionFilter";
import {
    playerNameCol,
    positionCol,
    nflTeamCol,
    ownerCol,
} from "@/components/columns";

interface PlayerSearchProps {
    players: PlayerListItem[];
}

/**
 * Build columns for the player directory table.
 * Uses null hoverDataMap = link-only mode (no hover cards).
 */
function getPlayerCols(): Column<PlayerListItem>[] {
    return [
        playerNameCol<PlayerListItem>({ hoverDataMap: null }),
        positionCol<PlayerListItem>(),
        nflTeamCol<PlayerListItem>(),
        { key: "price", label: "Salary", format: "currency" },
        ownerCol<PlayerListItem>(),
        { key: "ppg", label: "PPG", format: "decimal" },
        { key: "total_points", label: "Points", format: "decimal" },
        { key: "games_played", label: "GP", format: "number" },
    ];
}

export default function PlayerSearch({ players }: PlayerSearchProps) {
    const [query, setQuery] = useState("");
    const [position, setPosition] = useState<Position | "ALL">("ALL");
    const inputRef = useRef<HTMLInputElement>(null);

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

    const filtered = players.filter((p) => {
        const matchesQuery =
            query === "" ||
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.nfl_team.toLowerCase().includes(query.toLowerCase());
        const matchesPosition =
            position === "ALL" || p.position === position;
        return matchesQuery && matchesPosition;
    });

    // Map players to add required fields for column factories
    const tableData = filtered.map((p) => ({
        ...p,
        player_id: p.id,
        ottoneu_id: p.ottoneu_id,
        team_name: p.team_name ?? "Free Agent",
    }));

    const selectedPositions = position === "ALL" ? [...POSITIONS] : [position];

    const handleToggle = (pos: Position) => {
        setPosition(position === pos ? "ALL" : pos);
    };

    const handleToggleAll = () => {
        setPosition("ALL");
    };

    return (
        <div className="space-y-4">
            {/* Search + Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle" aria-hidden="true" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search by name or team…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search players"
                        className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-line-strong bg-raised text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                        {!query ? (
                            <kbd
                                aria-hidden="true"
                                className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle border border-line rounded bg-sunken pointer-events-none select-none"
                            >
                                /
                            </kbd>
                        ) : (
                            <button
                                onClick={() => setQuery("")}
                                className="text-ink-subtle hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none focus:text-slate-600 dark:focus:text-slate-200"
                                aria-label="Clear search"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        )}
                    </div>
                </div>
                <PositionFilter
                    positions={POSITIONS}
                    selectedPositions={selectedPositions}
                    onToggle={handleToggle}
                    showAll
                    onToggleAll={handleToggleAll}
                />
            </div>

            {/* Results count */}
            <p className="text-xs text-ink-subtle">
                {filtered.length} player{filtered.length !== 1 ? "s" : ""}
            </p>

            {/* Player table */}
            {filtered.length === 0 ? (
                <div className="overflow-x-auto rounded-lg border border-line">
                    <div className="p-8 text-center text-ink-subtle">
                        <p className="text-lg font-medium mb-1">No players found</p>
                        <p className="text-sm mb-4">
                            Try adjusting your search{query ? ` for "${query}"` : ""} or changing the position filter.
                        </p>
                        <button
                            onClick={() => {
                                setQuery("");
                                setPosition("ALL");
                                inputRef.current?.focus();
                            }}
                            className="inline-flex items-center px-4 py-2 border border-line-strong rounded-md shadow-sm text-sm font-medium text-ink-muted bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent dark:focus:ring-offset-slate-900 transition-colors"
                        >
                            <X className="h-4 w-4 mr-2" aria-hidden="true" />
                            Clear filters
                        </button>
                    </div>
                </div>
            ) : (
                <DataTable
                    columns={getPlayerCols()}
                    data={tableData}
                />
            )}
        </div>
    );
}
