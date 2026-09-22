/**
 * Earned value on the player hover card, and the gate in front of it.
 *
 * Earned value is a dollar valuation, so it belongs behind the same
 * `hasProjectionsAccess` gate as every other one (PROJECTIONS_ROUTES in
 * lib/access.ts). Hover cards render on public routes too — `/arb-progress` is
 * not in that list — so `buildHoverDataMap` defaults the field OFF and callers
 * opt in. These tests pin that default, because getting it wrong leaks a gated
 * number onto a public page rather than throwing anything.
 */
import { buildHoverDataMap } from "@/lib/analysis";
import { MIN_PLAYER_SALARY, NUM_TEAMS } from "@/lib/config";
import type { Player } from "@/lib/types";

jest.mock("@/lib/supabase", () => ({
    supabase: {},
    fetchAllRows: jest.fn(),
    getSupabaseAdmin: jest.fn(),
}));

function makePlayer(overrides: Partial<Player> & { player_id: string }): Player {
    return {
        ottoneu_id: 1,
        name: overrides.player_id,
        position: "RB",
        nfl_team: "ANY",
        birth_date: null,
        is_college: false,
        price: 1,
        team_name: null,
        total_points: 0,
        games_played: 16,
        snaps: 0,
        ppg: 0,
        pps: 0,
        ...overrides,
    };
}

/** A league-wide pool deep enough that no baseline has to clamp. */
function pool(): Player[] {
    const shape: [string, number, number, number][] = [
        ["QB", 40, 400, 5],
        ["RB", 60, 320, 4],
        ["WR", 70, 300, 3],
        ["TE", 30, 220, 6],
    ];
    const out: Player[] = [];
    let i = 0;
    for (const [position, count, top, step] of shape) {
        for (let n = 0; n < count; n++) {
            const points = top - n * step;
            out.push(
                makePlayer({
                    player_id: `${position}${n}`,
                    ottoneu_id: ++i,
                    position,
                    total_points: points,
                    ppg: points / 16,
                    price: Math.max(1, 50 - n),
                    team_name: `Team ${n % NUM_TEAMS}`,
                }),
            );
        }
    }
    return out;
}

describe("buildHoverDataMap — earned value gating", () => {
    test("omits earned value by default", () => {
        const map = buildHoverDataMap(pool());
        expect(map["QB0"].earned_value).toBeUndefined();
    });

    test("omits it when the viewer lacks projections access", () => {
        const map = buildHoverDataMap(pool(), null, null, false);
        for (const entry of Object.values(map)) {
            expect(entry.earned_value).toBeUndefined();
        }
    });

    test("includes it when the caller opts in", () => {
        const map = buildHoverDataMap(pool(), null, null, true);
        expect(map["QB0"].earned_value).toBeGreaterThan(MIN_PLAYER_SALARY);
    });
});

describe("buildHoverDataMap — earned value content", () => {
    test("the best player at a position is worth more than a worse one", () => {
        const map = buildHoverDataMap(pool(), null, null, true);
        expect(map["RB0"].earned_value!).toBeGreaterThan(map["RB20"].earned_value!);
    });

    test("a below-replacement player carries the salary floor", () => {
        const map = buildHoverDataMap(pool(), null, null, true);
        expect(map["WR69"].earned_value).toBe(MIN_PLAYER_SALARY);
    });

    test("kickers get no earned value — they are excluded from the valuation", () => {
        const withKicker = [
            ...pool(),
            makePlayer({ player_id: "K1", ottoneu_id: 9999, position: "K", total_points: 180 }),
        ];
        const map = buildHoverDataMap(withKicker, null, null, true);
        expect(map["K1"].earned_value).toBeUndefined();
        // …but the kicker still appears on the card, with his other fields.
        expect(map["K1"].position).toBe("K");
    });

    test("leaves the other hover fields untouched", () => {
        const plain = buildHoverDataMap(pool(), null, null, false);
        const withEarned = buildHoverDataMap(pool(), null, null, true);
        const { earned_value, ...rest } = withEarned["RB5"];
        expect(earned_value).toBeDefined();
        expect(rest).toEqual(plain["RB5"]);
    });
});
