"use client";

import { useMemo, useState } from "react";
import PositionBadge from "@/components/PositionBadge";
import PlayerName from "@/components/PlayerName";
import PositionFilter from "@/components/PositionFilter";
import { POSITIONS, type Position } from "@/lib/types";

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

  const rows = useMemo(() => {
    const filtered = positions.length
      ? freeAgents.filter((p) => positions.includes(p.position as Position))
      : freeAgents;
    return [...filtered]
      .sort((a, b) => num(b[sortKey]) - num(a[sortKey]))
      .slice(0, 100);
  }, [freeAgents, positions, sortKey]);

  /**
   * The weakest player the viewer starts at each position, by the active sort.
   * This is what makes the page answer the actual question — "is anyone on the
   * wire better than what I'm starting" — rather than just listing names.
   */
  const myBar = useMemo(() => {
    const bar = new Map<string, FreeAgentRow>();
    if (!compare || !viewerTeam) return bar;
    for (const p of myPlayers) {
      const held = bar.get(p.position);
      if (!held || num(p[sortKey]) < num(held[sortKey])) bar.set(p.position, p);
    }
    return bar;
  }, [myPlayers, compare, viewerTeam, sortKey]);

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
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-subtle">
          No free agents match that filter.
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
                const bar = myBar.get(p.position);
                // An "upgrade" beats the weakest player the viewer holds at
                // that position, on whatever metric is being sorted by.
                const upgrade =
                  bar != null && num(p[sortKey]) > num(bar[sortKey]);
                return (
                  <tr
                    key={p.player_id}
                    className={`border-t border-line ${
                      upgrade ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-sm">
                      <PlayerName name={p.name} ottoneuId={p.ottoneu_id} />
                      {upgrade && bar && (
                        <span
                          className="ml-2 text-[11px] font-semibold uppercase text-positive"
                          title={`Ahead of ${bar.name}, your weakest ${p.position} by ${SORT_LABELS[sortKey]}`}
                        >
                          upgrade
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
