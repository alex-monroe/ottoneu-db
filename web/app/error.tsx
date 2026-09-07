"use client";

import { useEffect } from "react";
import Link from "next/link";
import PageShell, { PageHeader } from "@/components/PageShell";
import { ErrorState } from "@/components/states";

/**
 * Route-level error boundary.
 *
 * There was only `global-error.tsx`, which replaces the entire document — so a
 * single failed Supabase read on `/vegas-lines` blew away the nav, the footer
 * and the app shell along with it. This keeps the failure inside the page and
 * leaves the reader somewhere to go.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error boundary caught an error:", error);
  }, [error]);

  return (
    <PageShell width="narrow">
      <PageHeader title="This page didn't load" />
      <ErrorState title="Something went wrong fetching this data">
        <p>
          {process.env.NODE_ENV === "development"
            ? error.message
            : "The data behind this page couldn't be read. This is usually transient."}
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            onClick={() => reset()}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Try again
          </button>
          <Link href="/" className="text-sm font-medium text-accent hover:underline">
            Back to the hub →
          </Link>
        </p>
      </ErrorState>
    </PageShell>
  );
}
