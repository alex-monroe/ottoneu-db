import PageShell from "@/components/PageShell";
import { TableSkeleton } from "@/components/states";

/**
 * The app-wide navigation placeholder.
 *
 * Every page here is an async server component running two to five Supabase
 * queries. Without a `loading.tsx`, the App Router blocks the navigation on that
 * server render: the reader clicks a nav item and the *old* page sits there
 * unchanged — no spinner, no skeleton, nothing — until the new one is ready. On
 * a cold cache that is a click that appears to do nothing, and it was the
 * largest gap between how good this app is and how good it feels.
 *
 * One file at the root covers every route that does not define its own.
 */
export default function Loading() {
  return (
    <PageShell>
      <div className="animate-pulse space-y-3" role="status" aria-label="Loading page" aria-busy="true">
        <div className="h-8 w-64 rounded bg-sunken" />
        <div className="h-4 w-full max-w-prose rounded bg-sunken" />
        <div className="h-4 w-2/3 max-w-prose rounded bg-sunken" />
      </div>
      <TableSkeleton rows={8} />
    </PageShell>
  );
}
