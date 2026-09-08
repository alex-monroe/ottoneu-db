import { requirePodcaster } from "@/lib/auth";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import Link from "next/link";
import {
  fetchPowerRankingContext,
  fetchWeekRankings,
  biggestDisagreement,
} from "@/lib/power-rankings";
import RevealClient from "./RevealClient";

export const metadata = {
  title: "Power Rankings Reveal | Ottoneu Analytics",
  description: "The consolidated countdown, revealed one slot at a time",
};

// The consolidated order changes the moment a host locks their ballot in.
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function PowerRankingRevealPage({ searchParams }: Props) {
  const { week: weekParam } = await searchParams;
  await requirePodcaster("/podcast/power-rankings/reveal");

  const requested = weekParam ? Number.parseInt(weekParam, 10) : undefined;
  const ctx = await fetchPowerRankingContext(
    Number.isFinite(requested) ? requested : undefined,
  );
  const rankings = await fetchWeekRankings(ctx.season, ctx.week, ctx.teams);

  if (rankings.rows.length === 0) {
    return (
      <PageShell gap="loose">
        <PageHeader
          eyebrow="Podcast"
          title={`Week ${ctx.week} reveal`}
          links={[
            { href: `/podcast/power-rankings?week=${ctx.week}`, label: "Your ballot" },
            { href: "/podcast", label: "Podcast tools" },
          ]}
        />
        <EmptyState title="No locked ballots for this week yet">
          A ballot only counts once it is locked in — that is what keeps the two of you
          from seeing each other&apos;s order early.{" "}
          <Link
            href={`/podcast/power-rankings?week=${ctx.week}`}
            className="text-accent hover:underline"
          >
            Open your ballot
          </Link>
          .
        </EmptyState>
      </PageShell>
    );
  }

  return (
    <PageShell width="wide" gap="loose">
      <PageHeader
        eyebrow="Podcast"
        title={`Week ${ctx.week} power rankings`}
        description={`Consolidated from ${rankings.voters.length} ballot${
          rankings.voters.length === 1 ? "" : "s"
        } by mean rank. Reveal runs from ${rankings.rows.length} up to 1.`}
        links={[
          { href: `/podcast/power-rankings?week=${ctx.week}`, label: "Your ballot" },
          { href: "/podcast", label: "Podcast tools" },
        ]}
      />

      <RevealClient
        week={ctx.week}
        weeks={ctx.weeks}
        rows={rankings.rows}
        voters={rankings.voters}
        records={ctx.records}
        unranked={rankings.unranked}
        split={biggestDisagreement(rankings.rows)}
      />
    </PageShell>
  );
}
