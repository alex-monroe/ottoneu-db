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

  return (
    <html>
      <body>
        <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center p-4 text-center">
          <div className="flex flex-col items-center max-w-md gap-4 rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-900/10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
              <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-red-900 dark:text-red-300">
                Something went wrong!
              </h2>
              <p className="text-sm text-red-700 dark:text-red-400">
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
