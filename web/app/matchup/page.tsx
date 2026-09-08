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
import PlayerName from "@/components/PlayerName";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import PositionBadge from "@/components/PositionBadge";

export const revalidate = 3600;

export const metadata = {
  title: "Your Matchup | Ottoneu Analytics",
  description: "Your projected lineup against this week's opponent.",
};

interface Props {
  searchParams: Promise<{ week?: string }>;
}

/**
 * This page used to carry its own `Shell` and its own `Empty` — an h1 plus a
 * paragraph — which is precisely the hand-rolled state Phase 5 shipped
 * `components/states.tsx` to replace, in a file from the same batch.
 */
function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <PageShell width="narrow">
      <PageHeader title="Your Matchup" />
      <EmptyState title={title}>{children}</EmptyState>
    </PageShell>
  );
}

/** One filled (or empty) lineup slot on one side of the matchup. */
function Side({
  player,
  metric,
  align,
}: {
  player: LineupPlayer | null;
  metric: LineupMetric;
  align: "left" | "right";
}) {
  if (!player) {
    return (
      <span className={`block text-sm text-ink-subtle ${align === "right" ? "text-right" : ""}`}>
        empty
      </span>
    );
  }
  const missing = metric === "weekly" && !hasWeeklyData(player);
  const score = missing ? null : getMetricScore(player, metric);
  return (
    <span
      className={`flex min-w-0 items-center gap-2 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      <PositionBadge position={player.position} size="sm" />
      <span className="min-w-0 flex-1">
        {/* These were plain spans. Every other surface in the app makes a
            player name clickable; there is no reason this one shouldn't. */}
        <PlayerName name={player.name} ottoneuId={player.ottoneu_id} />
        <span className="block text-xs text-ink-subtle">
          {player.weekly_opponent ?? player.nfl_team}
        </span>
      </span>
      <span className="shrink-0 tabular-nums font-medium text-ink-muted">
        {score == null ? "—" : score.toFixed(1)}
      </span>
    </span>
  );
}

/**
 * The two lineups, slot against slot.
 *
 * They used to be two `md:grid-cols-2` cards, which stack below 768px — so on a
 * phone, comparing your RB2 to theirs became a scroll-and-remember exercise,
 * which is the entire job of the page. Interleaving by slot survives the narrow
 * viewport and is better at every width, because it puts the per-slot margin
 * where the eye already is. The page previously gave only a total and left the
 * reader to work out which slots produced it.
 */
function SlotComparison({
  mine,
  theirs,
  myName,
  theirName,
  metric,
}: {
  mine: LineupPlayer[];
  theirs: LineupPlayer[];
  myName: string;
  theirName: string;
  metric: LineupMetric;
}) {
  const myLineup = optimizeLineup(mine, metric);
  const theirLineup = optimizeLineup(theirs, metric);
  const myById = new Map(mine.map((p) => [p.player_id, p]));
  const theirById = new Map(theirs.map((p) => [p.player_id, p]));

  const score = (p: LineupPlayer | null) =>
    p && !(metric === "weekly" && !hasWeeklyData(p)) ? getMetricScore(p, metric) : 0;

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 bg-sunken px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle sm:gap-x-4">
        <span className="truncate">{myName}</span>
        <span className="text-center">Slot</span>
        <span className="truncate text-right">{theirName}</span>
      </div>
      <ul className="divide-y divide-line">
        {LINEUP_SLOTS.map((slot) => {
          const mp = myLineup[slot.id] ? myById.get(myLineup[slot.id]!) ?? null : null;
          const tp = theirLineup[slot.id] ? theirById.get(theirLineup[slot.id]!) ?? null : null;
          const delta = score(mp) - score(tp);
          return (
            <li
              key={slot.id}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 bg-raised px-3 py-2 text-sm sm:gap-x-4"
            >
              <Side player={mp} metric={metric} align="left" />
              <span className="flex w-16 shrink-0 flex-col items-center">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                  {slot.label}
                </span>
                <span
                  className={`tabular-nums text-xs font-semibold ${
                    Math.abs(delta) < 0.05
                      ? "text-ink-subtle"
                      : delta > 0
                        ? "text-positive"
                        : "text-negative"
                  }`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(1)}
                </span>
              </span>
              <Side player={tp} metric={metric} align="right" />
            </li>
          );
        })}
      </ul>
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
        <Link href="/access" className="text-accent hover:underline">
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
        <Link href="/scoreboard" className="text-accent hover:underline">
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
    <PageShell>
      <PageHeader
        eyebrow={`Week ${ctx.week}`}
        title={
          <>
            <TeamName name={viewerTeam} mine /> vs <TeamName name={game.opponent} />
          </>
        }
        description={
          <>
            Both sides at their optimal lineup, scored by {metricLabel}. This is a
            ceiling, not a prediction — it assumes each manager starts their best
            nine.
          </>
        }
        links={[
          {
            href: `/lineup?week=${ctx.week}&team=${encodeURIComponent(viewerTeam)}`,
            label: "Edit your lineup",
          },
          { href: teamHref(game.opponent), label: `${game.opponent}'s roster` },
          { href: "/scoreboard", label: "Scoreboard" },
        ]}
      />

      {/* Projected margin, and the real score once it exists */}
      <div className="rounded-lg border border-line bg-raised px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-ink-muted">
            Projected margin
          </span>
          <span
            className={`text-3xl font-bold tabular-nums ${
              margin >= 0 ? "text-positive" : "text-negative"
            }`}
          >
            {margin >= 0 ? "+" : ""}
            {margin.toFixed(1)}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-subtle tabular-nums">
          {myTotal.toFixed(1)} – {theirTotal.toFixed(1)}
        </p>
        {/* Ottoneu's export reads 0.00 for both sides before kickoff, so a
            scheduled game must not print a score — the same rule ScoreboardCard
            follows. */}
        {game.status !== "scheduled" &&
          game.score != null &&
          game.opponentScore != null && (
            <p className="mt-2 text-sm text-ink-muted">
              Actual so far: {game.score.toFixed(2)} – {game.opponentScore.toFixed(2)}
              {game.statusLabel ? ` (${game.statusLabel})` : ""}
            </p>
          )}
      </div>

      {mine && theirs ? (
        <SlotComparison
          mine={mine.players}
          theirs={theirs.players}
          myName={mine.team_name}
          theirName={theirs.team_name}
          metric={metric}
        />
      ) : (
        <EmptyState title={`No current roster found for ${game.opponent}`}>
          The roster scrape has not picked this team up yet, so there is nothing
          to compare against.
        </EmptyState>
      )}
    </PageShell>
  );
}
