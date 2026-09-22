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
        // 90 RBs, strictly descending in PPG. With RB the only position in the
        // pool it absorbs every contested slot, so leaguewide demand is
        // 12 × (2 starters + 1 flex + 2 depth) = 60 — well inside a 90-deep
        // pool, which puts the baseline at a real player rather than clamping
        // to the worst one.
        const players: Player[] = [];
        for (let i = 0; i < 90; i++) {
            const ppg = 50 - i * 0.5;
            players.push(
                makePlayer({
                    player_id: `rb${i}`,
                    position: "RB",
                    team_name: "Team A",
                    price: Math.max(1, 60 - i),
                    ppg,
                    games_played: 16,
                    total_points: ppg * 16,
                })
            );
        }
        const { players: result, replacementPpg, replacementN } = calculateVorp(players);

        expect(replacementN.RB).toBe(60);
        expect(replacementPpg.RB).toBeGreaterThan(0);
        // rb0 is the best RB — comfortably above replacement.
        expect(result.find((p) => p.player_id === "rb0")!.vorp_per_game).toBeGreaterThan(0);
        // rb89 is the worst — below it.
        const worst = result.find((p) => p.player_id === "rb89")!;
        expect(worst.vorp_per_game).toBeLessThan(0);
        expect(worst.full_season_vorp).toBeLessThan(0);
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

describe("calculateVorp — availability adjustment (#587 c2)", () => {
    test("projected_games discounts VORP but leaves displayed ppg untouched", () => {
        // Two identical 18-PPG RBs; one is projected for only 9 games.
        const players = [
            makePlayer({ player_id: "durable", position: "RB", ppg: 18, projected_games: 17 }),
            makePlayer({ player_id: "fragile", position: "RB", ppg: 18, projected_games: 9 }),
            // Replacement-tier filler so the fixed-rank fallback has a baseline.
            makePlayer({ player_id: "repl", position: "RB", ppg: 6, projected_games: 17 }),
        ];
        const { players: result } = calculateVorp(players);
        const durable = result.find((p) => p.player_id === "durable")!;
        const fragile = result.find((p) => p.player_id === "fragile")!;

        // Displayed rate (ppg) is the raw projection for both.
        expect(durable.ppg).toBe(18);
        expect(fragile.ppg).toBe(18);
        // But the fragile player's availability-adjusted value is lower.
        expect(fragile.vorp_per_game).toBeLessThan(durable.vorp_per_game);
        // Fragile per-game value ≈ 18×9/17 − replacement; durable ≈ 18 − replacement.
        expect(durable.vorp_per_game - fragile.vorp_per_game).toBeCloseTo(18 - (18 * 9) / 17, 1);
    });

    test("absent projected_games is a no-op (observed-PPG pages unaffected)", () => {
        const withGames = makePlayer({ player_id: "g", position: "WR", ppg: 14, projected_games: 17 });
        const without = makePlayer({ player_id: "n", position: "WR", ppg: 14 });
        const { players: a } = calculateVorp([withGames, makePlayer({ player_id: "r1", position: "WR", ppg: 5 })]);
        const { players: b } = calculateVorp([without, makePlayer({ player_id: "r2", position: "WR", ppg: 5 })]);
        // projected_games == 17 (full) and projected_games == undefined behave identically.
        expect(a.find((p) => p.player_id === "g")!.vorp_per_game)
            .toBeCloseTo(b.find((p) => p.player_id === "n")!.vorp_per_game, 5);
    });
});

describe("effectiveMinGames — the games floor a partial season can satisfy", () => {
    /**
     * The failure this prevents: `MIN_GAMES` is 4, and `pull-player-stats.yml`
     * now writes a `player_stats` row for the season being played. In week 2 no
     * player has four games, so a literal filter qualified nobody, `calculateVorp`
     * returned an empty pool, and /value, /free-agents and /projected-salary each
     * rendered a "no data" state over a table that was full.
     *
     * The clamp is derived from the rows rather than from a StatWindow on purpose,
     * so it protects every caller — including the ones that never learn windows
     * exist.
     */
    test("relaxes the floor to the deepest player in a two-game season", () => {
        const players = [
            makePlayer({ player_id: "a", position: "RB", ppg: 20, games_played: 2 }),
            makePlayer({ player_id: "b", position: "RB", ppg: 10, games_played: 2 }),
            makePlayer({ player_id: "c", position: "WR", ppg: 14, games_played: 1 }),
        ];
        const { players: result, minGamesApplied } = calculateVorp(players, 4);
        expect(minGamesApplied).toBe(2);
        // Not empty — which is the whole point.
        expect(result.map((p) => p.player_id).sort()).toEqual(["a", "b"]);
    });

    test("leaves the floor alone once the season is deep enough", () => {
        const players = [
            makePlayer({ player_id: "a", position: "RB", ppg: 20, games_played: 2 }),
            makePlayer({ player_id: "b", position: "RB", ppg: 10, games_played: 10 }),
        ];
        const { minGamesApplied } = calculateVorp(players, 4);
        expect(minGamesApplied).toBe(4);
    });

    test("is not dragged to zero by college prospects", () => {
        // Prospects carry no NFL games and bypass the filter anyway; letting them
        // set the ceiling would drop the floor to 0 and admit every one-game fluke.
        const players = [
            makePlayer({
                player_id: "prospect",
                position: "RB",
                ppg: 12,
                games_played: 0,
                is_college: true,
            }),
            makePlayer({ player_id: "a", position: "RB", ppg: 20, games_played: 9 }),
            makePlayer({ player_id: "b", position: "RB", ppg: 4, games_played: 1 }),
        ];
        const { players: result, minGamesApplied } = calculateVorp(players, 4);
        expect(minGamesApplied).toBe(4);
        expect(result.map((p) => p.player_id).sort()).toEqual(["a", "prospect"]);
    });

    test("falls back to the requested floor when nobody has played", () => {
        const players = [
            makePlayer({ player_id: "a", position: "RB", games_played: 0 }),
        ];
        expect(calculateVorp(players, 4).minGamesApplied).toBe(4);
    });
});
