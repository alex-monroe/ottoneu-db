import Link from "next/link";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";

/**
 * The branded 404.
 *
 * `/teams/[name]` and `/players/[id]` both call `notFound()`, so a stale or
 * mistyped link — a team that was renamed, a player card someone bookmarked —
 * used to land on Next.js's default 404: no nav, no footer, no branding, and no
 * way back. Team pages are the flagship of the overhaul and this was their
 * failure mode.
 */
export default function NotFound() {
  return (
    <PageShell width="narrow">
      <PageHeader title="Not found" />
      <EmptyState title="There's nothing at this address">
        The page you asked for doesn&apos;t exist — most often a team that has
        been renamed, or a player who has left the league.{" "}
        <Link href="/" className="text-accent hover:underline">
          Back to the hub
        </Link>
        , or try{" "}
        <Link href="/teams" className="text-accent hover:underline">
          the team list
        </Link>
        .
      </EmptyState>
    </PageShell>
  );
}
