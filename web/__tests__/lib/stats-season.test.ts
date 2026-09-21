/**
 * Unit tests for the stats-season clamp.
 *
 * The bug this guards: `getStatsSeason()` flips to the new league season on
 * `regular_season_start`, but `player_stats` only gets rows for that season
 * once `pull_player_stats` has run for it. In the gap, every consumer of
 * `fetchPlayers*` dropped every player (`if (!pStats) continue`) and the
 * analysis pages rendered empty — observed live in week 2 of 2026.
 */

import { clampStatsSeason } from "@/lib/stats-season";

describe("clampStatsSeason", () => {
    it("falls back to the newest loaded season when the target has no rows", () => {
        // The live 2026 week-2 case: calendar says 2026, table tops out at 2025.
        expect(clampStatsSeason(2026, 2025)).toBe(2025);
    });

    it("uses the target season once that season has rows", () => {
        // Partial in-season data is a real view, not a gap — no clamp.
        expect(clampStatsSeason(2026, 2026)).toBe(2026);
    });

    it("never jumps the season cycle forward past the calendar", () => {
        // Someone backfilling 2027 ahead of the rollover must not drag the
        // whole site into a season the league has not started.
        expect(clampStatsSeason(2026, 2027)).toBe(2026);
    });

    it("passes the target through when the table is empty", () => {
        // Nothing to clamp to; the caller's own empty state is the right answer.
        expect(clampStatsSeason(2026, null)).toBe(2026);
    });

    it("falls back across a multi-season gap", () => {
        expect(clampStatsSeason(2026, 2023)).toBe(2023);
    });
});
