import Link from "next/link";
import { fetchPlayerSet, listStatWindowSeasons } from "@/lib/data";
import { buildHoverDataMap, fetchHoverExtras } from "@/lib/analysis";
import { rankByPosition } from "@/lib/positional-rank";
import { getAuthenticatedUser } from "@/lib/auth";
import { POSITIONS, type Position } from "@/lib/types";
import PageShell from "@/components/PageShell";
import Tabs from "@/components/Tabs";
import StatWindowNote from "@/components/StatWindowNote";
import StatWindowPicker from "@/components/StatWindowPicker";
import { EmptyState } from "@/components/states";
import RankingsTable, { type RankingRow } from "./RankingsTable";

export const revalidate = 3600;

export const metadata = {
  title: "Positional Rankings | Ottoneu Analytics",
  description: "Where every player finishes at his position — QB1, RB12, WR24 — by total points.",
};

interface Props {
  searchParams: Promise<{ pos?: string; season?: string }>;
}

/**
 * Positional rankings — every player's finish at his position (web/lib/positional-rank.ts).
 *
 * Public: a finish is a fact about the season, not one of the gated
 * valuations. Ranks are computed from the same rows the table shows, for the
 * season the picker names, so the badge and the points beside it always agree.
 */
export default async function RankingsPage({ searchParams }: Props) {
  const { pos, season } = await searchParams;

  const seasons = await listStatWindowSeasons();
  const requested = Number(season);
  const chosen = seasons.includes(requested) ? requested : seasons[0];

  const [{ players, window }, user] = await Promise.all([
    fetchPlayerSet(chosen),
    getAuthenticatedUser(),
  ]);
  const ranks = rankByPosition(players, window.season);

  const { projMap, dsMap, rankMap } = await fetchHoverExtras(!!user?.hasProjectionsAccess);
  const hoverDataMap = buildHoverDataMap(
    players,
    projMap,
    dsMap,
    !!user?.hasProjectionsAccess,
    rankMap,
  );

  const rowsByPosition = new Map<Position, RankingRow[]>(POSITIONS.map((p) => [p, []]));
  for (const p of players) {
    const r = ranks.get(p.player_id);
    if (!r) continue;
    rowsByPosition.get(r.position)!.push({
      player_id: p.player_id,
      ottoneu_id: p.ottoneu_id,
      name: p.name,
      nfl_team: p.nfl_team,
      team_name: p.team_name,
      price: p.price,
      rank: r.rank,
      positional_rank: r,
      games_played: p.games_played,
      total_points: p.total_points,
      ppg: p.ppg,
    });
  }
  for (const rows of rowsByPosition.values()) rows.sort((a, b) => a.rank - b.rank);

  const labels: Record<number, string> = Object.fromEntries(
    seasons.map((s) => [s, s === window.season ? window.shortLabel : String(s)]),
  );

  return (
    <PageShell width="wide">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Positional Rankings — {window.label}
          </h1>
          <p className="mt-2 max-w-prose text-ink-subtle">
            Where every player finishes at his position, by total points. Only
            players who have played are ranked. Sort by PPG to see the rate
            instead of the running total.
          </p>
          <p className="mt-2 text-sm">
            <Link href="/players" className="text-accent hover:underline">
              Player directory →
            </Link>
          </p>
        </div>
        {seasons.length > 1 && (
          <StatWindowPicker seasons={seasons} current={window.season} labels={labels} />
        )}
      </header>

      <StatWindowNote window={window} what="ranks" />

      {ranks.size === 0 ? (
        <EmptyState title="No one has played yet">
          Rankings fill in once the stats import has a week of {window.season} football in it.
        </EmptyState>
      ) : (
        <Tabs
          paramKey="pos"
          activeId={pos?.toUpperCase()}
          tabs={POSITIONS.map((p) => ({
            id: p,
            label: `${p} (${rowsByPosition.get(p)!.length})`,
            content: <RankingsTable rows={rowsByPosition.get(p)!} hoverDataMap={hoverDataMap} />,
          }))}
        />
      )}
    </PageShell>
  );
}
