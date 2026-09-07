"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "request" | "continue";

/**
 * The two actions on /access:
 *  - "request"  — flag the account for an admin to approve.
 *  - "continue" — re-sign the session cookie (it is a 7-day snapshot, so a
 *                 freshly granted user is still carrying `false` in it) and
 *                 return to the page that sent them here.
 */
export default function AccessActions({
  mode,
  returnTo,
}: {
  mode: Mode;
  returnTo: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const label = mode === "request" ? "Request access" : "Continue";
  const pending = mode === "request" ? "Sending..." : "Refreshing...";

  const onClick = async () => {
    setBusy(true);
    setError("");
    try {
      const endpoint =
        mode === "request" ? "/api/access-request" : "/api/auth/refresh";
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "That didn't go through. Try again in a moment.");
        setBusy(false);
        return;
      }
      if (mode === "continue") {
        router.push(returnTo);
      }
      router.refresh();
    } catch {
      setError("That didn't go through. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? pending : label}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
