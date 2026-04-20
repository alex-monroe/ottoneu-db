/**
 * Unit tests for calculateVorp — pure positional VORP calculation.
 *
 * Exercises both the salary-implied replacement path (rostered players with
 * enough data) and the fixed-rank fallback (sparse data or unrostered pools).
 */
import { calculateVorp } from "@/lib/vorp";
import type { Player } from "@/lib/types";

function makePlayer(overrides: Partial<Player> = {}): Player {
    return {
        player_id: overrides.player_id ?? "p",
        ottoneu_id: 1,
        name: overrides.name ?? "Player",
        position: overrides.position ?? "RB",
        nfl_team: "ANY",
        birth_date: null,
        is_college: false,
        price: overrides.price ?? 1,
        team_name: overrides.team_name ?? null,
        total_points: overrides.total_points ?? 0,
        games_played: overrides.games_played ?? 16,
        snaps: 0,
        ppg: overrides.ppg ?? 0,
        pps: 0,
        ...overrides,
    };
}

describe("calculateVorp — edge cases", () => {
    test("empty roster returns empty results", () => {
        const result = calculateVorp([]);
        expect(result.players).toEqual([]);
        expect(result.replacementPpg).toEqual({});
        expect(result.replacementN).toEqual({});
    });

    test("excludes kickers from VORP output", () => {
        const players = [
            makePlayer({ player_id: "k1", position: "K", ppg: 10 }),
            makePlayer({ player_id: "rb1", position: "RB", ppg: 15 }),
        ];
        const { players: result } = calculateVorp(players);
        expect(result).toHaveLength(1);
        expect(result[0].player_id).toBe("rb1");
    });

    test("excludes players below minGames threshold", () => {
        const players = [
            makePlayer({ player_id: "a", position: "RB", ppg: 20, games_played: 2 }),
            makePlayer({ player_id: "b", position: "RB", ppg: 10, games_played: 10 }),
        ];
        const { players: result } = calculateVorp(players, 4);
        expect(result.map((p) => p.player_id)).toEqual(["b"]);
    });

    test("includes college players even with 0 games", () => {
        const players = [
            makePlayer({
                player_id: "college",
                position: "RB",
                ppg: 8,
                games_played: 0,
                is_college: true,
            }),
            makePlayer({ player_id: "vet", position: "RB", ppg: 15, games_played: 16 }),
        ];
        const { players: result } = calculateVorp(players, 4);
        expect(result.map((p) => p.player_id).sort()).toEqual(["college", "vet"]);
    });

    test("single qualifying player — fallback assigns their own ppg as replacement", () => {
        const players = [makePlayer({ player_id: "only", position: "RB", ppg: 12 })];
        const { players: result, replacementPpg } = calculateVorp(players);

        expect(result).toHaveLength(1);
        // Fixed-rank fallback: only 1 RB, rank > length, so last player's ppg is used.
        expect(replacementPpg.RB).toBe(12);
        expect(result[0].vorp_per_game).toBe(0);
        expect(result[0].full_season_vorp).toBe(0);
    });

    test("player below replacement has negative VORP", () => {
        // 30 RBs rostered: 6 bottom-quartile at $1 with mixed ppg, 24 above.
        // Below-replacement player's ppg < replacement threshold.
        const players: Player[] = [];
        for (let i = 0; i < 30; i++) {
            players.push(
                makePlayer({
                    player_id: `rb${i}`,
                    position: "RB",
                    team_name: "Team A",
                    price: i < 8 ? 1 : 30 + i,
                    ppg: i < 8 ? 5 + i * 0.5 : 15 + i * 0.3,
                    games_played: 16,
                    total_points: (i < 8 ? 5 + i * 0.5 : 15 + i * 0.3) * 16,
                })
            );
        }
        const { players: result, replacementPpg } = calculateVorp(players);

        expect(replacementPpg.RB).toBeGreaterThan(0);
        const cheap = result.find((p) => p.player_id === "rb0")!;
        expect(cheap.vorp_per_game).toBeLessThan(0);
        expect(cheap.full_season_vorp).toBeLessThan(0);
    });

    test("rounds vorp_per_game to 2 decimals and full_season_vorp to 1 decimal", () => {
        const players = [
            makePlayer({ player_id: "a", position: "RB", ppg: 10.555 }),
            makePlayer({ player_id: "b", position: "RB", ppg: 20.123 }),
        ];
        const { players: result } = calculateVorp(players);
        for (const p of result) {
            expect(Math.round(p.vorp_per_game * 100) / 100).toBe(p.vorp_per_game);
            expect(Math.round(p.full_season_vorp * 10) / 10).toBe(p.full_season_vorp);
        }
    });
});
