"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  reconstructRostersAtDate,
  type RosterData,
  type RosterSnapshot,
} from "@/lib/roster-reconstruction";
import { CAP_PER_TEAM, NUM_TEAMS } from "@/lib/arb-logic";
import type { PlayerHoverData } from "@/lib/types";
import TeamRosterSection from "./TeamRosterSection";
import PageShell from "@/components/PageShell";
import { EmptyState } from "@/components/states";

export default function RostersClient({
  transactions,
  players,
  stats,
  leaguePrices,
  hoverDataMap,
  viewerTeam = null,
  season,
  seasons,
  statsSeason,
  quickDates,
  dateRange,
  defaultDate,
  freshness = null,
}: RosterData & {
  hoverDataMap?: Record<string, PlayerHoverData> | null;
  /** The signed-in viewer's team, expanded by default in the roster list. */
  viewerTeam?: string | null;
  season: number;
  seasons: number[];
  statsSeason: number;
  quickDates: RosterSnapshot[];
  dateRange: { min: string; max: string };
  defaultDate: string;
  /** Pre-rendered "Rosters updated ..." caption from the server. */
  freshness?: string | null;
}) {
  const router = useRouter();
  const { min, max } = dateRange;
  const [selectedDate, setSelectedDate] = useState(defaultDate);

  const rosters = useMemo(
    () => reconstructRostersAtDate(transactions, players, stats, selectedDate, leaguePrices),
    [transactions, players, stats, selectedDate, leaguePrices]
  );

  const totalCapUsed = rosters.reduce((sum, r) => sum + r.total_salary, 0);
  const totalRostered = rosters.reduce((sum, r) => sum + r.players.length, 0);
  const avgCapUsed =
    rosters.length > 0 ? Math.round(totalCapUsed / rosters.length) : 0;

  return (
    <PageShell width="wide">
        {/* Header */}
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Roster Snapshots
          </h1>
          <p className="text-ink-subtle mt-2">
            View all {NUM_TEAMS} league rosters at any point in the {season} season.
            PPG and PPS are {statsSeason} season numbers.
            {freshness && <span className="block mt-1 text-xs text-ink-subtle">{freshness}</span>}
          </p>
        </header>

        {/* Date Picker */}
        <div className="bg-sunken rounded-lg p-5 border border-line">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="roster-season"
                  className="text-sm font-medium text-ink-muted whitespace-nowrap"
                >
                  Season:
                </label>
                <select
                  id="roster-season"
                  value={season}
                  onChange={(e) => router.push(`/rosters?season=${e.target.value}`)}
                  className="px-3 py-1.5 text-sm rounded-md border border-line-strong bg-white dark:bg-slate-800 text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {seasons.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="roster-date"
                  className="text-sm font-medium text-ink-muted whitespace-nowrap"
                >
                  Date:
                </label>
                <input
                  id="roster-date"
                  type="date"
                  min={min}
                  max={max}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-md border border-line-strong bg-white dark:bg-slate-800 text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-ink-subtle">
                Jump to:
              </span>
              {quickDates.map(({ label, date }) => (
                <button
                  key={label}
                  onClick={() => setSelectedDate(date)}
                  className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                    selectedDate === date
                      ? "bg-blue-600 text-white"
                      : "bg-white dark:bg-slate-800 border border-line-strong text-ink-muted hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-sunken rounded-lg p-4 border border-line">
            <p className="text-sm text-ink-subtle">
              Teams with Players
            </p>
            <p className="text-2xl font-bold text-ink">
              {rosters.length}
              <span className="text-sm font-normal text-ink-subtle">
                /{NUM_TEAMS}
              </span>
            </p>
          </div>
          <div className="bg-sunken rounded-lg p-4 border border-line">
            <p className="text-sm text-ink-subtle">
              Total Rostered
            </p>
            <p className="text-2xl font-bold text-ink">
              {totalRostered}
            </p>
          </div>
          <div className="bg-sunken rounded-lg p-4 border border-line">
            <p className="text-sm text-ink-subtle">
              Total Cap Used
            </p>
            <p className="text-2xl font-bold text-ink">
              ${totalCapUsed.toLocaleString()}
            </p>
            <p className="text-xs text-ink-subtle">
              of ${(NUM_TEAMS * CAP_PER_TEAM).toLocaleString()} league total
            </p>
          </div>
          <div className="bg-sunken rounded-lg p-4 border border-line">
            <p className="text-sm text-ink-subtle">
              Avg Cap Used
            </p>
            <p className="text-2xl font-bold text-ink">
              ${avgCapUsed}
            </p>
            <p className="text-xs text-ink-subtle">
              per team
            </p>
          </div>
        </div>

        {/* Team Sections */}
        {rosters.length === 0 ? (
          <EmptyState title="No rosters for this date">
            The league had no roster snapshot on this date — pick another week, or
            check whether the scrape has run for this season.
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {rosters.map((roster) => (
              <TeamRosterSection key={roster.team_name} roster={roster} hoverDataMap={hoverDataMap} viewerTeam={viewerTeam} />
            ))}
          </div>
        )}
    </PageShell>
  );
}
