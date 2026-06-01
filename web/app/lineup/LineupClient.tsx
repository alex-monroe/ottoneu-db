"use client";

import { useMemo, useState } from "react";
import PositionBadge from "@/components/PositionBadge";
import {
  LINEUP_SLOTS,
  SLOT_IDS,
  emptyLineup,
  optimizeLineup,
  lineupTotal,
  getMetricScore,
  isEligible,
  type Lineup,
  type LineupMetric,
  type LineupPlayer,
  type SlotId,
} from "@/lib/lineup";
import type { LineupTeam } from "./page";

interface Props {
  teams: LineupTeam[];
  hasProjections: boolean;
  defaultTeam: string | null;
}

const fmt = (n: number) => n.toFixed(1);

export default function LineupClient({ teams, hasProjections, defaultTeam }: Props) {
  const [teamName, setTeamName] = useState<string>(
    defaultTeam ?? teams[0]?.team_name ?? ""
  );
  const [metric, setMetric] = useState<LineupMetric>(
    hasProjections ? "projected" : "last_season"
  );
  const [lineup, setLineup] = useState<Lineup>(emptyLineup());

  const team = useMemo(
    () => teams.find((t) => t.team_name === teamName) ?? null,
    [teams, teamName]
  );

  const playerMap = useMemo(() => {
    const m = new Map<string, LineupPlayer>();
    for (const p of team?.players ?? []) m.set(p.player_id, p);
    return m;
  }, [team]);

  // Switching team or metric resets the lineup so we never reference a player
  // who is not on the selected roster.
  const changeTeam = (name: string) => {
    setTeamName(name);
    setLineup(emptyLineup());
  };

  const optimize = () => {
    if (team) setLineup(optimizeLineup(team.players, metric));
  };
  const clear = () => setLineup(emptyLineup());

  // Set a slot's player, removing that player from any other slot it occupies.
  const assign = (slotId: SlotId, playerId: string | null) => {
    setLineup((prev) => {
      const next = { ...prev };
      if (playerId) {
        for (const id of SLOT_IDS) {
          if (next[id] === playerId) next[id] = null;
        }
      }
      next[slotId] = playerId;
      return next;
    });
  };

  const total = useMemo(
    () => lineupTotal(lineup, playerMap, metric),
    [lineup, playerMap, metric]
  );

  const starterIds = useMemo(
    () => new Set(SLOT_IDS.map((id) => lineup[id]).filter(Boolean) as string[]),
    [lineup]
  );

  const bench = useMemo(
    () =>
      (team?.players ?? [])
        .filter((p) => !starterIds.has(p.player_id))
        .sort((a, b) => getMetricScore(b, metric) - getMetricScore(a, metric)),
    [team, starterIds, metric]
  );

  const metricLabel = metric === "projected" ? "Projected PPG" : "2025 PPG";

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Lineup Planner
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Build a starting lineup from any team&apos;s current roster and see
            the projected total. Scores are per-game — using each player&apos;s{" "}
            {hasProjections ? "projected PPG or " : ""}actual PPG from last
            season.
          </p>
        </header>

        {/* Controls */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800 flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="team-select"
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Team
            </label>
            <select
              id="team-select"
              value={teamName}
              onChange={(e) => changeTeam(e.target.value)}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white"
            >
              {teams.map((t) => (
                <option key={t.team_name} value={t.team_name}>
                  {t.team_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Score by
            </span>
            <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-700 overflow-hidden">
              <button
                type="button"
                onClick={() => hasProjections && setMetric("projected")}
                disabled={!hasProjections}
                title={
                  hasProjections
                    ? undefined
                    : "Projections require an account with projections access"
                }
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  metric === "projected"
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Projected PPG
              </button>
              <button
                type="button"
                onClick={() => setMetric("last_season")}
                className={`px-3 py-2 text-sm font-medium transition-colors border-l border-slate-300 dark:border-slate-700 ${
                  metric === "last_season"
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                }`}
              >
                2025 PPG
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={optimize}
              className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Optimize
            </button>
            <button
              type="button"
              onClick={clear}
              className="px-4 py-2 text-sm font-medium rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Total */}
        <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-5 py-4 flex items-baseline justify-between">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
            Projected lineup total ({metricLabel})
          </span>
          <span className="text-3xl font-bold tabular-nums text-blue-700 dark:text-blue-300">
            {fmt(total)}
          </span>
        </div>

        {/* Starting lineup */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
            Starting Lineup
          </h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            {LINEUP_SLOTS.map((slot) => {
              const selectedId = lineup[slot.id];
              const selected = selectedId ? playerMap.get(selectedId) : null;
              const options = (team?.players ?? [])
                .filter((p) => isEligible(slot, p.position))
                .filter(
                  (p) =>
                    p.player_id === selectedId ||
                    !starterIds.has(p.player_id)
                )
                .sort(
                  (a, b) => getMetricScore(b, metric) - getMetricScore(a, metric)
                );
              return (
                <div
                  key={slot.id}
                  className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-950"
                >
                  <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {slot.label}
                  </span>
                  <select
                    value={selectedId ?? ""}
                    onChange={(e) =>
                      assign(slot.id, e.target.value || null)
                    }
                    className="flex-1 min-w-0 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="">— empty —</option>
                    {options.map((p) => (
                      <option key={p.player_id} value={p.player_id}>
                        {p.name} ({p.position}, {p.nfl_team}) ·{" "}
                        {fmt(getMetricScore(p, metric))}
                      </option>
                    ))}
                  </select>
                  <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                    {selected ? fmt(getMetricScore(selected, metric)) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bench */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
            Bench{" "}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
              ({bench.length})
            </span>
          </h2>
          {bench.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No players available.
            </p>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
              {bench.map((p) => (
                <div
                  key={p.player_id}
                  className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-slate-950 text-sm"
                >
                  <PositionBadge position={p.position} size="sm" />
                  <span className="flex-1 min-w-0 truncate text-slate-900 dark:text-white">
                    {p.name}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">
                    {p.nfl_team}
                  </span>
                  <span className="w-14 text-right tabular-nums font-medium text-slate-700 dark:text-slate-300">
                    {fmt(getMetricScore(p, metric))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
