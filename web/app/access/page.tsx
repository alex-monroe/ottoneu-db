import Link from "next/link";
import { Lock, Clock, CheckCircle2, Mail } from "lucide-react";
import { getLiveAccessState } from "@/lib/auth";
import { isValidRedirect } from "@/lib/utils";
import AccessActions from "./AccessActions";

export const metadata = {
  title: "Access | Ottoneu Analytics",
  description: "Projections access status for your account",
};

// Reads per-user state; must never be cached.
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ from?: string }>;
}

/**
 * Which team the account is bound to. "My team" is per-user now
 * (web/lib/viewer-team.ts), so an unbound account gets neutral pages rather
 * than somebody else's roster — worth saying plainly.
 */
function TeamLine({ teamName }: { teamName: string | null }) {
  return (
    <p className="text-sm text-slate-500 dark:text-slate-400">
      {teamName ? (
        <>
          Your team: <strong className="text-slate-700 dark:text-slate-200">{teamName}</strong>
        </>
      ) : (
        <>
          Your account isn&apos;t linked to a team yet, so pages like Lineup and Salary
          Analysis won&apos;t know which roster is yours. An admin can link it.
        </>
      )}
    </p>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white dark:bg-black px-6 py-16">
      <div className="mx-auto max-w-lg">{children}</div>
    </main>
  );
}

function Card({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode;
  tone: "neutral" | "pending" | "granted";
  title: string;
  children: React.ReactNode;
}) {
  const ring = {
    neutral: "border-slate-200 dark:border-slate-800",
    pending: "border-amber-300 dark:border-amber-900",
    granted: "border-emerald-300 dark:border-emerald-900",
  }[tone];
  const badge = {
    neutral: "bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400",
    pending: "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400",
    granted: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400",
  }[tone];

  return (
    <div className={`rounded-xl border ${ring} bg-white dark:bg-slate-950 p-8`}>
      <span className={`inline-flex rounded-lg p-2.5 ${badge}`}>{icon}</span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        {title}
      </h1>
      <div className="mt-3 space-y-3 text-slate-600 dark:text-slate-300">{children}</div>
    </div>
  );
}

/** What the gated areas actually contain, so the wait is legible. */
function WhatsBehindIt() {
  return (
    <div className="mt-6 rounded-lg bg-slate-50 dark:bg-slate-900/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        What access unlocks
      </p>
      <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
        <li>Season-long and weekly player projections</li>
        <li>VORP, surplus value and your own value adjustments</li>
        <li>Arbitration targets, simulation and budget planning</li>
        <li>The mock draft, and the model&apos;s accuracy backtests</li>
      </ul>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
        The scoreboard, standings, rosters and player pages stay open to everyone —{" "}
        <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">
          browse those now
        </Link>
        .
      </p>
    </div>
  );
}

export default async function AccessPage({ searchParams }: Props) {
  const { from } = await searchParams;
  // `from` is echoed into a link, so only accept in-app paths.
  const returnTo = isValidRedirect(from) ? from! : "/";
  const state = await getLiveAccessState();

  // Signed out — this page is public, so say what to do rather than 404.
  if (!state) {
    return (
      <Shell>
        <Card icon={<Lock size={20} />} tone="neutral" title="Sign in to continue">
          <p>
            That page is for league members. Sign in, or create an account and ask an admin
            to turn on projections access.
          </p>
          <Link
            href={`/login?redirect=${encodeURIComponent(returnTo)}`}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Sign in or register
          </Link>
          <WhatsBehindIt />
        </Card>
      </Shell>
    );
  }

  // Access already granted. The session cookie is a 7-day snapshot, so someone
  // granted access minutes ago still gets bounced here by middleware until the
  // cookie is re-signed — AccessActions does that and then continues.
  if (state.hasProjectionsAccess) {
    return (
      <Shell>
        <Card icon={<CheckCircle2 size={20} />} tone="granted" title="You have access">
          <p>
            Projections access is enabled for <strong>{state.email}</strong>. If you were
            just granted it, continue below to refresh this browser&apos;s session.
          </p>
          <TeamLine teamName={state.teamName} />
          <AccessActions mode="continue" returnTo={returnTo} />
        </Card>
      </Shell>
    );
  }

  // Signed in, waiting.
  const requested = state.accessRequestedAt;
  return (
    <Shell>
      <Card
        icon={requested ? <Clock size={20} /> : <Mail size={20} />}
        tone="pending"
        title={requested ? "Access requested" : "Ask for access"}
      >
        <p>
          You&apos;re signed in as <strong>{state.email}</strong>, but projections access
          hasn&apos;t been turned on for this account yet. An admin grants it manually.
        </p>
        {requested ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Requested{" "}
            {new Date(requested).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            . It&apos;s in the admin queue — you&apos;ll get in once it&apos;s approved.
          </p>
        ) : (
          <AccessActions mode="request" returnTo={returnTo} />
        )}
        <WhatsBehindIt />
      </Card>
    </Shell>
  );
}
