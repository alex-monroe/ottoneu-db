"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global Error Boundary caught an error:", error);
  }, [error]);

  // NB this replaces the whole document, root layout included, so it cannot use
  // PageShell or ErrorState. It is the last resort behind `app/error.tsx`,
  // which now catches per-route failures without taking the app shell with it.

  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-page p-4 text-center">
          <div className="flex max-w-md flex-col items-center gap-4 rounded-lg border border-negative/30 bg-negative-soft p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-raised">
              <AlertCircle className="h-6 w-6 text-negative" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-ink">
                Something went wrong!
              </h2>
              <p className="text-sm text-ink-muted">
                {process.env.NODE_ENV === "development" ? error.message : "An unexpected error occurred while fetching data."}
              </p>
            </div>
            <button
              onClick={() => reset()}
              className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:hover:bg-red-500"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
