"use client";

import { useMemo, useState } from "react";
import {
  reconstructRostersAtDate,
  getDateRange,
  type RosterData,
} from "@/lib/roster-reconstruction";
import { CAP_PER_TEAM, NUM_TEAMS } from "@/lib/arb-logic";
import TeamRosterSection from "./TeamRosterSection";

const QUICK_DATES = [
  { label: "Pre-Draft", date: "2025-08-31" },
  { label: "Wk 1", date: "2025-09-07" },
  { label: "Wk 8", date: "2025-10-26" },
  { label: "Wk 16", date: "2025-12-10" },
  { label: "Today", date: new Date().toISOString().slice(0, 10) },
];

export default function RostersClient({
  transactions,
  players,
  stats,
}: RosterData) {
  const { min, max } = getDateRange();
  const [selectedDate, setSelectedDate] = useState("2025-12-10");

  const rosters = useMemo(
    () => reconstructRostersAtDate(transactions, players, stats, selectedDate),
    [transactions, players, stats, selectedDate]
  );

  const totalCapUsed = rosters.reduce((sum, r) => sum + r.total_salary, 0);
  const totalRostered = rosters.reduce((sum, r) => sum + r.players.length, 0);
  const avgCapUsed =
    rosters.length > 0 ? Math.round(totalCapUsed / rosters.length) : 0;

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Roster Snapshots
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            View all 12 league rosters at any point in the season.
          </p>
        </header>

        {/* Date Picker */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label
                htmlFor="roster-date"
                className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
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
                className="px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Quick:
              </span>
              {QUICK_DATES.map(({ label, date }) => (
                <button
                  key={label}
                  onClick={() => setSelectedDate(date)}
                  className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                    selectedDate === date
                      ? "bg-blue-600 text-white"
                      : "bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
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
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Teams with Players
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {rosters.length}
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                /{NUM_TEAMS}
              </span>
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Total Rostered
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {totalRostered}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Total Cap Used
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              ${totalCapUsed.toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              of ${(NUM_TEAMS * CAP_PER_TEAM).toLocaleString()} league total
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Avg Cap Used
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              ${avgCapUsed}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              per team
            </p>
          </div>
        </div>

        {/* Team Sections */}
        {rosters.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 text-center py-12">
            No roster data available for this date.
          </p>
        ) : (
          <div className="space-y-2">
            {rosters.map((roster) => (
              <TeamRosterSection key={roster.team_name} roster={roster} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
