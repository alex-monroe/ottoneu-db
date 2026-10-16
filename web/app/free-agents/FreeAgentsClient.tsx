"use client";

import { useMemo, useState } from "react";
import PositionBadge from "@/components/PositionBadge";
import PlayerName from "@/components/PlayerName";
import PositionFilter from "@/components/PositionFilter";
import { POSITIONS, type Position } from "@/lib/types";
import type { LineupMetric, LineupPlayer } from "@/lib/lineup";
import {
  BENCH_FLOOR,
  classifyFreeAgents,
  type UpgradeVerdict,
} from "@/lib/free-agent-upgrades";

export interface FreeAgentRow {
  player_id: string;
  ottoneu_id?: number;
  name: string;
  position: string;
  nfl_team: string;
  team_name: string | null;
  price: number;
  dollar_value: number;
  ppg: number;
  games_played: number;
  projected_ppg: number | null;
  weekly_points: number | null;
  weekly_opponent: string | null;
}

type SortKey = "dollar_value" | "projected_ppg" | "weekly_points" | "ppg";

interface Props {
  freeAgents: FreeAgentRow[];
  /** The viewer's own roster, for the "worse than my starter" comparison. */
  myPlayers: FreeAgentRow[];
  viewerTeam: string | null;
  week: number | null;
}

const SORT_LABELS: Record<SortKey, string> = {
  dollar_value: "Value",
  projected_ppg: "Proj PPG",
  weekly_points: "Week pts",
  ppg: "Last PPG",
};

function num(v: number | null): number {
  return v ?? -Infinity;
}

/**
 * The lineup metric an upgrade is judged on. Dollar value is not a points
 * figure, so sorting by it judges upgrades on the season-long model.
 */
const METRIC_FOR_SORT: Record<SortKey, LineupMetric> = {
  dollar_value: "projected",
  projected_ppg: "projected",
  weekly_points: "weekly",
  ppg: "last_season",
};

const METRIC_LABELS: Record<LineupMetric, string> = {
  projected: "Proj PPG",
  weekly: "week points",
  last_season: "last season's PPG",
};

function toLineupPlayer(p: FreeAgentRow): LineupPlayer {
  return {
    player_id: p.player_id,
    name: p.name,
    position: p.position,
    nfl_team: p.nfl_team,
    ottoneu_id: p.ottoneu_id,
    ppg: p.ppg,
    projected_ppg: p.projected_ppg ?? 0,
    weekly_points: p.weekly_points,
    weekly_opponent: p.weekly_opponent,
  };
}

function verdictTitle(v: UpgradeVerdict, metric: LineupMetric): string {
  const by = METRIC_LABELS[metric];
  if (v.kind === "bench") {
    return v.over
      ? `Better than ${v.over.name}, your best backup at this position, by ${v.gain.toFixed(1)} ${by} — and close to starter quality`
      : `Close to starter quality by ${by}, and you hold no backup at this position`;
  }
  const over = v.over ? ` in place of ${v.over.name}` : "";
  return v.kind === "bye_fill"
    ? `Starts${over}, who has no game this week (+${v.gain.toFixed(1)} lineup points)`
    : `Makes your best lineup${over} (+${v.gain.toFixed(1)} ${by})`;
}

const BADGE: Record<UpgradeVerdict["kind"], { label: string; cls: string; row: string }> = {
  starter: {
    label: "starter",
    cls: "text-positive",
    row: "bg-emerald-50/60 dark:bg-emerald-950/20",
  },
  bye_fill: {
    label: "bye fill",
    cls: "text-amber-700 dark:text-amber-400",
    row: "bg-amber-50/60 dark:bg-amber-950/20",
  },
  bench: { label: "top bench", cls: "text-accent", row: "" },
};

export default function FreeAgentsClient({
  freeAgents,
  myPlayers,
  viewerTeam,
  week,
}: Props) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>(
    week != null ? "weekly_points" : "dollar_value",
  );
  const [compare, setCompare] = useState(true);
  const [upgradesOnly, setUpgradesOnly] = useState(false);
  const metric = METRIC_FOR_SORT[sortKey];

  /**
   * Judged against the viewer's optimal starting lineup, not the weakest body
   * at the position — dynasty benches are full of stashes and handcuffs that
   * every waiver-wire RB "beats" this week. See lib/free-agent-upgrades.ts.
   * Computed over the whole wire so a deep sleeper is found even when he is
   * outside the top 100 by the sort.
   */
  const verdicts = useMemo(() => {
    if (!compare || !viewerTeam) return new Map<string, UpgradeVerdict>();
    return classifyFreeAgents(
      myPlayers.map(toLineupPlayer),
      freeAgents.map(toLineupPlayer),
      metric,
    );
  }, [myPlayers, freeAgents, compare, viewerTeam, metric]);

  const showingUpgradesOnly = upgradesOnly && compare && viewerTeam != null;

  const rows = useMemo(() => {
    const filtered = freeAgents.filter(
      (p) =>
        (!positions.length || positions.includes(p.position as Position)) &&
        (!showingUpgradesOnly || verdicts.has(p.player_id)),
    );
    return [...filtered]
      .sort((a, b) => num(b[sortKey]) - num(a[sortKey]))
      .slice(0, 100);
  }, [freeAgents, positions, sortKey, showingUpgradesOnly, verdicts]);

  /** The headline: who on the wire would start for the viewer right now. */
  const starters = useMemo(
    () =>
      freeAgents
        .flatMap((p) => {
          const v = verdicts.get(p.player_id);
          return v && v.kind !== "bench" ? [{ p, v }] : [];
        })
        .sort((a, b) => b.v.gain - a.v.gain),
    [freeAgents, verdicts],
  );
  const benchCount = verdicts.size - starters.length;

  const fmt = (v: number | null, digits = 1) =>
    v == null ? "—" : v.toFixed(digits);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-line bg-sunken p-4">
        <PositionFilter
          positions={POSITIONS}
          selectedPositions={positions}
          onToggle={(pos) =>
            setPositions((cur) =>
              cur.includes(pos) ? cur.filter((p) => p !== pos) : [...cur, pos],
            )
          }
          showAll
          onToggleAll={() => setPositions([])}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="fa-sort" className="text-sm font-medium text-ink-muted">
            Sort by
          </label>
          <select
            id="fa-sort"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-md border border-line-strong bg-raised px-3 py-2 text-sm text-ink"
          >
            {(Object.keys(SORT_LABELS) as SortKey[])
              .filter((k) => k !== "weekly_points" || week != null)
              .map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
          </select>
        </div>

        {viewerTeam && (
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
              className="h-4 w-4 rounded border-line-strong"
            />
            Mark upgrades on {viewerTeam}
          </label>
        )}

        {viewerTeam && compare && (
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={upgradesOnly}
              onChange={(e) => setUpgradesOnly(e.target.checked)}
              className="h-4 w-4 rounded border-line-strong"
            />
            Upgrades only
          </label>
        )}
      </div>

      {viewerTeam && compare && (
        <div className="rounded-lg border border-line p-4 text-sm">
          {starters.length === 0 ? (
            <p className="text-ink-muted">
              Nobody on the wire would make {viewerTeam}&apos;s starting lineup by{" "}
              {METRIC_LABELS[metric]}.
              {benchCount > 0 &&
                ` ${benchCount} would be your best backup at their position.`}
            </p>
          ) : (
            <>
              <p className="font-medium text-ink">
                {starters.length === 1
                  ? "1 free agent would"
                  : `${starters.length} free agents would`}{" "}
                start for {viewerTeam} by {METRIC_LABELS[metric]}
                {benchCount > 0 && (
                  <span className="font-normal text-ink-muted">
                    {" "}
                    · {benchCount} more would be your best backup
                  </span>
                )}
              </p>
              <ul className="mt-2 space-y-1">
                {starters.slice(0, 5).map(({ p, v }) => (
                  <li key={p.player_id} className="flex flex-wrap items-center gap-x-2">
                    <PositionBadge position={p.position} size="sm" />
                    <PlayerName name={p.name} ottoneuId={p.ottoneu_id} />
                    <span className="tabular-nums text-positive">
                      +{v.gain.toFixed(1)}
                    </span>
                    <span className="text-ink-subtle">
                      {v.over ? `over ${v.over.name}` : "fills an empty slot"}
                      {v.kind === "bye_fill" ? " (on bye)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-ink-subtle">
          {showingUpgradesOnly
            ? "No free agents at those positions would start or be your top backup."
            : "No free agents match that filter."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="bg-sunken">
              <tr>
                <Th>Player</Th>
                <Th>Pos</Th>
                <Th>NFL</Th>
                {week != null && <Th right>Wk {week}</Th>}
                <Th right>Proj PPG</Th>
                <Th right>Last PPG</Th>
                <Th right>Value</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const v = verdicts.get(p.player_id);
                const badge = v ? BADGE[v.kind] : null;
                return (
                  <tr
                    key={p.player_id}
                    className={`border-t border-line ${badge?.row ?? ""}`}
                  >
                    <td className="px-3 py-2 text-sm">
                      <PlayerName name={p.name} ottoneuId={p.ottoneu_id} />
                      {v && badge && (
                        <span
                          className={`ml-2 text-[11px] font-semibold uppercase ${badge.cls}`}
                          title={verdictTitle(v, metric)}
                        >
                          {badge.label}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <PositionBadge position={p.position} size="sm" />
                    </td>
                    <td className="px-3 py-2 text-sm text-ink-subtle">
                      {p.nfl_team}
                      {p.weekly_opponent ? ` ${p.weekly_opponent}` : ""}
                    </td>
                    {week != null && (
                      <td className="px-3 py-2 text-right text-sm tabular-nums text-ink">
                        {p.weekly_points == null ? (
                          <span
                            className="text-ink-subtle"
                            title="No forecast this week — bye, inactive, or not carried by the source"
                          >
                            —
                          </span>
                        ) : (
                          fmt(p.weekly_points)
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-ink-muted">
                      {fmt(p.projected_ppg, 2)}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-ink-muted">
                      {fmt(p.ppg, 2)}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums font-medium text-ink">
                      ${p.dollar_value}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-subtle">
        Showing the top {rows.length} by {SORT_LABELS[sortKey]}. Week points are a
        third party&apos;s single-game forecast; Proj PPG is this site&apos;s
        season-long model. A dash means no forecast this week — a bye, an inactive
        player, or one the source does not carry.
        {viewerTeam && compare && (
          <>
            {" "}
            <strong>Starter</strong> means he would make your best Superflex
            lineup by {METRIC_LABELS[metric]}; <strong>bye fill</strong> means only
            because a starter is off this week; <strong>top bench</strong> means he
            beats every backup you hold at his position and projects at least{" "}
            {Math.round(BENCH_FLOOR * 100)}% of your weakest starter there. Stashes
            and handcuffs on your bench are not the bar.
          </>
        )}
      </p>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
