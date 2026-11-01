/**
 * Are NFL games being played right now? The live score worm loop
 * (scripts/live_score_worm.py) writes a heartbeat to `live_worm_state` on every
 * pass, and it runs exactly while a game is on or about to start. So a fresh
 * heartbeat means the worm and lineups are moving, and an open game page should
 * keep refreshing itself (components/LiveRefresh.tsx).
 *
 * `live_worm_state` has no anon policy, so this reads it with the server-only
 * admin client. Any failure reads as "not live": the page then behaves as it did
 * before, refreshing on reload.
 */

import { getSupabaseAdmin } from "./supabase";

/** The loop writes every 60 seconds; three missed passes means it has stopped. */
export const LIVE_HEARTBEAT_MS = 3 * 60 * 1000;

/** How often an open game page refreshes while games are on: the loop's own cadence. */
export const LIVE_REFRESH_SECONDS = 60;

export function isHeartbeatFresh(heartbeatAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!heartbeatAt) return false;
  const at = Date.parse(heartbeatAt);
  return Number.isFinite(at) && now - at <= LIVE_HEARTBEAT_MS;
}

export async function fetchGamesAreLive(): Promise<boolean> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("live_worm_state")
      .select("heartbeat_at")
      .eq("id", 1)
      .maybeSingle();
    return isHeartbeatFresh(data?.heartbeat_at);
  } catch (error) {
    console.error("fetchGamesAreLive failed:", error);
    return false;
  }
}
