import Link from "next/link";
import { Mic, ListOrdered, Play, Lock, Users } from "lucide-react";
import { getAuthenticatedUser, getLiveAccessState } from "@/lib/auth";
import { isValidRedirect } from "@/lib/utils";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import {
  fetchBallots,
  fetchPowerRankingContext,
  submittedOnly,
} from "@/lib/power-rankings";
import {
  countListenerBallots,
  fetchPublicationStatus,
  formatLeagueTime,
} from "@/lib/community-rankings";
import SessionSync from "./SessionSync";
import PublicationControls from "./PublicationControls";

export const metadata = {
  title: "Podcast | Ottoneu Analytics",
  description: "Production tools for the league podcast",
};

// Per-account, and the ballot status changes as the hosts submit.
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ from?: string }>;
}

/**
 * The podcast hub — and, deliberately, the one page under /podcast that is not
 * gated on `is_podcaster`.
 *
 * Every gated podcast route redirects here, so it has to answer three different
 * visitors: someone signed out, someone signed in who is not a host, and a host
 * whose session cookie simply predates their grant. The third case is why this
 * page exists rather than a bounce to "/" — see SessionSync.
 */
export default async function PodcastHub({ searchParams }: Props) {
  const { from } = await searchParams;
  const returnTo = isValidRedirect(from) ? (from as string) : null;

  const [session, live] = await Promise.all([
    getAuthenticatedUser(),
    getLiveAccessState(),
  ]);

  if (!live) {
    return (
      <PageShell width="narrow">
        <PageHeader
          eyebrow="Podcast"
          title="Sign in to continue"
          description="The podcast production tools are for the show's hosts."
        />
        <Link
          href={`/login?redirect=${encodeURIComponent(returnTo ?? "/podcast")}`}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Sign in
        </Link>
      </PageShell>
    );
  }

  if (!live.isPodcaster) {
    return (
      <PageShell width="narrow">
        <PageHeader
          eyebrow="Podcast"
          title="Hosts only"
          description="These are production tools for the league's podcast, not part of the league site."
        />
        <div className="rounded-lg border border-dashed border-line-strong bg-raised p-6">
          <span className="inline-flex rounded-md bg-sunken p-2 text-ink-subtle">
            <Lock size={18} aria-hidden="true" />
          </span>
          <h2 className="mt-3 text-base font-semibold text-ink">
            This account isn&apos;t marked as a host
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-ink-subtle">
            You&apos;re signed in as <strong>{live.email}</strong>. An admin can turn on
            the podcaster role from the user list — it&apos;s separate from projections
            access, so nothing else about your account changes.{" "}
            <Link href="/" className="text-accent hover:underline">
              Back to the league
            </Link>
            .
          </p>
        </div>
      </PageShell>
    );
  }

  // Host, but the cookie middleware reads still says otherwise. Fix it and send
  // them on to wherever they were trying to go.
  if (!session?.isPodcaster) {
    return (
      <PageShell width="narrow">
        <PageHeader eyebrow="Podcast" title="Podcast tools" />
        <SessionSync returnTo={returnTo} />
      </PageShell>
    );
  }

  const ctx = await fetchPowerRankingContext();
  const [ballots, listeners, publication] = await Promise.all([
    fetchBallots(ctx.season, ctx.week),
    countListenerBallots(ctx.season, ctx.week),
    fetchPublicationStatus(ctx.season, ctx.week),
  ]);
  const submitted = submittedOnly(ballots);
  const mine = ballots.find((b) => b.userId === live.userId) ?? null;

  return (
    <PageShell gap="loose">
      <PageHeader
        eyebrow="Podcast"
        title="Production tools"
        description="Everything here is for making the show. Nobody outside the hosts can see it — except the community rankings, once you publish them."
      />

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href={`/podcast/power-rankings?week=${ctx.week}`}
          className="group rounded-lg border border-line bg-raised p-5 transition-colors hover:border-accent"
        >
          <span className="inline-flex rounded-md bg-accent-soft p-2 text-accent">
            <ListOrdered size={18} aria-hidden="true" />
          </span>
          <h2 className="mt-3 font-semibold text-ink">Your Week {ctx.week} ballot</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {mine?.submittedAt
              ? "Locked in. You can still reopen and change it before you record."
              : mine
                ? "Saved as a draft — lock it in when you're happy with it."
                : "Rank all twelve teams. The other host can't see it until you lock it in."}
          </p>
        </Link>

        <Link
          href={`/podcast/power-rankings/reveal?week=${ctx.week}`}
          className="group rounded-lg border border-line bg-raised p-5 transition-colors hover:border-accent"
        >
          <span className="inline-flex rounded-md bg-accent-soft p-2 text-accent">
            <Play size={18} aria-hidden="true" />
          </span>
          <h2 className="mt-3 font-semibold text-ink">Reveal Week {ctx.week}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            The consolidated countdown, twelfth to first, one click at a time. Open this
            one while you&apos;re recording.
          </p>
        </Link>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink">Week {ctx.week} ballots</h2>
        {ballots.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="Nobody has started a ballot yet">
              The reveal stays empty until at least one host locks theirs in.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-raised">
            {ballots.map((b) => (
              <li
                key={b.userId}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Mic size={14} className="text-ink-subtle" aria-hidden="true" />
                  {b.displayName}
                  {b.userId === live.userId && (
                    <span className="text-xs font-normal text-ink-subtle">(you)</span>
                  )}
                </span>
                <span
                  className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                    b.submittedAt
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                      : "bg-sunken text-ink-muted"
                  }`}
                >
                  {b.submittedAt
                    ? `Locked in · ${b.entries.length} teams`
                    : `Draft · ${b.entries.length} of ${ctx.teams.length} placed`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-ink-subtle">
          {submitted.length === 0
            ? "No locked ballots yet."
            : `${submitted.length} ballot${submitted.length === 1 ? "" : "s"} counting towards the Week ${ctx.week} reveal.`}
        </p>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Users size={18} className="text-ink-subtle" aria-hidden="true" />
          Week {ctx.week} community rankings
        </h2>
        <div className="mt-3 space-y-3 rounded-lg border border-line bg-raised p-4">
          <p className="text-sm text-ink-muted">
            Every locked-in ballot — yours and the listeners&apos; — averaged into a public
            ranking at{" "}
            <Link href={`/power-rankings?week=${ctx.week}`} className="text-accent hover:underline">
              /power-rankings
            </Link>
            . Listener votes never touch the reveal.
          </p>
          <p className="text-sm text-ink">
            <strong>{listeners.submitted}</strong> listener ballot
            {listeners.submitted === 1 ? "" : "s"} locked in
            {listeners.drafts > 0 && `, ${listeners.drafts} still drafting`}.{" "}
            <span className="text-ink-muted">
              {publication.mode === "published"
                ? `Published by hand${publication.publicAt ? ` ${formatLeagueTime(publication.publicAt)}` : ""}.`
                : publication.mode === "held"
                  ? "Held — it won't go public until you publish it, and listeners can keep voting."
                  : publication.isPublic
                    ? `Went public ${publication.publicAt ? formatLeagueTime(publication.publicAt) : ""}.`
                    : publication.publicAt
                      ? `Goes public automatically ${formatLeagueTime(publication.publicAt)}, and listener voting closes then.`
                      : "No kickoff date in the league calendar, so it won't publish on its own."}
            </span>
          </p>
          <PublicationControls
            season={ctx.season}
            week={ctx.week}
            mode={publication.mode}
            isPublic={publication.isPublic}
          />
        </div>
      </section>
    </PageShell>
  );
}
