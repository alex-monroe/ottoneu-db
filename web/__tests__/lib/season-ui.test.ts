jest.mock("@/lib/supabase", () => ({ supabase: {} }));

import { describeNextBoundary, PHASE_UI } from "@/lib/season-ui";
import { PHASES } from "@/lib/season";
import { buildRosterSnapshots, nflKickoff } from "@/lib/roster-reconstruction";

const DEADLINES = {
  season_start: "2026-01-03",
  arb_start: "2026-02-15",
  arb_end: "2026-03-31",
  keeper_deadline: "2026-07-31",
  regular_season_start: "2026-09-04",
};

describe("describeNextBoundary", () => {
  it("labels the next boundary and counts days until it", () => {
    const next = describeNextBoundary(
      { nextBoundary: "2026-07-31", deadlines: DEADLINES },
      "2026-06-01"
    );
    expect(next).toEqual({ label: "keeper deadline", date: "2026-07-31", daysUntil: 60 });
  });

  it("returns null when there is no upcoming boundary", () => {
    expect(
      describeNextBoundary({ nextBoundary: null, deadlines: {} }, "2026-06-01")
    ).toBeNull();
  });
});

describe("PHASE_UI", () => {
  it("defines a label and featured links for every phase", () => {
    for (const phase of PHASES) {
      expect(PHASE_UI[phase].label).toBeTruthy();
      expect(PHASE_UI[phase].featuredLinks.length).toBeGreaterThan(0);
    }
  });
});

describe("buildRosterSnapshots", () => {
  it("anchors weeks to kickoff and defaults to Today outside pre_draft", () => {
    const cfg = buildRosterSnapshots(
      { phase: "pre_keeper", leagueSeason: 2026, deadlines: DEADLINES },
      "2026-06-01"
    );
    expect(cfg.defaultDate).toBe("2026-06-01");
    expect(cfg.dateRange).toEqual({ min: "2026-01-03", max: "2026-06-01" });
    // Kickoff is still months away, so no week has a roster worth showing yet.
    expect(cfg.quickDates).toEqual([
      { label: "Pre-Draft", date: "2026-09-03" },
      { label: "Today", date: "2026-06-01" },
    ]);
  });

  it("offers a jump per week that has begun, and none for weeks still ahead", () => {
    const cfg = buildRosterSnapshots(
      { phase: "in_season", leagueSeason: 2026, deadlines: DEADLINES },
      "2026-10-01"
    );
    const weeks = cfg.quickDates.filter((q) => q.label.startsWith("Wk "));
    expect(weeks[0]).toEqual({ label: "Wk 1", date: "2026-09-04" });
    // 2026-10-01 falls in week 4; week 5 opens on 10-02.
    expect(weeks[weeks.length - 1]).toEqual({ label: "Wk 4", date: "2026-09-25" });
  });

  it("defaults to the Pre-Draft snapshot during the pre_draft phase", () => {
    const cfg = buildRosterSnapshots(
      { phase: "pre_draft", leagueSeason: 2026, deadlines: DEADLINES },
      "2026-08-20"
    );
    expect(cfg.defaultDate).toBe("2026-09-03");
  });

  it("anchors Pre-Draft to the auction and adds Post-Draft once it has run", () => {
    const cfg = buildRosterSnapshots(
      {
        phase: "post_draft",
        leagueSeason: 2026,
        deadlines: { ...DEADLINES, auction_date: "2026-08-22" },
      },
      "2026-08-24"
    );
    // Post-draft the pre-auction snapshot is no longer the interesting view.
    expect(cfg.defaultDate).toBe("2026-08-24");
    expect(cfg.quickDates).toEqual([
      { label: "Pre-Draft", date: "2026-08-21" },
      { label: "Post-Draft", date: "2026-08-22" },
      { label: "Today", date: "2026-08-24" },
    ]);
  });

  it("omits the Post-Draft jump while the auction is still ahead", () => {
    const cfg = buildRosterSnapshots(
      {
        phase: "pre_draft",
        leagueSeason: 2026,
        deadlines: { ...DEADLINES, auction_date: "2026-08-22" },
      },
      "2026-08-15"
    );
    expect(cfg.defaultDate).toBe("2026-08-21");
    expect(cfg.quickDates.map((q) => q.label)).not.toContain("Post-Draft");
  });

  it("degrades gracefully when calendar dates are missing", () => {
    const cfg = buildRosterSnapshots(
      { phase: "in_season", leagueSeason: 2026, deadlines: {} },
      "2026-10-01"
    );
    expect(cfg.quickDates).toEqual([{ label: "Today", date: "2026-10-01" }]);
    expect(cfg.dateRange).toEqual({ min: "2026-01-01", max: "2026-10-01" });
    expect(cfg.defaultDate).toBe("2026-10-01");
  });

  describe("past seasons", () => {
    const CTX = { phase: "in_season", leagueSeason: 2026, deadlines: DEADLINES } as const;

    it("closes the window the day before the current season started", () => {
      const cfg = buildRosterSnapshots(CTX, "2026-06-01", {
        season: 2025,
        earliestDate: "2025-08-24",
      });
      // No "Today" in a season that is over — the default is its final day.
      expect(cfg.dateRange).toEqual({ min: "2025-08-24", max: "2026-01-02" });
      expect(cfg.defaultDate).toBe("2026-01-02");
      expect(cfg.quickDates[0]).toEqual({ label: "Wk 1", date: "2025-09-04" });
      expect(cfg.quickDates.at(-1)).toEqual({ label: "Season End", date: "2026-01-02" });
      // A finished season offers all 18 weeks.
      expect(cfg.quickDates.filter((q) => q.label.startsWith("Wk "))).toHaveLength(18);
    });

    it("falls back to the calendar year for seasons before the previous one", () => {
      const cfg = buildRosterSnapshots(CTX, "2026-06-01", { season: 2024 });
      expect(cfg.dateRange).toEqual({ min: "2024-01-01", max: "2024-12-31" });
    });

    it("ignores a history floor that predates the season being viewed", () => {
      const cfg = buildRosterSnapshots(CTX, "2026-06-01", {
        season: 2025,
        earliestDate: "2024-03-01",
      });
      expect(cfg.dateRange.min).toBe("2025-01-01");
    });
  });
});

describe("nflKickoff", () => {
  // Week 1 is the Thursday after Labor Day (the first Monday in September).
  it.each([
    [2019, "2019-09-05"],
    [2020, "2020-09-10"],
    [2021, "2021-09-09"],
    [2022, "2022-09-08"],
    [2023, "2023-09-07"],
    [2024, "2024-09-05"],
    [2025, "2025-09-04"],
    [2026, "2026-09-10"],
  ])("resolves %i week 1 to %s", (season, expected) => {
    expect(nflKickoff(season)).toBe(expected);
  });
});
