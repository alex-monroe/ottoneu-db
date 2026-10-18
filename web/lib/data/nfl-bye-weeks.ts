/**
 * Each NFL team's bye week, by season, keyed by nflverse team code (the codes
 * `nfl-divisions.ts` uses; `nfl-byes.ts` maps the roster spellings onto them).
 *
 * Taken from nflverse's schedule (`nfldata/data/games.csv`, regular-season
 * games): a team's bye is the one week it has no game. Byes are fixed when the
 * schedule is released in May and flexed games do not move them, so this is
 * checked in once a season rather than fetched. A season missing here is not
 * an error — the playoff odds fall back to a bye-neutral projection.
 */

export const NFL_BYE_WEEKS: Readonly<Record<number, Readonly<Record<string, number>>>> = {
  2026: {
    // Week 5
    CAR: 5,
    KC: 5,
    // Week 6
    CIN: 6,
    DET: 6,
    MIA: 6,
    MIN: 6,
    // Week 7
    BUF: 7,
    JAX: 7,
    LAC: 7,
    WAS: 7,
    // Week 8
    HOU: 8,
    NO: 8,
    NYG: 8,
    SF: 8,
    // Week 9
    PIT: 9,
    TEN: 9,
    // Week 10
    CHI: 10,
    DEN: 10,
    PHI: 10,
    TB: 10,
    // Week 11
    ATL: 11,
    CLE: 11,
    GB: 11,
    LA: 11,
    NE: 11,
    SEA: 11,
    // Week 13
    BAL: 13,
    IND: 13,
    LV: 13,
    NYJ: 13,
    // Week 14
    ARI: 14,
    DAL: 14,
  },
};
