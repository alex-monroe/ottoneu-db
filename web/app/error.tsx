"use client"

import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 px-4 text-center">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Something went wrong!</h2>
      <p className="text-slate-600 dark:text-slate-400 max-w-md">
        {error.message || "An unexpected error occurred while loading the data."}
      </p>
      <button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
