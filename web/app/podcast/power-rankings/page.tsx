import { requirePodcaster } from "@/lib/auth";
import PageShell, { PageHeader } from "@/components/PageShell";
import {
  fetchBallots,
  fetchPowerRankingContext,
  fetchPrepNotes,
  submittedOnly,
} from "@/lib/power-rankings";
import { fetchTeamWeekSnapshots } from "@/lib/team-snapshot";
import BallotEditor from "./BallotEditor";

export const metadata = {
  title: "Power Rankings Ballot | Ottoneu Analytics",
  description: "Rank the league ahead of this week",
};

// A ballot is per-account and changes as it is edited.
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function PowerRankingBallotPage({ searchParams }: Props) {
  const { week: weekParam } = await searchParams;
  const user = await requirePodcaster("/podcast/power-rankings");

  const requested = weekParam ? Number.parseInt(weekParam, 10) : undefined;
  const ctx = await fetchPowerRankingContext(
    Number.isFinite(requested) ? requested : undefined,
  );

  // The snapshots cost a roster reconstruction, which is the same work
  // /lineup does — but this page is `revalidate = 0`, so it is paid on every
  // load rather than hourly. Worth it: the projected total and the lineup
  // behind it are what the ordering is being argued from, and a ballot that
  // arrives without them is a list of names.
  const [ballots, prepNotes, snapshots] = await Promise.all([
    fetchBallots(ctx.season, ctx.week),
    fetchPrepNotes(ctx.season, ctx.week, user.userId),
    fetchTeamWeekSnapshots(ctx.week, ctx.teams, !!user.hasProjectionsAccess),
  ]);
  const mine = ballots.find((b) => b.userId === user.userId) ?? null;
  const others = ballots.filter((b) => b.userId !== user.userId);

  // A saved draft resumes where it left off; a fresh ballot opens in standings
  // order, which is the ordering a host argues *with* rather than a blank list.
  const savedOrder = mine
    ? [...mine.entries].sort((a, b) => a.rank - b.rank).map((e) => e.teamName)
    : [];
  const missing = ctx.teams.filter((t) => !savedOrder.includes(t));
  const initialOrder = savedOrder.length > 0 ? [...savedOrder, ...missing] : ctx.teams;
  const initialNotes: Record<string, string> = {};
  for (const entry of mine?.entries ?? []) {
    if (entry.note) initialNotes[entry.teamName] = entry.note;
  }

  return (
    <PageShell gap="loose">
      <PageHeader
        eyebrow="Podcast"
        title={`Week ${ctx.week} power rankings`}
        description="Your ballot, private until you lock it in. Rank all twelve, best at the top. Hover a team for their optimal lineup this week."
        links={[
          { href: `/podcast/power-rankings/reveal?week=${ctx.week}`, label: "Reveal screen" },
          { href: "/podcast", label: "Podcast tools" },
        ]}
      />

      <BallotEditor
        season={ctx.season}
        week={ctx.week}
        weeks={ctx.weeks}
        teams={ctx.teams}
        records={ctx.records}
        snapshots={snapshots.byTeam}
        snapshotsAvailable={snapshots.available}
        initialOrder={initialOrder}
        initialNotes={initialNotes}
        initialPrepNotes={prepNotes}
        initiallySubmitted={mine?.submittedAt != null}
        otherHosts={others.map((b) => ({
          displayName: b.displayName,
          submitted: b.submittedAt != null,
        }))}
        submittedCount={submittedOnly(ballots).length}
      />
    </PageShell>
  );
}
