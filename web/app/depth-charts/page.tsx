import Link from "next/link";
import {
  fetchAvailableDepthChartSeasons,
  fetchDepthChartsForSeason,
  type DepthChartEntry,
} from "@/lib/depth-charts";
import { DIVISIONS, TEAM_NAME_BY_CODE } from "@/lib/nfl-divisions";
import SeasonSelector from "./SeasonSelector";

export const revalidate = 3600;

const POSITION_ORDER = ["QB", "RB", "WR", "TE"] as const;

// Team display order = the canonical division ordering, flattened.
const TEAM_ORDER: string[] = DIVISIONS.flatMap((d) => d.teams.map((t) => t.code));

interface Props {
  searchParams: Promise<{ season?: string }>;
}

function formatPpg(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

export default async function DepthChartsPage({ searchParams }: Props) {
  const params = await searchParams;
  const seasons = await fetchAvailableDepthChartSeasons();

  if (seasons.length === 0) {
    return (
      <main className="min-h-screen bg-white dark:bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Depth Charts
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-4">
            No data available. Run{" "}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs">
              just backfill-depth-charts
            </code>{" "}
            to populate the <code>depth_charts</code> table.
          </p>
        </div>
      </main>
    );
  }

  const requested = Number(params.season);
  const targetSeason = seasons.includes(requested) ? requested : seasons[0];

  const entries = await fetchDepthChartsForSeason(targetSeason);

  // Group by team.
  const byTeam = new Map<string, DepthChartEntry[]>();
  for (const e of entries) {
    const list = byTeam.get(e.team) ?? [];
    list.push(e);
    byTeam.set(e.team, list);
  }

  const orderedTeams = Array.from(byTeam.keys()).sort((a, b) => {
    const ai = TEAM_ORDER.indexOf(a);
    const bi = TEAM_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Depth Charts — {targetSeason}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
              Opening-day NFL depth tier per offensive skill player, from
              nflverse. Powers the{" "}
              <code className="ml-0.5">depth_chart_position_raw</code> and{" "}
              <code>role_change_raw</code> projection features — see{" "}
              <Link href="/projections" className="underline">/projections</Link>{" "}
              for the active model. Arrows mark a change in tier vs the prior
              season.
            </p>
          </div>
          <SeasonSelector currentSeason={targetSeason} seasons={seasons} />
        </header>

        <Legend />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orderedTeams.map((team) => (
            <TeamCard key={team} team={team} entries={byTeam.get(team) ?? []} />
          ))}
        </div>
      </div>
    </main>
  );
}

function Legend() {
  return (
    <section className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
      <span className="flex items-center gap-1.5">
        <TierBadge depth={1} /> Starter
      </span>
      <span className="flex items-center gap-1.5">
        <TierBadge depth={2} /> Backup
      </span>
      <span className="flex items-center gap-1.5">
        <TierBadge depth={3} /> Deep reserve
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-emerald-600 dark:text-emerald-400 font-bold">↑</span>{" "}
        Promoted vs prior season
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-rose-600 dark:text-rose-400 font-bold">↓</span>{" "}
        Demoted vs prior season
      </span>
      <span className="ml-auto">PPG = active-model projection</span>
    </section>
  );
}

function TierBadge({ depth }: { depth: number }) {
  const styles =
    depth === 1
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : depth === 2
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${styles}`}
    >
      {depth}
    </span>
  );
}

function RoleChange({ entry }: { entry: DepthChartEntry }) {
  if (entry.prev_depth_team === null) return null;
  const delta = entry.prev_depth_team - entry.depth_team;
  if (delta === 0) return null;
  return delta > 0 ? (
    <span
      className="text-emerald-600 dark:text-emerald-400 font-bold"
      title={`Promoted from tier ${entry.prev_depth_team}`}
    >
      ↑
    </span>
  ) : (
    <span
      className="text-rose-600 dark:text-rose-400 font-bold"
      title={`Demoted from tier ${entry.prev_depth_team}`}
    >
      ↓
    </span>
  );
}

function TeamCard({ team, entries }: { team: string; entries: DepthChartEntry[] }) {
  const byPosition = new Map<string, DepthChartEntry[]>();
  for (const e of entries) {
    const list = byPosition.get(e.position) ?? [];
    list.push(e);
    byPosition.set(e.position, list);
  }
  for (const list of byPosition.values()) {
    list.sort(
      (a, b) =>
        a.depth_team - b.depth_team ||
        (b.projected_ppg ?? -Infinity) - (a.projected_ppg ?? -Infinity) ||
        a.name.localeCompare(b.name),
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          {TEAM_NAME_BY_CODE[team] ?? team}
          <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
            {team}
          </span>
        </h2>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-900">
        {POSITION_ORDER.filter((pos) => byPosition.has(pos)).map((pos) => (
          <div key={pos} className="px-4 py-2">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
              {pos}
            </div>
            <ul className="space-y-0.5">
              {(byPosition.get(pos) ?? []).map((e) => (
                <li
                  key={e.player_id}
                  className="flex items-center gap-2 text-sm"
                >
                  <TierBadge depth={e.depth_team} />
                  <Link
                    href={`/players/${e.player_id}`}
                    className="flex-1 truncate text-slate-900 dark:text-white hover:underline"
                  >
                    {e.name}
                  </Link>
                  <RoleChange entry={e} />
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatPpg(e.projected_ppg)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
