# Key User Journeys & Implementation Audit
**Date:** October 8, 2026

This report defines the key user journeys in the Ottoneu Fantasy Football platform and evaluates how well the current codebase handles them. 

This audit was conducted by reviewing the recent UX improvement plan (`docs/exec-plans/ux-journeys.md`) and assessing its successful implementation across the `web/` application.

## Overview
The application handles 9 key user journeys split across 4 distinct audiences (Anonymous, Signed-in Leaguemate, Operator, and MCP Agents). Historically, the app was a loosely connected set of data views, but the recent implementation of a unified design plan (Phases 0-5) has successfully connected these surfaces into a cohesive product.

Here are the key user journeys and an evaluation of their current handling:

### 1. The weekly in-season loop (J1)
**Goal:** Answer "Did I win? Who do I start? Who should I claim off waivers?" (Phase: `in_season`)
**Evaluation:** **Excellent.** 
With the recent UX improvements, this is handled very well. The `/lineup` page is now fully week-aware, reading out of `weekly_projections` instead of the season-long model. A dedicated `/matchup` page exists, showing the viewer's projected margin against their opponent. The addition of the `/free-agents` view fully closes the loop for waiver wire decisions. (Note: Injury/inactive feeds are still limited by the database schema, but are handled as gracefully as possible).

### 2. Look up a player (J2)
**Goal:** Assess a player's worth, model predictions, and current owner.
**Evaluation:** **Strong.**
The `GlobalPlayerSearch` is ubiquitous and responsive. Crucially, lateral navigation has been fixed: player cards now link directly to the player's owning team via `getViewerTeam()` integration, their surplus value row, their arbitration exposure, and weekly projections. The page is no longer a dead end.

### 3. The arbitration campaign (J3)
**Goal:** Figure out how to spend the $60 budget efficiently to steal value from opponents. (Phase: `pre_arb`)
**Evaluation:** **Excellent.**
This was already the strongest feature and remains so. The Monte Carlo simulation, persistence of `arbitration_plans`, and league-wide progress tracking (`/arb-progress`) make it a robust tool. The fix to use `getViewerTeam()` instead of the hardcoded `MY_TEAM` (The Witchcraft) ensures targets are properly personalized for each signed-in manager.

### 4. Keep or cut (J4)
**Goal:** Get under the salary cap after off-season raises. (Phase: `pre_keeper`)
**Evaluation:** **Good, but read-only.**
The system successfully scopes the cap space calculations to the viewer's actual team (using `getViewerTeam()`). The UI accurately reflects roster impact. The system deliberately excludes persisting keep/cut decisions (Design Decision D2), which forces users to record decisions off-platform (e.g., in a spreadsheet). While functioning as designed, this remains a slight friction point in the journey.

### 5. Auction prep and draft day (J5)
**Goal:** Test strategies against live valuations and generate tiers. (Phase: `pre_draft`)
**Evaluation:** **Good.**
The `/mock-draft` is an incredibly powerful real-time and sealed-bid simulator seeded by actual Draft Sharks data. However, it still largely operates in a vacuum—there is no native way to save a target list or tier sheet generated from `/projections` into the mock draft, or vice versa. The removal of the unrelated `/snake-draft` from the main nav improves focus.

### 6. Post-auction league review (J6)
**Goal:** Review league-wide spending and identify reaches/bargains. (Phase: `post_draft`)
**Evaluation:** **Adequate.**
The `/rosters` time-travel feature is technically brilliant, allowing you to reconstruct rosters at any timestamp. However, it still relies on manual cross-referencing to deduce the "biggest bargains" or team-level cap summaries. A dedicated post-draft diff/summary view would elevate this journey.

### 7. First visit and getting access (J7)
**Goal:** An invited leaguemate joins the platform and requests projections access.
**Evaluation:** **Excellent (Fixed).**
The previous infinite redirect loop bug has been squashed. A proper "access pending" state exists (`requireProjectionsAccess()`), locked features point clearly to `/access`, and operators are notified of new registrations. This is now a smooth onboarding flow.

### 8. Operator: is the data right? (J8)
**Goal:** The admin (A3) spot-checks features, pipeline freshness, and Vegas lines.
**Evaluation:** **Strong.**
Operator tooling has been successfully cordoned off into a dedicated "Data" navigation group, keeping developer-facing checks (`/vegas-lines`, `/depth-charts`, `/projection-accuracy`) out of the leaguemates' workflows. Data freshness stamps are surfaced across the app.

### 9. Agent access (MCP) (J9)
**Goal:** AI agents (A4) consume data via OAuth or API keys.
**Evaluation:** **Excellent.**
The `web/lib/mcp/tools.ts` surface exposes all critical data structures cleanly. The `team_name` schema upgrade ensures that agents querying data for a leaguemate will pull the appropriate viewer-relative rosters, rather than hardcoded `MY_TEAM` responses.

## Conclusion
The codebase does a fantastic job of supporting its key user journeys. The successful rollout of the `getViewerTeam()` primitive (replacing the hardcoded `MY_TEAM`) fundamentally transitioned the app from a personal operator tool to a true league-wide platform. Furthermore, the intelligent navigation grouping ("My Team", "League", "Players", "Analysis") and contextual UI (like the `phase` derived from `league_calendar`) mean the codebase understands what the user is trying to accomplish at any given time of the year.

**Next Steps for Future UX Improvement:**
1. **Target Lists:** Building a persistent "Target List" or "Tier Sheet" that spans across `/projections`, `/value`, and `/mock-draft` (J5).
2. **Draft Recap:** A generated "Draft Review" view that highlights league-wide diffs and superlatives (J6).
3. **Injury Integration:** A reliable data feed for injury/inactive status beyond missing projection inferences (J1).
