"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface LiveRefreshProps {
  /** Seconds between refreshes (lib/live-worm.ts LIVE_REFRESH_SECONDS). */
  seconds: number;
}

/**
 * Keeps an open game page current while NFL games are on. Every `seconds` it
 * re-runs the server render (`router.refresh()`), which keeps client state such
 * as the worm's Clock / Minutes played / Win % tab. It pauses while the tab is
 * hidden and catches up as soon as the tab is shown again. The server page
 * renders this only while the live loop's heartbeat is fresh, so when games end
 * the next refresh drops it and the page stops.
 */
export default function LiveRefresh({ seconds }: LiveRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const period = seconds * 1000;
    let last = Date.now();
    const refresh = () => {
      last = Date.now();
      router.refresh();
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, period);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= period) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);

  return (
    <p className="flex items-center gap-2 text-xs text-ink-subtle" role="status">
      <span className="relative inline-flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
      </span>
      Live · this page updates every minute
    </p>
  );
}
