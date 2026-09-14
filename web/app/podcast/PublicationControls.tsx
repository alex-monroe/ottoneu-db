"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicationAction, PublicationMode } from "@/lib/community-rankings";

interface Props {
  season: number;
  week: number;
  mode: PublicationMode;
  isPublic: boolean;
}

/**
 * Publish / hold / back-to-schedule for one week's community ranking.
 *
 * Only the actions that change something are offered: a week already on the
 * schedule has no "back to schedule", and a published one no "publish now".
 */
export default function PublicationControls({ season, week, mode, isPublic }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<PublicationAction | null>(null);
  const [error, setError] = useState("");

  const act = async (action: PublicationAction) => {
    setPending(action);
    setError("");
    try {
      const res = await fetch("/api/podcast/power-rankings/publication", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, week, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't update that. Try again in a moment.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setPending(null);
    }
  };

  const button = (action: PublicationAction, label: string, primary = false) => (
    <button
      key={action}
      onClick={() => act(action)}
      disabled={pending !== null}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "bg-blue-600 text-white hover:bg-blue-700"
          : "border border-line-strong text-ink-muted hover:bg-sunken"
      }`}
    >
      {pending === action ? "Saving…" : label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isPublic && button("publish", "Publish now", true)}
      {mode !== "held" && button("hold", isPublic ? "Unpublish and hold" : "Hold past Thursday")}
      {mode !== "scheduled" && button("schedule", "Back to Thursday schedule")}
      {error && (
        <span role="alert" className="text-sm text-negative">
          {error}
        </span>
      )}
    </div>
  );
}
