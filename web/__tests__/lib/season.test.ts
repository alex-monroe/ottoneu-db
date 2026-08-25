// Mock the supabase client to prevent real initialization in Jest.
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

import { getSeasonContext, LeagueCalendarRow } from "@/lib/season";

const CAL_2026: LeagueCalendarRow = {
  league_id: 309,
  season: 2026,
  season_start: "2026-01-03",
  arb_start: "2026-02-15",
  arb_end: "2026-03-31",
  keeper_deadline: "2026-07-31",
  auction_date: null,
  regular_season_start: "2026-09-04",
  trade_deadline: "2026-11-25",
  last_auction_date: "2026-12-30",
};
const CAL_2027: LeagueCalendarRow = {
  ...CAL_2026,
  season: 2027,
  season_start: "2027-01-03",
  arb_start: "2027-02-15",
  arb_end: "2027-03-31",
  keeper_deadline: "2027-07-31",
  regular_season_start: "2027-09-04",
  trade_deadline: "2027-11-25",
  last_auction_date: "2027-12-30",
};
const CAL = [CAL_2026, CAL_2027];

describe("getSeasonContext", () => {
  const ORIGINAL_ENV = process.env;
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SEASON_OVERRIDE;
    delete process.env.PHASE_OVERRIDE;
  });
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("resolves pre_arb during the arbitration window", () => {
    const ctx = getSeasonContext(CAL, "2026-02-20");
    expect(ctx.phase).toBe("pre_arb");
    expect(ctx.leagueSeason).toBe(2026);
    expect(ctx.projectionSeason).toBe(2026);
    expect(ctx.statsSeason).toBe(2025); // no 2026 NFL games yet
    expect(ctx.arbWindowOpen).toBe(true);
  });

  it("resolves pre_keeper between arb end and keeper deadline", () => {
    const ctx = getSeasonContext(CAL, "2026-06-01");
    expect(ctx.phase).toBe("pre_keeper");
    expect(ctx.leagueSeason).toBe(2026);
    expect(ctx.statsSeason).toBe(2025);
    expect(ctx.arbWindowOpen).toBe(false);
    expect(ctx.nextBoundary).toBe("2026-07-31");
  });

  it("resolves pre_draft between keeper deadline and regular season", () => {
    const ctx = getSeasonContext(CAL, "2026-08-15");
    expect(ctx.phase).toBe("pre_draft");
    expect(ctx.statsSeason).toBe(2025);
  });

  // Ottoneu shows "Draft day has not been set yet" until the auction is
  // scheduled, so the whole keeper->kickoff window stays pre_draft without one.
  it("keeps the whole keeper-to-kickoff window pre_draft with no auction date", () => {
    expect(getSeasonContext(CAL, "2026-09-03").phase).toBe("pre_draft");
  });

  describe("with a scheduled auction date", () => {
    const DRAFTED = [{ ...CAL_2026, auction_date: "2026-08-22" }, CAL_2027];

    it("stays pre_draft before the auction, and on auction day itself", () => {
      expect(getSeasonContext(DRAFTED, "2026-08-15").phase).toBe("pre_draft");
      expect(getSeasonContext(DRAFTED, "2026-08-22").phase).toBe("pre_draft");
    });

    it("resolves post_draft from the day after the auction until kickoff", () => {
      const ctx = getSeasonContext(DRAFTED, "2026-08-24");
      expect(ctx.phase).toBe("post_draft");
      expect(ctx.leagueSeason).toBe(2026);
      expect(ctx.statsSeason).toBe(2025); // still no 2026 NFL games
      expect(ctx.arbWindowOpen).toBe(false);
    });

    it("gives way to in_season at kickoff", () => {
      expect(getSeasonContext(DRAFTED, "2026-09-04").phase).toBe("in_season");
    });
  });

  it("accepts post_draft as a PHASE_OVERRIDE", () => {
    process.env.PHASE_OVERRIDE = "post_draft";
    expect(getSeasonContext(CAL, "2026-06-01").phase).toBe("post_draft");
  });

  it("resolves in_season once NFL games start; stats flip to leagueSeason", () => {
    const ctx = getSeasonContext(CAL, "2026-10-01");
    expect(ctx.phase).toBe("in_season");
    expect(ctx.statsSeason).toBe(2026);
    expect(ctx.projectionSeason).toBe(2026);
  });

  it("stays in_season after the NFL season ends, before next rollover", () => {
    const ctx = getSeasonContext(CAL, "2027-01-01");
    expect(ctx.phase).toBe("in_season");
    expect(ctx.leagueSeason).toBe(2026); // not yet rolled to 2027
    expect(ctx.statsSeason).toBe(2026);
  });

  it("rolls leagueSeason forward at Start of Season", () => {
    const ctx = getSeasonContext(CAL, "2027-01-03");
    expect(ctx.leagueSeason).toBe(2027);
    expect(ctx.phase).toBe("pre_arb");
    expect(ctx.projectionSeason).toBe(2027); // now projecting next season
    expect(ctx.statsSeason).toBe(2026);
  });

  it("falls back to month inference with no calendar rows", () => {
    const ctx = getSeasonContext([], "2026-06-01");
    expect(ctx.source).toBe("fallback");
    expect(ctx.phase).toBe("pre_keeper");
    expect(ctx.leagueSeason).toBe(2026);
  });

  it("honors SEASON_OVERRIDE", () => {
    process.env.SEASON_OVERRIDE = "2030";
    const ctx = getSeasonContext(CAL, "2026-06-01");
    expect(ctx.leagueSeason).toBe(2030);
    expect(ctx.projectionSeason).toBe(2030);
    expect(ctx.statsSeason).toBe(2029);
    expect(ctx.source).toBe("override");
  });

  it("honors PHASE_OVERRIDE", () => {
    process.env.PHASE_OVERRIDE = "in_season";
    const ctx = getSeasonContext(CAL, "2026-06-01");
    expect(ctx.phase).toBe("in_season");
    expect(ctx.arbWindowOpen).toBe(false);
  });

  it("rejects an invalid PHASE_OVERRIDE", () => {
    process.env.PHASE_OVERRIDE = "nonsense";
    expect(() => getSeasonContext(CAL, "2026-06-01")).toThrow();
  });
});
