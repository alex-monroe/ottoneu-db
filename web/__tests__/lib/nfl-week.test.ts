// Mock the supabase client to prevent real initialization in Jest.
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

import { readFileSync } from "fs";
import { join } from "path";
import {
  currentNflWeek,
  displayWeeks,
  isNflWeekLive,
  resolveWindow,
  todayInLeagueTz,
  weekForDate,
  type CalendarRow,
} from "@/lib/nfl-week";

// The SAME boundary table the Python twin's tests read
// (scripts/tests/test_nfl_week.py). If the two implementations ever disagree,
// one of the suites goes red.
const FIXTURE = JSON.parse(
  readFileSync(
    join(__dirname, "../../../scripts/tests/fixtures/nfl_week_boundaries.json"),
    "utf8",
  ),
) as {
  regular_season_start: string;
  anchor_tuesday: string;
  weeks: number;
  cases: { date: string; week: number | null; why: string }[];
  display_cases: {
    date: string;
    upcoming: number | null;
    previous: number | null;
    why: string;
  }[];
  calendar: CalendarRow[];
  season_cases: {
    date: string;
    season: number;
    week: number | null;
    live: boolean;
    why: string;
  }[];
};

const ANCHOR = FIXTURE.anchor_tuesday;

const CALENDAR = FIXTURE.calendar;
// Just the season under test, for the single-season boundary cases.
const ONE_SEASON: CalendarRow[] = [CALENDAR[0]];

describe("weekForDate", () => {
  it.each(FIXTURE.cases)("$date → week $week ($why)", ({ date, week }) => {
    expect(weekForDate(date, ANCHOR)).toBe(week);
  });

  it("derives the anchor from regular_season_start", () => {
    // Week 1's Thursday minus two days is the Tuesday the week opens.
    expect(resolveWindow("2026-09-15", ONE_SEASON).anchor).toBe(ANCHOR);
  });

  it("has no anchor when regular_season_start is missing", () => {
    expect(resolveWindow("2026-09-15", [{ season: 2026 }]).anchor).toBeNull();
    expect(resolveWindow("2026-09-15", []).anchor).toBeNull();
  });

  it("gives every week exactly seven days", () => {
    const seen: number[] = [];
    let day = ANCHOR;
    for (;;) {
      const w = weekForDate(day, ANCHOR);
      if (w === null) break;
      seen.push(w);
      day = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
        .toISOString()
        .slice(0, 10);
    }
    const unique = [...new Set(seen)].sort((a, b) => a - b);
    expect(unique).toEqual(
      Array.from({ length: FIXTURE.weeks }, (_, i) => i + 1),
    );
    for (const w of unique) {
      expect(seen.filter((x) => x === w)).toHaveLength(7);
    }
  });
});

describe("currentNflWeek", () => {
  it.each(FIXTURE.cases)("$date → week $week", ({ date, week }) => {
    expect(currentNflWeek(ONE_SEASON, date).week).toBe(week);
  });

  it("yields no week when the calendar has no kickoff date", () => {
    expect(currentNflWeek([], "2026-10-01")).toEqual({ season: null, week: null });
    expect(currentNflWeek([{ season: 2026 }], "2026-10-01")).toEqual({
      season: null,
      week: null,
    });
  });

  describe("NFL_WEEK_OVERRIDE", () => {
    const original = process.env.NFL_WEEK_OVERRIDE;
    afterEach(() => {
      if (original === undefined) delete process.env.NFL_WEEK_OVERRIDE;
      else process.env.NFL_WEEK_OVERRIDE = original;
    });

    it("short-circuits the resolved week", () => {
      process.env.NFL_WEEK_OVERRIDE = "7";
      // A date that would otherwise resolve to Week 1.
      expect(currentNflWeek(CALENDAR, "2026-09-10").week).toBe(7);
    });

    it("rejects an out-of-range value", () => {
      process.env.NFL_WEEK_OVERRIDE = "19";
      expect(() => currentNflWeek(CALENDAR, "2026-09-10")).toThrow(
        /between 1 and 18/,
      );
    });
  });
});

describe("displayWeeks", () => {
  it.each(FIXTURE.display_cases)(
    "$date → upcoming $upcoming, previous $previous ($why)",
    ({ date, upcoming, previous }) => {
      const got = displayWeeks(ONE_SEASON, date);
      expect(got.upcoming).toBe(upcoming);
      expect(got.previous).toBe(previous);
    },
  );

  it("keeps the previous week visible after its games are played", () => {
    // The whole point of the feature: after Week 1's games are done, Week 1's
    // projection is still on the card next to Week 2's.
    expect(displayWeeks(CALENDAR, "2026-09-15").previous).toBe(1);
  });
});

describe("todayInLeagueTz", () => {
  it("treats a UTC evening as the previous league day", () => {
    // 2026-09-15 01:30 UTC is 2026-09-14 21:30 ET — a Monday-night kickoff. A
    // naive toISOString() would call this Tuesday and flip the week mid-game.
    const utcEvening = new Date("2026-09-15T01:30:00Z");
    expect(todayInLeagueTz(utcEvening)).toBe("2026-09-14");
    expect(weekForDate(todayInLeagueTz(utcEvening), ANCHOR)).toBe(1);
  });

  it("flips the week on Tuesday morning ET", () => {
    // 2026-09-15 11:00 UTC is 07:00 ET Tuesday.
    const etTuesday = new Date("2026-09-15T11:00:00Z");
    expect(todayInLeagueTz(etTuesday)).toBe("2026-09-15");
    expect(weekForDate(todayInLeagueTz(etTuesday), ANCHOR)).toBe(2);
  });
});

describe("season resolution across a multi-season calendar", () => {
  // The SAME season table the Python twin reads. The league calendar and the
  // NFL schedule disagree twice a year; these pin the disagreements.
  it.each(FIXTURE.season_cases)(
    "$date → season $season week $week ($why)",
    ({ date, season, week }) => {
      expect(currentNflWeek(CALENDAR, date)).toEqual({ season, week });
    },
  );

  it.each(FIXTURE.season_cases)("$date → live=$live", ({ date, live }) => {
    expect(isNflWeekLive(date, CALENDAR)).toBe(live);
  });

  it("does not let the league season roll steal Week 18", () => {
    // Ottoneu rolls its league season ~Jan 3; Week 18 is played Jan 4-5.
    // Attributing those games to the NEW season would mislabel them and make
    // the retention purge delete the week the cards are showing.
    expect(currentNflWeek(CALENDAR, "2027-01-05")).toEqual({ season: 2026, week: 18 });
  });

  it("points preseason at the coming season, not the last one", () => {
    expect(currentNflWeek(CALENDAR, "2026-08-20")).toEqual({ season: 2026, week: 1 });
  });
});
