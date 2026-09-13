import Link from "next/link";
import { getLiveAccessState } from "@/lib/auth";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import { fetchOwnBallot, fetchPowerRankingContext } from "@/lib/power-rankings";
import {
  fetchPublicationStatus,
  formatLeagueTime,
  listenerVotingOpen,
} from "@/lib/community-rankings";
import { fetchTeamWeekSnapshots } from "@/lib/team-snapshot";
import ListenerBallot from "./ListenerBallot";

export const metadata = {
  title: "Vote: Power Rankings | Ottoneu Analytics",
  description: "Cast your ballot for this week's community power rankings",
};

// Per-account, and voting closes on a clock.
export const revalidate = 0;

/**
 * A listener's ballot for the community power ranking.
 *
 * Signed-in accounts that are not podcast hosts. Not gated in middleware: a
 * signed-out visitor gets a sign-in prompt that explains what they would be
 * signing in *for*, and a host gets pointed at their podcast ballot — which
 * already counts here — rather than a second ballot that would pull theirs out
 * of the reveal.
 */
export default async function ListenerVotePage() {
  const live = await getLiveAccessState();
  const header = (description?: string) => (
    <PageHeader
      eyebrow="Power rankings"
      title="Cast your ballot"
      description={description}
      links={[{ href: "/power-rankings", label: "Community rankings" }]}
    />
  );

  if (!live) {
    return (
      <PageShell width="narrow">
        {header("Rank the league ahead of the week. Every locked-in ballot counts towards the community power rankings.")}
        <Link
          href={`/login?redirect=${encodeURIComponent("/power-rankings/vote")}`}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Sign in to vote
        </Link>
      </PageShell>
    );
  }

  const ctx = await fetchPowerRankingContext();

  if (live.isPodcaster) {
    return (
      <PageShell width="narrow">
        {header()}
        <EmptyState title="Hosts vote on the podcast ballot">
          Your locked-in podcast ballot already counts towards the community rankings, alongside
          every listener&apos;s.{" "}
          <Link
            href={`/podcast/power-rankings?week=${ctx.week}`}
            className="text-accent hover:underline"
          >
            Open your Week {ctx.week} ballot
          </Link>
          .
        </EmptyState>
      </PageShell>
    );
  }

  const status = await fetchPublicationStatus(ctx.season, ctx.week);
  if (!listenerVotingOpen(ctx.week, ctx.week, status)) {
    return (
      <PageShell width="narrow">
        {header()}
        <EmptyState title={`Voting for Week ${ctx.week} is closed`}>
          The Week {ctx.week} rankings are already public.{" "}
          <Link href={`/power-rankings?week=${ctx.week}`} className="text-accent hover:underline">
            See how everyone voted
          </Link>
          . Voting for the next week opens on Tuesday.
        </EmptyState>
      </PageShell>
    );
  }

  const [mine, snapshots] = await Promise.all([
    fetchOwnBallot(ctx.season, ctx.week, live.userId),
    fetchTeamWeekSnapshots(ctx.week, ctx.teams, live.hasProjectionsAccess),
  ]);

  const savedOrder = (mine?.entries ?? []).map((e) => e.teamName);
  const missing = ctx.teams.filter((t) => !savedOrder.includes(t));
  const initialOrder = savedOrder.length > 0 ? [...savedOrder, ...missing] : ctx.teams;

  return (
    <PageShell gap="loose">
      <PageHeader
        eyebrow="Power rankings"
        title={`Your Week ${ctx.week} ballot`}
        description="Rank every team, best at the top. Locked-in ballots from listeners and the hosts are averaged into the community rankings. Hover a team for their optimal lineup this week."
        links={[{ href: "/power-rankings", label: "Community rankings" }]}
      />
      <ListenerBallot
        season={ctx.season}
        week={ctx.week}
        teams={ctx.teams}
        records={ctx.records}
        snapshots={snapshots.byTeam}
        snapshotsAvailable={snapshots.available}
        initialOrder={initialOrder}
        initiallySubmitted={mine?.submittedAt != null}
        closesLabel={status.publicAt ? formatLeagueTime(status.publicAt) : null}
      />
    </PageShell>
  );
}
