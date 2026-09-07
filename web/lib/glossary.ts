/**
 * In-product definitions for the site's vocabulary.
 *
 * The app mixes three dialects — Ottoneu economics (surplus, arbitration, the
 * raise treadmill), NFL production stats (PPG, PPS, snaps) and this project's
 * own model output (projected PPG, VORP, dollar value) — and it printed all of
 * them as bare column headers. `docs/GLOSSARY.md` exists **for developers**;
 * nothing explained any of it to the people reading the numbers.
 *
 * Keep definitions short enough to read in a hover: what it is, and what a
 * reader should do with it. Anything longer belongs in the docs.
 */

export interface GlossaryEntry {
  /** Display name, used as the popover heading. */
  term: string;
  /** One or two sentences. No markup. */
  definition: string;
  /** Optional pointer at the page that owns the number. */
  href?: string;
}

const ENTRIES = {
  vorp: {
    term: "VORP",
    definition:
      "Value Over Replacement Player: points scored above what a freely available player at the same position would have scored. It is how a 14-PPG QB and a 14-PPG RB get told apart in a superflex league, where quarterbacks are scarce.",
    href: "/value?tab=vorp",
  },
  dollar_value: {
    term: "Dollar value",
    definition:
      "What a player is worth in salary, derived from VORP by spreading the league's total cap across all positive-VORP production. It is a price, not a prediction.",
    href: "/value",
  },
  surplus: {
    term: "Surplus",
    definition:
      "Dollar value minus current salary. Positive means a bargain you should keep; negative means you are paying above the player's production. This is the core keep/cut number in this format.",
    href: "/value?tab=surplus",
  },
  ppg: {
    term: "PPG",
    definition:
      "Points per game actually scored last season, under this league's scoring settings. History, not a forecast.",
  },
  pps: {
    term: "PPS",
    definition:
      "Points per snap — production per unit of playing time. High PPS with low PPG usually means a productive player who was not on the field much.",
  },
  projected_ppg: {
    term: "Projected PPG",
    definition:
      "This site's own season-long forecast: average points per game over a full season. Built from player history and situation, and deliberately market-free — no ADP or expert consensus feeds it.",
    href: "/projections",
  },
  projected_points: {
    term: "Projected points",
    definition:
      "A third party's forecast for ONE specific game. Different thing from Projected PPG, which is this site's season-long average — the columns are named differently on purpose.",
    href: "/weekly",
  },
  cap_space: {
    term: "Cap space",
    definition:
      "Salary cap minus committed salary. Ottoneu rosters run year-round, so cap space is what you have left to bid, claim and absorb arbitration raises with.",
  },
  arbitration: {
    term: "Arbitration",
    definition:
      "The offseason phase where every team spends a fixed budget raising OTHER teams' player salaries. You cannot raise your own, so it is a tax the league levies on the best bargains.",
    href: "/arbitration",
  },
  surplus_after_arb: {
    term: "Surplus after raise",
    definition:
      "Surplus recomputed with the maximum single-team arbitration raise applied. A player who stays positive here is still a bargain even after opponents do their worst.",
  },
  value_mode: {
    term: "Value mode",
    definition:
      "Raw uses last season's actual production. Adjusted applies your own manual per-player overrides. Projected uses this site's season-long forecast instead of history. All three change every number on the page.",
  },
};

export type GlossaryTerm = keyof typeof ENTRIES;

/**
 * Annotated on the way out so every entry reads as a `GlossaryEntry` — without
 * it, TypeScript infers a union of literal shapes and `href` (which only some
 * entries carry) is not accessible on the union.
 */
export const GLOSSARY: Record<GlossaryTerm, GlossaryEntry> = ENTRIES;

export function lookup(term: GlossaryTerm): GlossaryEntry {
  return GLOSSARY[term];
}
