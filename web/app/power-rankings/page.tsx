import Link from "next/link";
import { Eye, Vote } from "lucide-react";
import { getLiveAccessState } from "@/lib/auth";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import RankMovement from "@/components/RankMovement";
import { fetchPowerRankingContext } from "@/lib/power-rankings";
import {
  fetchCommunityRankings,
  fetchPublicationStatuses,
  formatLeagueTime,
  listenerVotingOpen,
  type CommunityRow,
} from "@/lib/community-rankings";
import WeekPicker from "./WeekPicker";

export const metadata = {
  title: "Power Rankings | Ottoneu Analytics",
  description: "The league's community power rankings, voted on by listeners and the podcast hosts",
};

// Publication happens on a clock (Thursday morning), and hosts see previews.
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ week?: string }>;
}

/** A mean rank to one decimal, or a dash when that group cast no ballot. */
function avg(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

function RankingRow({ row, record }: { row: CommunityRow; record?: string }) {
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <span className="w-8 shrink-0 text-right text-2xl font-black tabular-nums text-ink">
        {row.rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-ink">{row.teamName}</span>
          {row.movement !== null && <RankMovement movement={row.movement} />}
          {record && <span className="text-xs text-ink-subtle">{record}</span>}
        </div>
        <p className="mt-0.5 text-xs text-ink-subtle">
          Hosts {avg(row.hostMeanRank)} · Listeners {avg(row.listenerMeanRank)} · range{" "}
          {row.bestRank}–{row.worstRank}
          {row.firstPlaceVotes > 0 &&
            ` · ${row.firstPlaceVotes} first-place vote${row.firstPlaceVotes === 1 ? "" : "s"}`}
        </p>
      </div>
      <span
        className="shrink-0 text-right font-mono text-sm tabular-nums text-ink-muted"
        title="Average rank across every locked-in ballot"
      >
        {row.meanRank.toFixed(2)}
      </span>
    </li>
  );
}

/**
 * The community power rankings — every locked-in ballot, hosts and listeners.
 *
 * Public, but a week only appears once it is published: automatically on
 * Thursday morning, or earlier/later by a host's hand from `/podcast`. Hosts
 * can open an unpublished week here as a preview, clearly labelled, which is
 * how they check it before publishing. Nothing on the page is per-voter — see
 * `CommunityRow`.
 */
export default async function CommunityRankingsPage({ searchParams }: Props) {
  const { week: weekParam } = await searchParams;
  const [live, ctx] = await Promise.all([getLiveAccessState(), fetchPowerRankingContext()]);
  const isHost = !!live?.isPodcaster;

  const statuses = await fetchPublicationStatuses(ctx.season, ctx.weeks);
  const viewable = ctx.weeks.filter((w) => isHost || statuses[w].isPublic);
  const publicWeeks = ctx.weeks.filter((w) => statuses[w].isPublic);

  const requested = weekParam ? Number.parseInt(weekParam, 10) : NaN;
  const week = viewable.includes(requested)
    ? requested
    : (publicWeeks[publicWeeks.length - 1] ?? (isHost ? ctx.week : null));

  const currentStatus = statuses[ctx.week];
  const votingOpen = listenerVotingOpen(ctx.week, ctx.week, currentStatus);

  const voteBanner = votingOpen && (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent bg-accent-soft p-4">
      <p className="text-sm text-ink">
        <strong>Week {ctx.week} voting is open</strong>
        {currentStatus.publicAt
          ? ` until ${formatLeagueTime(currentStatus.publicAt)}.`
          : " until the hosts publish the rankings."}
      </p>
      {isHost ? (
        <Link
          href={`/podcast/power-rankings?week=${ctx.week}`}
          className="text-sm font-medium text-accent hover:underline"
        >
          Your podcast ballot counts here
        </Link>
      ) : (
        <Link
          href={
            live
              ? "/power-rankings/vote"
              : `/login?redirect=${encodeURIComponent("/power-rankings/vote")}`
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Vote size={15} aria-hidden="true" />
          {live ? "Cast your ballot" : "Sign in to vote"}
        </Link>
      )}
    </div>
  );

  if (week === null) {
    return (
      <PageShell gap="loose">
        <PageHeader eyebrow="League" title="Power rankings" />
        {voteBanner}
        <EmptyState title="No rankings published yet this season">
          Each week&apos;s community rankings go public on Thursday morning.
        </EmptyState>
      </PageShell>
    );
  }

  const rankings = await fetchCommunityRankings(ctx.season, week, ctx.teams);
  const status = statuses[week];
  const ballots = rankings.hostBallots + rankings.listenerBallots;

  return (
    <PageShell gap="loose">
      <PageHeader
        eyebrow="League"
        title={`Week ${week} power rankings`}
        description={`Every locked-in ballot averaged together — ${rankings.hostBallots} from the hosts, ${rankings.listenerBallots} from listeners. Ties go to the team someone ranked higher.`}
      />

      {voteBanner}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <WeekPicker
          week={week}
          weeks={viewable.map((w) => ({ week: w, preview: !statuses[w].isPublic }))}
        />
        {!status.isPublic && (
          <p className="inline-flex items-center gap-1.5 rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            <Eye size={13} aria-hidden="true" />
            Host preview — not public
            {status.mode === "held"
              ? " (held)"
              : status.publicAt
                ? ` until ${formatLeagueTime(status.publicAt)}`
                : ""}
            .{" "}
            <Link href="/podcast" className="underline">
              Publishing controls
            </Link>
          </p>
        )}
      </div>

      {ballots === 0 ? (
        <EmptyState title={`No locked-in ballots for Week ${week}`}>
          The rankings fill in as hosts and listeners lock their ballots in.
        </EmptyState>
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-raised">
          {rankings.rows.map((row) => (
            <RankingRow key={row.teamName} row={row} record={ctx.records[row.teamName]?.record} />
          ))}
        </ol>
      )}

      {rankings.unranked.length > 0 && ballots > 0 && (
        <p className="text-sm text-ink-subtle">
          Not on any ballot: {rankings.unranked.join(", ")}.
        </p>
      )}
    </PageShell>
  );
}
