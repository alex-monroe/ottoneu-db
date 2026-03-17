"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BacktestPlayer, Position, POSITIONS, ProjectionModel, TableRow } from "@/lib/types";
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

const DELTA_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "Team" },
  { key: "proj_a", label: "Model A Proj", format: "decimal" },
  { key: "proj_b", label: "Model B Proj", format: "decimal" },
  { key: "delta", label: "Delta (B−A)", format: "decimal" },
  { key: "abs_delta", label: "|Delta|", format: "decimal" },
];

interface PlayerDelta {
  player_id: string;
  name: string;
  position: string;
  nfl_team: string;
  proj_a: number;
  proj_b: number;
  delta: number;
  abs_delta: number;
  [key: string]: string | number | null | undefined;
}

interface Props {
  players: BacktestPlayer[];
  allMetrics: PositionMetrics[];
  targetSeason: number;
  availableSeasons: number[];
  models: ProjectionModel[];
  selectedModelId: string | null;
  compareModelId: string | null;
  comparePlayers: BacktestPlayer[] | null;
  compareMetrics: PositionMetrics[] | null;
  compareModel: ProjectionModel | null;
}

// Format a delta value with arrow and sign for display
function formatDeltaMetric(
  delta: number,
  higherIsBetter: boolean
): { label: string; variant: "positive" | "negative" | "default" } {
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  const sign = delta > 0 ? "+" : "";
  return {
    label: `${arrow} ${sign}${delta.toFixed(2)}`,
    variant:
      Math.abs(delta) < 0.01
        ? "default"
        : improved
        ? "positive"
        : "negative",
  };
}

export default function ProjectionAccuracyClient({
  players,
  allMetrics,
  targetSeason,
  availableSeasons,
  models,
  selectedModelId,
  compareModelId,
  comparePlayers,
  compareMetrics,
  compareModel,
}: Props) {
  const router = useRouter();
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([
    ...POSITIONS,
  ]);
  const [minGames, setMinGames] = useState(4);
  const [showCompareDropdown, setShowCompareDropdown] = useState(false);

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

  const handleModelChange = (modelId: string) => {
    const params = new URLSearchParams();
    params.set("season", String(targetSeason));
    if (modelId) {
      params.set("model", modelId);
    }
    // Drop compare when primary model changes
    router.push(`/projection-accuracy?${params.toString()}`);
  };

  const handleCompareChange = (compareId: string) => {
    const params = new URLSearchParams();
    params.set("season", String(targetSeason));
    if (selectedModelId) params.set("model", selectedModelId);
    if (compareId) params.set("compare", compareId);
    router.push(`/projection-accuracy?${params.toString()}`);
    setShowCompareDropdown(false);
  };

  const handleClearCompare = () => {
    const params = new URLSearchParams();
    params.set("season", String(targetSeason));
    if (selectedModelId) params.set("model", selectedModelId);
    router.push(`/projection-accuracy?${params.toString()}`);
    setShowCompareDropdown(false);
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
  const compareOverallMetrics = compareMetrics ? compareMetrics[0] : null;

  // Find the selected model for display
  const selectedModel = models.find((m) => m.id === selectedModelId);

  // Build per-player delta table (join on player_id)
  const playerDeltaRows: PlayerDelta[] = (() => {
    if (!comparePlayers) return [];
    const compareMap = new Map(comparePlayers.map((p) => [p.player_id, p]));
    const rows: PlayerDelta[] = [];
    for (const p of players) {
      const c = compareMap.get(p.player_id);
      if (!c) continue;
      const delta = c.projected_ppg - p.projected_ppg;
      rows.push({
        player_id: p.player_id,
        name: p.name,
        position: p.position,
        nfl_team: p.nfl_team,
        proj_a: p.projected_ppg,
        proj_b: c.projected_ppg,
        delta,
        abs_delta: Math.abs(delta),
      });
    }
    rows.sort((a, b) => b.abs_delta - a.abs_delta);
    return rows;
  })();

  const isCompareMode = !!compareModelId && !!comparePlayers && !!compareOverallMetrics;

  // Models available for the compare dropdown (exclude primary)
  const compareOptions = models.filter((m) => m.id !== selectedModelId);

  return (
    <div className="space-y-8">
      {/* Season tabs + Model selector */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          {availableSeasons.map((season) => (
            <button
              key={season}
              onClick={() => {
                const params = new URLSearchParams();
                params.set("season", String(season));
                if (selectedModelId) params.set("model", selectedModelId);
                router.push(`/projection-accuracy?${params.toString()}`);
              }}
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

        {models.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <label
              htmlFor="model-select"
              className="text-sm font-medium text-slate-600 dark:text-slate-300"
            >
              Model:
            </label>
            <select
              id="model-select"
              value={selectedModelId || ""}
              onChange={(e) => handleModelChange(e.target.value)}
              className="text-sm border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            >
              <option value="">Default (Legacy)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.is_active ? " (active)" : ""}
                  {m.is_baseline ? " (baseline)" : ""}
                </option>
              ))}
            </select>

            {/* Compare toggle — only when a primary model is selected */}
            {selectedModelId && !isCompareMode && !showCompareDropdown && (
              <button
                onClick={() => setShowCompareDropdown(true)}
                className="text-sm px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                + Compare
              </button>
            )}

            {/* Compare model dropdown */}
            {selectedModelId && (showCompareDropdown || isCompareMode) && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="compare-select"
                  className="text-sm font-medium text-slate-600 dark:text-slate-300"
                >
                  vs:
                </label>
                <select
                  id="compare-select"
                  value={compareModelId || ""}
                  onChange={(e) => handleCompareChange(e.target.value)}
                  className="text-sm border border-purple-300 dark:border-purple-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="">Select compare model…</option>
                  {compareOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.is_active ? " (active)" : ""}
                      {m.is_baseline ? " (baseline)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleClearCompare}
                  className="text-sm px-2 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Remove comparison"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Model info banners */}
      {isCompareMode ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {selectedModel && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
              <div className="font-medium text-blue-900 dark:text-blue-100">
                Model A: {selectedModel.name} v{selectedModel.version}
              </div>
              {selectedModel.description && (
                <p className="text-blue-700 dark:text-blue-300 mt-1">
                  {selectedModel.description}
                </p>
              )}
            </div>
          )}
          {compareModel && (
            <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4 text-sm">
              <div className="font-medium text-purple-900 dark:text-purple-100">
                Model B: {compareModel.name} v{compareModel.version}
              </div>
              {compareModel.description && (
                <p className="text-purple-700 dark:text-purple-300 mt-1">
                  {compareModel.description}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        selectedModel && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
            <div className="font-medium text-blue-900 dark:text-blue-100">
              {selectedModel.name} v{selectedModel.version}
            </div>
            {selectedModel.description && (
              <p className="text-blue-700 dark:text-blue-300 mt-1">
                {selectedModel.description}
              </p>
            )}
            <div className="text-blue-600 dark:text-blue-400 mt-1">
              Features: {selectedModel.features.join(", ")}
            </div>
          </div>
        )
      )}

      {/* Summary cards — side-by-side in compare mode */}
      {isCompareMode && compareOverallMetrics ? (
        <div className="space-y-3">
          {/* Model A row */}
          <div>
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2">
              Model A — {selectedModel?.name}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <SummaryCard label="Players Backtested" value={String(overallMetrics.count)} />
              <SummaryCard label="MAE" value={overallMetrics.mae.toFixed(2)} />
              <SummaryCard
                label="Bias"
                value={(overallMetrics.bias >= 0 ? "+" : "") + overallMetrics.bias.toFixed(2)}
                variant={Math.abs(overallMetrics.bias) < 0.2 ? "default" : overallMetrics.bias > 0 ? "positive" : "negative"}
              />
              <SummaryCard
                label="R²"
                value={overallMetrics.r2.toFixed(2)}
                variant={overallMetrics.r2 >= 0.5 ? "positive" : overallMetrics.r2 >= 0.25 ? "default" : "negative"}
              />
              <SummaryCard label="RMSE" value={overallMetrics.rmse.toFixed(2)} />
            </div>
          </div>

          {/* Model B row */}
          <div>
            <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-2">
              Model B — {compareModel?.name}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <SummaryCard label="Players Backtested" value={String(compareOverallMetrics.count)} />
              <SummaryCard label="MAE" value={compareOverallMetrics.mae.toFixed(2)} />
              <SummaryCard
                label="Bias"
                value={(compareOverallMetrics.bias >= 0 ? "+" : "") + compareOverallMetrics.bias.toFixed(2)}
                variant={Math.abs(compareOverallMetrics.bias) < 0.2 ? "default" : compareOverallMetrics.bias > 0 ? "positive" : "negative"}
              />
              <SummaryCard
                label="R²"
                value={compareOverallMetrics.r2.toFixed(2)}
                variant={compareOverallMetrics.r2 >= 0.5 ? "positive" : compareOverallMetrics.r2 >= 0.25 ? "default" : "negative"}
              />
              <SummaryCard label="RMSE" value={compareOverallMetrics.rmse.toFixed(2)} />
            </div>
          </div>

          {/* Delta row (B − A) */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Delta (B − A) — ↓ better for MAE/RMSE/Bias, ↑ better for R²
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <SummaryCard label="—" value="—" />
              {(() => {
                const maeDelta = formatDeltaMetric(compareOverallMetrics.mae - overallMetrics.mae, false);
                return <SummaryCard label="MAE Δ" value={maeDelta.label} variant={maeDelta.variant} />;
              })()}
              {(() => {
                const biasDelta = formatDeltaMetric(Math.abs(compareOverallMetrics.bias) - Math.abs(overallMetrics.bias), false);
                return <SummaryCard label="|Bias| Δ" value={biasDelta.label} variant={biasDelta.variant} />;
              })()}
              {(() => {
                const r2Delta = formatDeltaMetric(compareOverallMetrics.r2 - overallMetrics.r2, true);
                return <SummaryCard label="R² Δ" value={r2Delta.label} variant={r2Delta.variant} />;
              })()}
              {(() => {
                const rmseDelta = formatDeltaMetric(compareOverallMetrics.rmse - overallMetrics.rmse, false);
                return <SummaryCard label="RMSE Δ" value={rmseDelta.label} variant={rmseDelta.variant} />;
              })()}
            </div>
          </div>
        </div>
      ) : (
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
      )}

      {/* Per-position breakdown */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
          Metrics by Position
        </h2>
        {isCompareMode && compareMetrics ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2">
                Model A — {selectedModel?.name}
              </p>
              <DataTable columns={METRICS_COLUMNS} data={allMetrics} />
            </div>
            <div>
              <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-2">
                Model B — {compareModel?.name}
              </p>
              <DataTable columns={METRICS_COLUMNS} data={compareMetrics} />
            </div>
          </div>
        ) : (
          <DataTable columns={METRICS_COLUMNS} data={allMetrics} />
        )}
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
          comparePlayers={comparePlayers ?? undefined}
          compareModelName={compareModel?.name}
          primaryModelName={selectedModel?.name}
        />
      </section>

      {/* Per-player delta table — compare mode only */}
      {isCompareMode && playerDeltaRows.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            Per-Player Projection Delta
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Delta = Model B projected PPG − Model A projected PPG. Sorted by absolute delta descending.
            Rows highlighted where |Delta| ≥ 1.0 PPG.
          </p>
          <DataTable
            columns={DELTA_COLUMNS}
            data={playerDeltaRows as unknown as TableRow[]}
            highlightRules={[
              {
                key: "abs_delta",
                op: "gte",
                value: 1.0,
                className: "bg-amber-50 dark:bg-amber-950",
              },
            ]}
          />
        </section>
      )}

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
          data={filteredPlayers as unknown as TableRow[]}
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

      {/* Rookie breakdown — only show for legacy mode */}
      {!selectedModelId && rookiePlayers.length > 0 && (
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
            data={filteredRookies as unknown as TableRow[]}
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
