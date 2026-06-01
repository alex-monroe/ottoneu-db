jest.mock("@/lib/supabase", () => ({ supabase: {} }));

import { describeNextBoundary, PHASE_UI } from "@/lib/season-ui";
import { buildRosterSnapshots } from "@/lib/roster-reconstruction";

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
    for (const phase of ["in_season", "pre_arb", "pre_keeper", "pre_draft"] as const) {
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
    expect(cfg.quickDates).toEqual([
      { label: "Pre-Draft", date: "2026-09-03" },
      { label: "Wk 1", date: "2026-09-04" },
      { label: "Wk 8", date: "2026-10-23" },
      { label: "Wk 16", date: "2026-12-18" },
      { label: "Today", date: "2026-06-01" },
    ]);
  });

  it("defaults to the Pre-Draft snapshot during the pre_draft phase", () => {
    const cfg = buildRosterSnapshots(
      { phase: "pre_draft", leagueSeason: 2026, deadlines: DEADLINES },
      "2026-08-20"
    );
    expect(cfg.defaultDate).toBe("2026-09-03");
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
});
