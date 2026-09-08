"use client";

import Link from "next/link";
import { teamHref } from "@/lib/teams";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import PositionBadge from "@/components/PositionBadge";
import {
  LINEUP_SLOTS,
  SLOT_IDS,
  emptyLineup,
  optimizeLineup,
  lineupTotal,
  getMetricScore,
  hasWeeklyData,
  isEligible,
  type Lineup,
  type LineupMetric,
  type LineupPlayer,
  type SlotId,
} from "@/lib/lineup";
import type { LineupTeam } from "./page";
import PageShell from "@/components/PageShell";

interface Props {
  teams: LineupTeam[];
  hasProjections: boolean;
  defaultTeam: string | null;
  season: number | null;
  /** The NFL week being scored, or null when no weekly data is stored. */
  week: number | null;
  weeks: number[];
  hasWeekly: boolean;
  viewerTeam: string | null;
}

const fmt = (n: number) => n.toFixed(1);

/**
 * A player's score for a slot, or a dash when the week has no row for them.
 *
 * A gap means "no forecast this week" — a bye, an inactive player, or someone
 * the source does not carry. It is deliberately NOT labelled "BYE": in week 1
 * nobody is on bye, yet plenty of deep-bench players have no projection, and
 * claiming otherwise would be wrong.
 */
function scoreLabel(p: LineupPlayer, metric: LineupMetric): string {
  if (metric === "weekly" && !hasWeeklyData(p)) return "—";
  return fmt(getMetricScore(p, metric));
}

export default function LineupClient({
  teams,
  hasProjections,
  defaultTeam,
  season,
  week,
  weeks,
  hasWeekly,
  viewerTeam,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [teamName, setTeamName] = useState<string>(
    defaultTeam ?? teams[0]?.team_name ?? ""
  );
  // This page exists to set THIS week's lineup, so the per-game forecast is the
  // default whenever the selected week actually has one. The season-long
  // metrics stay available for offseason planning.
  const [metric, setMetric] = useState<LineupMetric>(
    hasWeekly ? "weekly" : hasProjections ? "projected" : "last_season"
  );

  /** Week lives in the URL so a lineup can be linked to and shared. */
  const changeWeek = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("week", String(next));
    if (teamName) params.set("team", teamName);
    router.push(`/lineup?${params.toString()}`);
  };
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

  const metricLabel =
    metric === "weekly"
      ? `Week ${week} projected points`
      : metric === "projected"
        ? "Projected PPG"
        : "2025 PPG";

  return (
    <PageShell>
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Lineup Planner
          </h1>
          <p className="text-ink-subtle mt-2">
            {hasWeekly ? (
              <>
                Build a starting lineup for{" "}
                <strong className="text-ink-muted">
                  {season} Week {week}
                </strong>{" "}
                and see the projected total. Weekly points are a third
                party&apos;s forecast for that single game; the season-long
                options score by average instead.
              </>
            ) : (
              <>
                Build a starting lineup from any team&apos;s current roster and see
                the projected total. Scores are per-game — using each player&apos;s{" "}
                {hasProjections ? "projected PPG or " : ""}actual PPG from last
                season.
              </>
            )}
          </p>
          {/* The lineup page linked nowhere; the weekly loop needs a way back
              to the matchup and out to the team being planned. */}
          {metric === "weekly" && (
            <p className="mt-1 text-xs text-ink-subtle">
              A dash means no forecast for this week — a bye, an inactive player, or
              one the source does not carry.
            </p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {teamName && (
              <Link href={teamHref(teamName)} className="text-accent hover:underline">
                {teamName}&apos;s roster &amp; cap →
              </Link>
            )}
            {viewerTeam && (
              <Link
                href={week != null ? `/matchup?week=${week}` : "/matchup"}
                className="text-accent hover:underline"
              >
                Your matchup →
              </Link>
            )}
            <Link href="/scoreboard" className="text-accent hover:underline">
              Scoreboard →
            </Link>
          </p>
        </header>

        {/* Controls */}
        <div className="bg-sunken rounded-lg p-5 border border-line flex flex-wrap items-end gap-6">
          {weeks.length > 0 && week != null && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="week-select"
                className="text-sm font-medium text-ink-muted"
              >
                Week
              </label>
              <select
                id="week-select"
                value={week}
                onChange={(e) => changeWeek(Number(e.target.value))}
                className="rounded-md border border-line-strong bg-raised px-3 py-2 text-sm text-ink"
              >
                {weeks.map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label
              htmlFor="team-select"
              className="text-sm font-medium text-ink-muted"
            >
              Team
            </label>
            <select
              id="team-select"
              value={teamName}
              onChange={(e) => changeTeam(e.target.value)}
              className="rounded-md border border-line-strong bg-raised px-3 py-2 text-sm text-ink"
            >
              {teams.map((t) => (
                <option key={t.team_name} value={t.team_name}>
                  {t.team_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink-muted">
              Score by
            </span>
            <div className="inline-flex rounded-md border border-line-strong overflow-hidden">
              {hasWeekly && (
                <button
                  type="button"
                  onClick={() => setMetric("weekly")}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    metric === "weekly"
                      ? "bg-blue-600 text-white"
                      : "bg-raised text-ink-muted hover:bg-sunken"
                  }`}
                >
                  Week {week}
                </button>
              )}
              <button
                type="button"
                onClick={() => hasProjections && setMetric("projected")}
                disabled={!hasProjections}
                title={
                  hasProjections
                    ? undefined
                    : "Projections require an account with projections access"
                }
                className={`px-3 py-2 text-sm font-medium transition-colors ${hasWeekly ? "border-l border-line-strong" : ""} ${
                  metric === "projected"
                    ? "bg-blue-600 text-white"
                    : "bg-raised text-ink-muted hover:bg-sunken"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Projected PPG
              </button>
              <button
                type="button"
                onClick={() => setMetric("last_season")}
                className={`px-3 py-2 text-sm font-medium transition-colors border-l border-line-strong ${
                  metric === "last_season"
                    ? "bg-blue-600 text-white"
                    : "bg-raised text-ink-muted hover:bg-sunken"
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
              className="px-4 py-2 text-sm font-medium rounded-md border border-line-strong text-ink-muted hover:bg-sunken transition-colors"
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
          <h2 className="text-lg font-semibold text-ink mb-3">
            Starting Lineup
          </h2>
          <div className="divide-y divide-line border border-line rounded-lg overflow-hidden">
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
                  className="flex items-center gap-3 px-4 py-2.5 bg-raised"
                >
                  <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                    {slot.label}
                  </span>
                  <select
                    value={selectedId ?? ""}
                    onChange={(e) =>
                      assign(slot.id, e.target.value || null)
                    }
                    className="flex-1 min-w-0 rounded-md border border-line-strong bg-raised px-2 py-1.5 text-sm text-ink"
                  >
                    <option value="">— empty —</option>
                    {options.map((p) => (
                      <option key={p.player_id} value={p.player_id}>
                        {p.name} ({p.position}, {p.nfl_team}
                        {metric === "weekly" && p.weekly_opponent
                          ? ` ${p.weekly_opponent}`
                          : ""}
                        ) · {scoreLabel(p, metric)}
                      </option>
                    ))}
                  </select>
                  <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                    {selected ? scoreLabel(selected, metric) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bench */}
        <section>
          <h2 className="text-lg font-semibold text-ink mb-3">
            Bench{" "}
            <span className="text-sm font-normal text-ink-subtle">
              ({bench.length})
            </span>
          </h2>
          {bench.length === 0 ? (
            <p className="text-sm text-ink-subtle">
              No players available.
            </p>
          ) : (
            <div className="border border-line rounded-lg overflow-hidden divide-y divide-line">
              {bench.map((p) => (
                <div
                  key={p.player_id}
                  className="flex items-center gap-3 px-4 py-2 bg-raised text-sm"
                >
                  <PositionBadge position={p.position} size="sm" />
                  <span className="flex-1 min-w-0 truncate text-ink">
                    {p.name}
                  </span>
                  <span className="text-ink-subtle text-xs">
                    {p.nfl_team}
                    {metric === "weekly" && p.weekly_opponent
                      ? ` ${p.weekly_opponent}`
                      : ""}
                  </span>
                  <span
                    className={`w-14 text-right tabular-nums font-medium ${
                      metric === "weekly" && !hasWeeklyData(p)
                        ? "text-ink-subtle"
                        : "text-ink-muted"
                    }`}
                  >
                    {scoreLabel(p, metric)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
    </PageShell>
  );
}
