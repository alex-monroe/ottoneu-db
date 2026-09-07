import Link from "next/link";
import { getViewerTeam } from "@/lib/viewer-team";
import { getAuthenticatedUser } from "@/lib/auth";
import { fetchLineupWeek } from "@/lib/lineup-data";
import { fetchLeagueStatus } from "@/lib/matchups";
import { sameTeamName, teamHref, toTeamGame } from "@/lib/teams";
import {
  LINEUP_SLOTS,
  optimizeLineup,
  lineupTotal,
  getMetricScore,
  hasWeeklyData,
  type LineupMetric,
  type LineupPlayer,
} from "@/lib/lineup";
import TeamName from "@/components/TeamName";
import PositionBadge from "@/components/PositionBadge";

export const revalidate = 3600;

export const metadata = {
  title: "Your Matchup | Ottoneu Analytics",
  description: "Your projected lineup against this week's opponent.",
};

interface Props {
  searchParams: Promise<{ week?: string }>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="mx-auto max-w-5xl space-y-6">{children}</div>
    </main>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
        {title}
      </h1>
      <p className="max-w-prose text-slate-500 dark:text-slate-400">{children}</p>
    </Shell>
  );
}

/** One side's optimal lineup, slot by slot. */
function LineupColumn({
  teamName,
  players,
  metric,
  total,
  isMine,
}: {
  teamName: string;
  players: LineupPlayer[];
  metric: LineupMetric;
  total: number;
  isMine: boolean;
}) {
  const lineup = optimizeLineup(players, metric);
  const byId = new Map(players.map((p) => [p.player_id, p]));

  return (
    <div
      className={`rounded-lg border p-4 ${
        isMine
          ? "border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20"
          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
      }`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900 dark:text-white">
          <TeamName name={teamName} mine={isMine} />
        </h2>
        <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
          {total.toFixed(1)}
        </span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
        {LINEUP_SLOTS.map((slot) => {
          const pid = lineup[slot.id];
          const p = pid ? byId.get(pid) : null;
          return (
            <div key={slot.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {slot.label}
              </span>
              {p ? (
                <>
                  <PositionBadge position={p.position} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-slate-900 dark:text-white">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    {p.weekly_opponent ?? p.nfl_team}
                  </span>
                  <span
                    className={`w-12 shrink-0 text-right tabular-nums font-medium ${
                      metric === "weekly" && !hasWeeklyData(p)
                        ? "text-slate-400 dark:text-slate-600"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {metric === "weekly" && !hasWeeklyData(p)
                      ? "—"
                      : getMetricScore(p, metric).toFixed(1)}
                  </span>
                </>
              ) : (
                <span className="flex-1 text-slate-400 dark:text-slate-600">— empty —</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function MatchupPage({ searchParams }: Props) {
  const [params, user, viewerTeam] = await Promise.all([
    searchParams,
    getAuthenticatedUser(),
    getViewerTeam(),
  ]);

  if (!viewerTeam) {
    return (
      <Empty title="Your Matchup">
        This page shows your lineup against your opponent&apos;s, so it needs to know
        which team is yours. Your account isn&apos;t linked to one yet — an admin can
        link it, and you can check on the{" "}
        <Link href="/access" className="text-blue-600 dark:text-blue-400 hover:underline">
          access page
        </Link>
        .
      </Empty>
    );
  }

  const requested = Number(params.week);
  const [ctx, status] = await Promise.all([
    fetchLineupWeek(
      Number.isInteger(requested) ? requested : undefined,
      !!user?.hasProjectionsAccess,
    ),
    fetchLeagueStatus(),
  ]);

  // The fantasy week the lineup is scored for is the one we look up a game for.
  const game =
    ctx.week != null
      ? (status?.matchups ?? [])
          .map((m) => toTeamGame(m, viewerTeam))
          .find((g) => g !== null && g.week === ctx.week) ?? null
      : null;

  if (!game) {
    return (
      <Empty title="Your Matchup">
        No {ctx.season ?? ""} game found for {viewerTeam}
        {ctx.week != null ? ` in week ${ctx.week}` : ""}. The schedule is scraped
        from Ottoneu — once it is posted this page fills in.{" "}
        <Link href="/scoreboard" className="text-blue-600 dark:text-blue-400 hover:underline">
          Scoreboard
        </Link>
      </Empty>
    );
  }

  const metric: LineupMetric = ctx.hasWeekly
    ? "weekly"
    : user?.hasProjectionsAccess
      ? "projected"
      : "last_season";

  const mine = ctx.teams.find((t) => sameTeamName(t.team_name, viewerTeam));
  const theirs = ctx.teams.find((t) => sameTeamName(t.team_name, game.opponent));

  const myTotal = mine
    ? lineupTotal(
        optimizeLineup(mine.players, metric),
        new Map(mine.players.map((p) => [p.player_id, p])),
        metric,
      )
    : 0;
  const theirTotal = theirs
    ? lineupTotal(
        optimizeLineup(theirs.players, metric),
        new Map(theirs.players.map((p) => [p.player_id, p])),
        metric,
      )
    : 0;
  const margin = myTotal - theirTotal;

  const metricLabel =
    metric === "weekly"
      ? `Week ${ctx.week} projected points`
      : metric === "projected"
        ? "projected PPG"
        : "last season's PPG";

  return (
    <Shell>
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Week {ctx.week} · {viewerTeam} vs {game.opponent}
        </h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Both sides at their optimal lineup, scored by {metricLabel}. This is a
          ceiling, not a prediction — it assumes each manager starts their best nine.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link
            href={`/lineup?week=${ctx.week}&team=${encodeURIComponent(viewerTeam)}`}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit your lineup →
          </Link>
          <Link href={teamHref(game.opponent)} className="text-blue-600 dark:text-blue-400 hover:underline">
            {game.opponent}&apos;s roster →
          </Link>
          <Link href="/scoreboard" className="text-blue-600 dark:text-blue-400 hover:underline">
            Scoreboard →
          </Link>
        </p>
      </header>

      {/* Projected margin, and the real score once it exists */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
            Projected margin
          </span>
          <span
            className={`text-3xl font-bold tabular-nums ${
              margin >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {margin >= 0 ? "+" : ""}
            {margin.toFixed(1)}
          </span>
        </div>
        {/* Ottoneu's export reads 0.00 for both sides before kickoff, so a
            scheduled game must not print a score — the same rule ScoreboardCard
            follows. */}
        {game.status !== "scheduled" &&
          game.score != null &&
          game.opponentScore != null && (
          <p className="mt-2 text-sm text-blue-900/80 dark:text-blue-200/80">
            Actual so far: {game.score.toFixed(2)} – {game.opponentScore.toFixed(2)}
            {game.statusLabel ? ` (${game.statusLabel})` : ""}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {mine && (
          <LineupColumn
            teamName={mine.team_name}
            players={mine.players}
            metric={metric}
            total={myTotal}
            isMine
          />
        )}
        {theirs ? (
          <LineupColumn
            teamName={theirs.team_name}
            players={theirs.players}
            metric={metric}
            total={theirTotal}
            isMine={false}
          />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No current roster found for {game.opponent}.
          </p>
        )}
      </div>
    </Shell>
  );
}
