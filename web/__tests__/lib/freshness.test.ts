/**
 * Data-freshness helpers — `web/lib/freshness.ts`.
 *
 * Nothing on the site said how old its numbers were, which matters here more
 * than in most apps: the Ottoneu scrape has been Cloudflare-blocked before and
 * simply stopped updating, with a stale roster looking identical to a fresh
 * one. These are the pure bits — the phrasing a reader sees, and the threshold
 * that decides when to warn them.
 */

import { describeAge, isStale } from "@/lib/freshness";

const NOW = new Date("2026-09-07T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("describeAge", () => {
  test("very recent reads as 'just now' rather than '0 minutes'", () => {
    expect(describeAge(ago(30_000), NOW)).toBe("just now");
  });

  test("minutes, hours and days each get their own phrasing", () => {
    expect(describeAge(ago(20 * MINUTE), NOW)).toBe("20 minutes ago");
    expect(describeAge(ago(3 * HOUR), NOW)).toBe("3 hours ago");
    expect(describeAge(ago(1 * DAY), NOW)).toBe("yesterday");
    expect(describeAge(ago(4 * DAY), NOW)).toBe("4 days ago");
  });

  test("singular hour is not '1 hours ago'", () => {
    expect(describeAge(ago(HOUR), NOW)).toBe("1 hour ago");
  });

  test("beyond a fortnight it falls back to a date", () => {
    // "20 days ago" stops being useful; a date is easier to reason about.
    const out = describeAge(ago(20 * DAY), NOW);
    expect(out).not.toMatch(/ago/);
    expect(out).toMatch(/Aug/);
  });

  test("an unparseable stamp does not throw", () => {
    expect(describeAge("not-a-date", NOW)).toBe("unknown");
  });
});

describe("isStale", () => {
  test("fresh data is not stale", () => {
    expect(isStale(ago(2 * HOUR), 36, NOW)).toBe(false);
  });

  test("data past the threshold is stale", () => {
    expect(isStale(ago(48 * HOUR), 36, NOW)).toBe(true);
  });

  test("the boundary is exclusive, so exactly-at-threshold is still fresh", () => {
    expect(isStale(ago(36 * HOUR), 36, NOW)).toBe(false);
  });

  test("an unparseable stamp counts as stale — fail loud, not silent", () => {
    expect(isStale("not-a-date", 36, NOW)).toBe(true);
  });
});
