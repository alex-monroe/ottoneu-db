import Link from "next/link";
import { Inbox, Lock, AlertTriangle } from "lucide-react";

/**
 * Shared empty / no-access / error states.
 *
 * These were hand-rolled per page and drifted: one route rendered
 * "No roster data found." as a `text-3xl font-bold h1` — an error styled as a
 * page title — while others used a bare paragraph and others a local `Empty`
 * component. Same situation, four different treatments.
 *
 * Server components (no client state), so any page can use them.
 */

function Frame({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode;
  tone: "neutral" | "locked" | "error";
  title: string;
  children?: React.ReactNode;
}) {
  const ring = {
    neutral: "border-line",
    locked: "border-dashed border-line-strong",
    error: "border-red-200 dark:border-red-900",
  }[tone];
  const badge = {
    neutral: "bg-sunken text-ink-subtle",
    locked: "bg-sunken text-ink-subtle",
    error: "bg-red-100 dark:bg-red-950/60 text-negative",
  }[tone];

  return (
    <div className={`rounded-lg border ${ring} bg-raised p-6`}>
      <span className={`inline-flex rounded-md p-2 ${badge}`}>{icon}</span>
      {/* A missing-data notice is not a page heading, so this is an h2 at body
          scale rather than a 3xl title. */}
      <h2 className="mt-3 text-base font-semibold text-ink">
        {title}
      </h2>
      {children && (
        <div className="mt-1.5 max-w-prose text-sm text-ink-subtle">
          {children}
        </div>
      )}
    </div>
  );
}

/** Nothing to show, and that is a normal state. */
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <Frame icon={<Inbox size={18} aria-hidden="true" />} tone="neutral" title={title}>
      {children}
    </Frame>
  );
}

/** The viewer is signed in but lacks projections access. */
export function NoAccessState({
  what = "this page",
}: {
  /** What they cannot see, e.g. "weekly projections". */
  what?: string;
}) {
  return (
    <Frame icon={<Lock size={18} aria-hidden="true" />} tone="locked" title="Projections access needed">
      <>
        An admin grants access to {what}.{" "}
        <Link href="/access" className="text-accent hover:underline">
          Check where your account stands
        </Link>
        .
      </>
    </Frame>
  );
}

/** Something went wrong, and the reader can do something about it. */
export function ErrorState({
  title = "Something went wrong",
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <Frame icon={<AlertTriangle size={18} aria-hidden="true" />} tone="error" title={title}>
      {children}
    </Frame>
  );
}

/** Placeholder rows while a table streams in. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="space-y-2"
      role="status"
      aria-label="Loading"
      aria-busy="true"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded bg-sunken"
        />
      ))}
    </div>
  );
}
