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
    blurb: "NFL games are being played — track live value, lineups, and standings.",
    featuredLinks: ["/players", "/lineup"],
  },
  pre_arb: {
    label: "Pre-Arbitration",
    blurb: "Arbitration is upcoming — plan allocations off the season-long projections and watch the league's progress.",
    featuredGroup: "Offseason",
    featuredLinks: ["/projections", "/arbitration", "/arb-progress"],
  },
  pre_keeper: {
    label: "Pre-Keeper",
    blurb: "Keep-or-cut decisions ahead — weigh surplus value and projected salaries against the season-long projections.",
    featuredGroup: "Value",
    featuredLinks: ["/projections", "/value", "/projected-salary"],
  },
  pre_draft: {
    label: "Pre-Draft",
    blurb: "Auction prep — study projections and pre-draft roster snapshots.",
    featuredGroup: "Projections",
    featuredLinks: ["/projections", "/rosters"],
  },
  post_draft: {
    label: "Post-Draft",
    blurb: "The auction is done and rosters are set — review what the league paid and tune the roster before kickoff.",
    featuredGroup: "Value",
    featuredLinks: ["/rosters", "/value", "/players"],
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
