"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BacktestPlayer, Position, POSITIONS } from "@/lib/types";
import { calculateMetrics, PositionMetrics } from "./metrics";
import AccuracyScatterChart from "./AccuracyScatterChart";
import DataTable, { Column } from "@/components/DataTable";
import PositionFilter from "@/components/PositionFilter";
import SummaryCard from "@/components/SummaryCard";

const PLAYER_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "Team" },
  { key: "team_name", label: "Owner" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "seasons_used", label: "Seasons" },
  { key: "games_played", label: "GP", format: "number" },
  { key: "projected_ppg", label: "Proj PPG", format: "decimal" },
  { key: "actual_ppg", label: "Actual PPG", format: "decimal" },
  { key: "error", label: "Error", format: "decimal" },
  { key: "abs_error", label: "|Error|", format: "decimal" },
];

const METRICS_COLUMNS: Column[] = [
  { key: "position", label: "Position" },
  { key: "count", label: "Players", format: "number" },
  { key: "mae", label: "MAE", format: "decimal" },
  { key: "bias", label: "Bias", format: "decimal" },
  { key: "r2", label: "R²", format: "decimal" },
  { key: "rmse", label: "RMSE", format: "decimal" },
];

interface Props {
  players: BacktestPlayer[];
  allMetrics: PositionMetrics[];
  targetSeason: number;
  availableSeasons: number[];
}

export default function ProjectionAccuracyClient({
  players,
  allMetrics,
  targetSeason,
  availableSeasons,
}: Props) {
  const router = useRouter();
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([
    ...POSITIONS,
  ]);
  const [minGames, setMinGames] = useState(4);

  const togglePosition = (pos: Position) => {
    setSelectedPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const toggleAll = () => {
    setSelectedPositions(
      selectedPositions.length === POSITIONS.length ? [] : [...POSITIONS]
    );
  };

  const rookiePlayers = players.filter(
    (p) => p.projection_method === "rookie_trajectory"
  );
  const rookieMetrics = calculateMetrics(rookiePlayers, "Rookies");

  const filteredPlayers = players.filter(
    (p) =>
      selectedPositions.includes(p.position as Position) &&
      p.games_played >= minGames
  );

  const filteredRookies = rookiePlayers.filter(
    (p) =>
      selectedPositions.includes(p.position as Position) &&
      p.games_played >= minGames
  );

  const overallMetrics = allMetrics[0];

  return (
    <div className="space-y-8">
      {/* Season tabs */}
      <div className="flex gap-2">
        {availableSeasons.map((season) => (
          <button
            key={season}
            onClick={() =>
              router.push(`/projection-accuracy?season=${season}`)
            }
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              season === targetSeason
                ? "bg-blue-600 text-white border-transparent"
                : "bg-transparent text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {season}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <SummaryCard
          label="Players Backtested"
          value={String(overallMetrics.count)}
        />
        <SummaryCard
          label="MAE (Mean Abs Error)"
          value={overallMetrics.mae.toFixed(2)}
        />
        <SummaryCard
          label="Bias (Mean Error)"
          value={
            (overallMetrics.bias >= 0 ? "+" : "") +
            overallMetrics.bias.toFixed(2)
          }
          variant={
            Math.abs(overallMetrics.bias) < 0.2
              ? "default"
              : overallMetrics.bias > 0
              ? "positive"
              : "negative"
          }
        />
        <SummaryCard
          label="R² (Correlation)"
          value={overallMetrics.r2.toFixed(2)}
          variant={
            overallMetrics.r2 >= 0.5
              ? "positive"
              : overallMetrics.r2 >= 0.25
              ? "default"
              : "negative"
          }
        />
        <SummaryCard
          label="RMSE"
          value={overallMetrics.rmse.toFixed(2)}
        />
      </div>

      {/* Per-position breakdown */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
          Metrics by Position
        </h2>
        <DataTable columns={METRICS_COLUMNS} data={allMetrics} />
      </section>

      {/* Scatter chart */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
          Projected vs Actual PPG
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Points on the dashed diagonal = perfect prediction. Above the line =
          outperformed projection. Below = underperformed.
        </p>
        <AccuracyScatterChart
          players={players}
          selectedPositions={selectedPositions}
        />
      </section>

      {/* Filters + error table */}
      <section>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Per-Player Errors
          </h2>
          <PositionFilter
            positions={POSITIONS}
            selectedPositions={selectedPositions}
            onToggle={togglePosition}
            showAll
            onToggleAll={toggleAll}
          />
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Min Games: {minGames}
            </span>
            <input
              type="range"
              min="0"
              max="17"
              value={minGames}
              onChange={(e) => setMinGames(Number(e.target.value))}
              className="w-24 accent-blue-600"
            />
          </div>
        </div>
        <DataTable
          columns={PLAYER_COLUMNS}
          data={filteredPlayers}
          highlightRules={[
            {
              key: "error",
              op: "gte",
              value: 3,
              className: "bg-green-50 dark:bg-green-950",
            },
            {
              key: "error",
              op: "lte",
              value: -3,
              className: "bg-red-50 dark:bg-red-950",
            },
          ]}
        />
      </section>

      {/* Rookie breakdown */}
      {rookiePlayers.length > 0 && (
        <section className="border border-amber-200 dark:border-amber-800 rounded-lg p-5 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              Rookie Projections
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                Rookie
              </span>
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Players projected using <strong>RookieTrajectoryPPG</strong> (one
              prior season). Projection = prior-season PPG × H2/H1 snap
              trajectory, clamped ±50%.
            </p>
          </div>

          {/* Rookie summary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <SummaryCard
              label="Rookies Backtested"
              value={String(rookieMetrics.count)}
            />
            <SummaryCard
              label="MAE"
              value={rookieMetrics.mae.toFixed(2)}
            />
            <SummaryCard
              label="Bias"
              value={
                (rookieMetrics.bias >= 0 ? "+" : "") +
                rookieMetrics.bias.toFixed(2)
              }
              variant={
                Math.abs(rookieMetrics.bias) < 0.2
                  ? "default"
                  : rookieMetrics.bias > 0
                  ? "positive"
                  : "negative"
              }
            />
            <SummaryCard
              label="R²"
              value={rookieMetrics.r2.toFixed(2)}
              variant={
                rookieMetrics.r2 >= 0.5
                  ? "positive"
                  : rookieMetrics.r2 >= 0.25
                  ? "default"
                  : "negative"
              }
            />
            <SummaryCard
              label="RMSE"
              value={rookieMetrics.rmse.toFixed(2)}
            />
          </div>

          {/* Rookie player table */}
          <DataTable
            columns={PLAYER_COLUMNS}
            data={filteredRookies}
            highlightRules={[
              {
                key: "error",
                op: "gte",
                value: 3,
                className: "bg-green-50 dark:bg-green-950",
              },
              {
                key: "error",
                op: "lte",
                value: -3,
                className: "bg-red-50 dark:bg-red-950",
              },
            ]}
          />
        </section>
      )}
    </div>
  );
}
