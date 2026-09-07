import { requirePodcaster } from "@/lib/auth";
import PageShell, { PageHeader } from "@/components/PageShell";
import {
  fetchBallots,
  fetchPowerRankingContext,
  submittedOnly,
} from "@/lib/power-rankings";
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

  const ballots = await fetchBallots(ctx.season, ctx.week);
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
        description="Your ballot, private until you lock it in. Rank all twelve, best at the top."
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
        initialOrder={initialOrder}
        initialNotes={initialNotes}
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
