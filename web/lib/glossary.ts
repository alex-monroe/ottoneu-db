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
      "Value Over Replacement Player: points scored above the worst player at the same position anyone would bother to roster. It is how a 14-PPG QB and a 14-PPG RB get told apart in a superflex league, where quarterbacks are scarce.",
    href: "/value?tab=vorp",
  },
  replacement_level: {
    term: "Replacement level",
    definition:
      "The marginal ownable player at a position — the last one worth a roster spot once every team has filled its lineup and its bye-week and injury cover. The superflex slot goes to whichever position offers the best next player, which is why the QB baseline sits so much higher here than in a one-QB league.",
    href: "/value?tab=vorp",
  },
  dollar_value: {
    term: "Dollar value",
    definition:
      "What a player is worth in salary. Every roster spot costs at least $1, and what is left of the league cap is split across all above-replacement production — so values add up to exactly the cap. It is a price, not a prediction.",
    href: "/value",
  },
  earned_value: {
    term: "Earned value",
    definition:
      "The same dollar math run backwards, on the points a player actually scored rather than a projection — what he would have gone for with perfect foresight. A player who missed half the season earned half the money, because availability is observed here rather than forecast.",
    href: "/value?tab=earned",
  },
  realized_surplus: {
    term: "Realized surplus",
    definition:
      "Earned value minus the salary actually paid that season. Where surplus grades a roster decision in advance, this grades it after the fact.",
  },
  return_on_salary: {
    term: "Return",
    definition:
      "Dollars earned per dollar paid — 1.00 is breaking even, 2.00 is twice the production the price asked for. Being a ratio, it reads the same whether you are looking at two weeks or a whole season, which makes it the number to trust mid-season.",
    href: "/value?tab=earned",
  },
  salary_to_date: {
    term: "Paid so far",
    definition:
      "The share of a salary the roster spot has cost over the football played so far. A full season's price set against a fortnight of points would flatter every player on the board, so both sides are scaled to the same stretch.",
    href: "/value?tab=earned",
  },
  stat_window: {
    term: "Stat window",
    definition:
      "How much football is behind the numbers on a page. A finished season is seventeen games; a season in progress is however many have been played, and every rate and rank on the page is only as settled as that sample.",
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
