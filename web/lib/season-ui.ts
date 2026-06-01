/**
 * Phase-driven UI configuration for the season cycle.
 *
 * Pure, client-safe config (no DB access): maps each cycle phase to a label,
 * a one-line blurb, and which navigation areas to feature. The phase itself is
 * resolved server-side via web/lib/season.ts (getSeasonContextNow) and passed
 * down as a prop. Keep this in sync with scripts/season.py phase semantics.
 */

import type { Phase, SeasonContext } from "./season";

export interface PhaseUi {
  /** Human-readable phase name for banners and badges. */
  label: string;
  /** One-line description of what matters during this phase. */
  blurb: string;
  /** Label of the nav dropdown group to highlight (matches PRIVATE_GROUPS). */
  featuredGroup?: string;
  /** Hrefs to accent as "featured now" in the nav. */
  featuredLinks: string[];
}

export const PHASE_UI: Record<Phase, PhaseUi> = {
  in_season: {
    label: "In-Season",
    blurb: "NFL games are being played — track live VORP, lineups, and standings.",
    featuredLinks: ["/", "/lineup"],
  },
  pre_arb: {
    label: "Pre-Arbitration",
    blurb: "Arbitration is upcoming — plan allocations and watch the league's progress.",
    featuredGroup: "Arbitration",
    featuredLinks: ["/arbitration", "/arbitration-planner", "/arb-progress"],
  },
  pre_keeper: {
    label: "Pre-Keeper",
    blurb: "Keep-or-cut decisions ahead — review surplus value and projected salaries.",
    featuredGroup: "Value",
    featuredLinks: ["/surplus-value", "/projected-salary"],
  },
  pre_draft: {
    label: "Pre-Draft",
    blurb: "Auction prep — study projections and pre-draft roster snapshots.",
    featuredGroup: "Projections",
    featuredLinks: ["/projections", "/rosters"],
  },
};

/** Friendly labels for each league_calendar deadline key. */
const DEADLINE_LABELS: Record<string, string> = {
  season_start: "season start",
  arb_start: "arbitration opens",
  arb_end: "arbitration deadline",
  keeper_deadline: "keeper deadline",
  auction_date: "auction draft",
  regular_season_start: "kickoff",
  trade_deadline: "trade deadline",
  last_auction_date: "last auction",
};

export interface NextBoundary {
  label: string;
  date: string;
  daysUntil: number;
}

/** Describe the next upcoming calendar boundary for countdown UI. */
export function describeNextBoundary(
  ctx: Pick<SeasonContext, "nextBoundary" | "deadlines">,
  now: Date | string = new Date(),
): NextBoundary | null {
  if (!ctx.nextBoundary) return null;
  const today = (typeof now === "string" ? now : now.toISOString()).slice(0, 10);
  const key = Object.entries(ctx.deadlines).find(([, v]) => v === ctx.nextBoundary)?.[0];
  const daysUntil = Math.round(
    (Date.parse(ctx.nextBoundary) - Date.parse(today)) / 86_400_000,
  );
  return {
    label: (key && DEADLINE_LABELS[key]) ?? "next deadline",
    date: ctx.nextBoundary,
    daysUntil,
  };
}
