import { LIVE_HEARTBEAT_MS, isHeartbeatFresh } from "@/lib/live-worm";

describe("isHeartbeatFresh", () => {
  const now = Date.parse("2026-11-01T19:00:00Z");

  it("is live within three minutes of the loop's last pass", () => {
    expect(isHeartbeatFresh("2026-11-01T18:59:10+00:00", now)).toBe(true);
    expect(isHeartbeatFresh(new Date(now - LIVE_HEARTBEAT_MS).toISOString(), now)).toBe(true);
  });

  it("is not live once the loop has stopped writing", () => {
    expect(isHeartbeatFresh(new Date(now - LIVE_HEARTBEAT_MS - 1).toISOString(), now)).toBe(false);
  });

  it("is not live with no heartbeat or an unreadable one", () => {
    expect(isHeartbeatFresh(null, now)).toBe(false);
    expect(isHeartbeatFresh(undefined, now)).toBe(false);
    expect(isHeartbeatFresh("not a time", now)).toBe(false);
  });
});
