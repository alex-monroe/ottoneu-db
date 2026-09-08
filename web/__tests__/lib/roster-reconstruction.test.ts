/**
 * Unit tests for roster-reconstruction.ts — pure reconstruction algorithm.
 *
 * Tests reconstructRostersAtDate with mock transaction/player/stats data.
 */

// Mock the supabase client to prevent real initialization
jest.mock("@/lib/supabase", () => ({
    supabase: {},
}));

import {
    reconstructRostersAtDate,
    getRosterForTeam,
    currentTeamByPlayer,
} from "@/lib/roster-reconstruction";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayers() {
    return [
        { id: "p1", name: "Josh Allen", position: "QB", nfl_team: "BUF" },
        { id: "p2", name: "Saquon Barkley", position: "RB", nfl_team: "PHI" },
        { id: "p3", name: "CeeDee Lamb", position: "WR", nfl_team: "DAL" },
    ];
}

function makeStats() {
    return [
        { player_id: "p1", ppg: 22.5, pps: 0.6, games_played: 16, snaps: 600 },
        { player_id: "p2", ppg: 18.0, pps: 0.5, games_played: 15, snaps: 500 },
        { player_id: "p3", ppg: 16.0, pps: 0.4, games_played: 14, snaps: 480 },
    ];
}

// ---------------------------------------------------------------------------
// reconstructRostersAtDate
// ---------------------------------------------------------------------------

describe("reconstructRostersAtDate", () => {
    it("builds rosters from add transactions", () => {
        const transactions = [
            { player_id: "p1", transaction_type: "Add", team_name: "Team A", salary: 50, transaction_date: "2025-09-01" },
            { player_id: "p2", transaction_type: "Add", team_name: "Team B", salary: 30, transaction_date: "2025-09-01" },
        ];
        const result = reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2025-12-01");
        expect(result).toHaveLength(2);
        const teamA = getRosterForTeam(result, "Team A");
        expect(teamA).toBeDefined();
        expect(teamA!.players).toHaveLength(1);
        expect(teamA!.players[0].name).toBe("Josh Allen");
        expect(teamA!.players[0].salary).toBe(50);
    });

    it("handles cut transactions — player removed from roster", () => {
        const transactions = [
            { player_id: "p1", transaction_type: "Add", team_name: "Team A", salary: 50, transaction_date: "2025-09-01" },
            { player_id: "p1", transaction_type: "Cut", team_name: null, salary: 50, transaction_date: "2025-10-01" },
        ];
        const result = reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2025-12-01");
        const teamA = getRosterForTeam(result, "Team A");
        // Player was cut, so Team A shouldn't have them (or team_name is null)
        expect(teamA).toBeUndefined();
    });

    it("handles re-add after cut", () => {
        const transactions = [
            { player_id: "p1", transaction_type: "Add", team_name: "Team A", salary: 50, transaction_date: "2025-09-01" },
            { player_id: "p1", transaction_type: "Cut", team_name: null, salary: 50, transaction_date: "2025-10-01" },
            { player_id: "p1", transaction_type: "Auction Won", team_name: "Team B", salary: 35, transaction_date: "2025-11-01" },
        ];
        const result = reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2025-12-01");
        const teamB = getRosterForTeam(result, "Team B");
        expect(teamB).toBeDefined();
        expect(teamB!.players[0].name).toBe("Josh Allen");
        expect(teamB!.players[0].salary).toBe(35);
    });

    it("respects date boundary — ignores future transactions", () => {
        const transactions = [
            { player_id: "p1", transaction_type: "Add", team_name: "Team A", salary: 50, transaction_date: "2025-09-01" },
            { player_id: "p2", transaction_type: "Add", team_name: "Team A", salary: 30, transaction_date: "2025-11-15" },
        ];
        const result = reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2025-10-01");
        const teamA = getRosterForTeam(result, "Team A");
        expect(teamA!.players).toHaveLength(1);
        expect(teamA!.players[0].name).toBe("Josh Allen");
    });

    it("calculates cap space correctly", () => {
        const transactions = [
            { player_id: "p1", transaction_type: "Add", team_name: "Team A", salary: 50, transaction_date: "2025-09-01" },
            { player_id: "p2", transaction_type: "Add", team_name: "Team A", salary: 30, transaction_date: "2025-09-02" },
        ];
        const result = reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2025-12-01");
        const teamA = getRosterForTeam(result, "Team A");
        expect(teamA!.total_salary).toBe(80);
        expect(teamA!.cap_space).toBe(400 - 80); // CAP_PER_TEAM = 400
    });

    it("attaches stats to roster entries", () => {
        const transactions = [
            { player_id: "p1", transaction_type: "Add", team_name: "Team A", salary: 50, transaction_date: "2025-09-01" },
        ];
        const result = reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2025-12-01");
        const player = getRosterForTeam(result, "Team A")!.players[0];
        expect(player.ppg).toBe(22.5);
        expect(player.games_played).toBe(16);
    });

    it("handles transactions with null date (skips them)", () => {
        const transactions = [
            { player_id: "p1", transaction_type: "Add", team_name: "Team A", salary: 50, transaction_date: null },
        ];
        const result = reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2025-12-01");
        expect(result).toHaveLength(0);
    });

    it("handles empty transactions", () => {
        const result = reconstructRostersAtDate([], makePlayers(), makeStats(), "2025-12-01");
        expect(result).toHaveLength(0);
    });

    it("rosters are sorted alphabetically by team name", () => {
        const transactions = [
            { player_id: "p1", transaction_type: "Add", team_name: "Zebra FC", salary: 50, transaction_date: "2025-09-01" },
            { player_id: "p2", transaction_type: "Add", team_name: "Alpha FC", salary: 30, transaction_date: "2025-09-01" },
        ];
        const result = reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2025-12-01");
        expect(result[0].team_name).toBe("Alpha FC");
        expect(result[1].team_name).toBe("Zebra FC");
    });

    it("handles waiver/signed/rostered transaction types", () => {
        const transactions = [
            { player_id: "p1", transaction_type: "Waiver Claim", team_name: "Team A", salary: 10, transaction_date: "2025-09-01" },
            { player_id: "p2", transaction_type: "Signed", team_name: "Team B", salary: 5, transaction_date: "2025-09-01" },
            { player_id: "p3", transaction_type: "Rostered", team_name: "Team C", salary: 15, transaction_date: "2025-09-01" },
        ];
        const result = reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2025-12-01");
        expect(result).toHaveLength(3);
    });

    it("uses league_prices for current salaries when targetDate is today", () => {
        const today = new Date().toISOString().slice(0, 10);
        const transactions = [
            { player_id: "p1", transaction_type: "Add", team_name: "Team A", salary: 50, transaction_date: "2025-09-01" },
            { player_id: "p2", transaction_type: "Add", team_name: "Team A", salary: 30, transaction_date: "2025-09-01" },
        ];
        const leaguePrices = [
            { player_id: "p1", price: 54, team_name: "Team A" },
            { player_id: "p2", price: 31, team_name: "Team B" }, // traded to Team B with new salary
        ];
        const result = reconstructRostersAtDate(transactions, makePlayers(), makeStats(), today, leaguePrices);
        const teamA = getRosterForTeam(result, "Team A");
        expect(teamA).toBeDefined();
        expect(teamA!.players).toHaveLength(1);
        expect(teamA!.players[0].salary).toBe(54); // league_prices salary, not transaction salary
        const teamB = getRosterForTeam(result, "Team B");
        expect(teamB).toBeDefined();
        expect(teamB!.players[0].salary).toBe(31);
    });

    it("re-prices a roster spot on a salary event without resetting the acquisition", () => {
        // Ottoneu logs the January raise and arbitration as their own events
        // carrying the *new* salary, not a delta.
        const transactions = [
            { player_id: "p1", transaction_type: "Add", team_name: "Team A", salary: 16, transaction_date: "2025-08-24" },
            { player_id: "p1", transaction_type: "increase", team_name: "Team A", salary: 20, transaction_date: "2026-01-05" },
            { player_id: "p1", transaction_type: "increase", team_name: "Team A", salary: 31, transaction_date: "2026-04-01" },
        ];
        const before = getRosterForTeam(
            reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2026-01-04"),
            "Team A",
        );
        expect(before!.players[0].salary).toBe(16);

        const after = getRosterForTeam(
            reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2026-05-01"),
            "Team A",
        );
        expect(after!.players[0].salary).toBe(31);
        // The raise is not an acquisition — the add is still what put him here.
        expect(after!.players[0].acquired_date).toBe("2025-08-24");
        expect(after!.players[0].acquisition_type).toBe("Add");
    });

    it("keeps a player rostered across the season rollover with no new add", () => {
        // A keeper carried into the next season has no acquisition row that
        // season, so a replay that started at the rollover would lose him.
        const transactions = [
            { player_id: "p1", transaction_type: "Add", team_name: "Team A", salary: 16, transaction_date: "2025-08-24" },
            { player_id: "p2", transaction_type: "Add", team_name: "Team A", salary: 30, transaction_date: "2025-08-24" },
            { player_id: "p2", transaction_type: "cut", team_name: "Team A", salary: 30, transaction_date: "2026-02-10" },
        ];
        const result = getRosterForTeam(
            reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2026-06-01"),
            "Team A",
        );
        expect(result!.players.map((p) => p.name)).toEqual(["Josh Allen"]);
    });

    it("treats a salary event as evidence of tenure when history starts mid-stream", () => {
        const transactions = [
            { player_id: "p1", transaction_type: "increase", team_name: "Team A", salary: 20, transaction_date: "2026-01-05" },
        ];
        const result = getRosterForTeam(
            reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2026-06-01"),
            "Team A",
        );
        expect(result!.players[0].salary).toBe(20);
    });

    it("does not treat a salary event as the acquisition on the current roster", () => {
        // Regression: the current-roster view took the latest non-cut row, so
        // the April arbitration raise showed as every kept player's "Acquired".
        const today = new Date().toISOString().slice(0, 10);
        const transactions = [
            { player_id: "p1", transaction_type: "add", team_name: "Team A", salary: 16, transaction_date: "2024-09-03" },
            { player_id: "p1", transaction_type: "increase", team_name: "Team A", salary: 20, transaction_date: "2026-01-05" },
            { player_id: "p1", transaction_type: "increase", team_name: "Team A", salary: 31, transaction_date: "2026-04-01" },
        ];
        const leaguePrices = [{ player_id: "p1", price: 31, team_name: "Team A" }];
        const player = getRosterForTeam(
            reconstructRostersAtDate(transactions, makePlayers(), makeStats(), today, leaguePrices),
            "Team A",
        )!.players[0];
        expect(player.acquired_date).toBe("2024-09-03");
        expect(player.acquisition_type).toBe("add");
        expect(player.salary).toBe(31); // still the current league_prices salary
    });

    it("still uses the most recent acquisition on the current roster", () => {
        const today = new Date().toISOString().slice(0, 10);
        const transactions = [
            { player_id: "p1", transaction_type: "add", team_name: "Team B", salary: 16, transaction_date: "2024-09-03" },
            { player_id: "p1", transaction_type: "increase", team_name: "Team B", salary: 20, transaction_date: "2026-01-05" },
            { player_id: "p1", transaction_type: "move (from Team B)", team_name: "Team A", salary: 20, transaction_date: "2026-05-20" },
        ];
        const leaguePrices = [{ player_id: "p1", price: 20, team_name: "Team A" }];
        const player = getRosterForTeam(
            reconstructRostersAtDate(transactions, makePlayers(), makeStats(), today, leaguePrices),
            "Team A",
        )!.players[0];
        expect(player.acquired_date).toBe("2026-05-20");
        expect(player.acquisition_type).toBe("move (from Team B)");
    });

    it("falls back to the earliest salary event when history starts mid-tenure", () => {
        const today = new Date().toISOString().slice(0, 10);
        const transactions = [
            { player_id: "p1", transaction_type: "increase", team_name: "Team A", salary: 20, transaction_date: "2026-01-05" },
            { player_id: "p1", transaction_type: "increase", team_name: "Team A", salary: 31, transaction_date: "2026-04-01" },
        ];
        const leaguePrices = [{ player_id: "p1", price: 31, team_name: "Team A" }];
        const player = getRosterForTeam(
            reconstructRostersAtDate(transactions, makePlayers(), makeStats(), today, leaguePrices),
            "Team A",
        )!.players[0];
        // No acquisition on record, so the oldest date we can prove he was held.
        expect(player.acquired_date).toBe("2026-01-05");
    });

    it("falls back to transaction replay for historical dates even with league_prices", () => {
        const leaguePrices = [
            { player_id: "p1", price: 54, team_name: "Team A" },
        ];
        const transactions = [
            { player_id: "p1", transaction_type: "Add", team_name: "Team A", salary: 50, transaction_date: "2025-09-01" },
        ];
        const result = reconstructRostersAtDate(transactions, makePlayers(), makeStats(), "2025-10-01", leaguePrices);
        const teamA = getRosterForTeam(result, "Team A");
        expect(teamA!.players[0].salary).toBe(50); // transaction salary, not league_prices
    });
});

// ---------------------------------------------------------------------------
// getRosterForTeam
// ---------------------------------------------------------------------------

describe("getRosterForTeam", () => {
    it("returns undefined for non-existent team", () => {
        expect(getRosterForTeam([], "Nonexistent")).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// currentTeamByPlayer
// ---------------------------------------------------------------------------

describe("currentTeamByPlayer", () => {
    it("maps rostered players to their owning team", () => {
        const owners = currentTeamByPlayer([
            { player_id: "p1", price: 50, team_name: "Team A" },
            { player_id: "p2", price: 30, team_name: "Team B" },
        ]);
        expect(owners.get("p1")).toBe("Team A");
        expect(owners.get("p2")).toBe("Team B");
    });

    it("omits free agents — null, empty and the literal \"FA\"", () => {
        const owners = currentTeamByPlayer([
            { player_id: "p1", price: 0, team_name: null },
            { player_id: "p2", price: 0, team_name: "" },
            { player_id: "p3", price: 0, team_name: "FA" },
        ]);
        expect(owners.size).toBe(0);
        expect(owners.has("p1")).toBe(false);
        expect(owners.has("p2")).toBe(false);
        expect(owners.has("p3")).toBe(false);
    });

    it("keeps a rostered player whose price is missing", () => {
        // Ownership is a roster question, not a salary question: a row that
        // names a team is rostered even if the price never landed.
        const owners = currentTeamByPlayer([
            { player_id: "p1", price: null, team_name: "Team A" },
        ]);
        expect(owners.get("p1")).toBe("Team A");
    });

    /**
     * Regression (Derrick Henry): cut in December, re-drafted in August's
     * auction. Replaying transactions to the end-of-season salary snapshot —
     * which is what `fetchPlayersEndOfSeason` does, and what the free-agents
     * page used to filter on — leaves him a free agent, while the league (and
     * his player card) has him rostered. Ownership must come from the current
     * roster state, so the two pages cannot disagree.
     */
    it("reports the current owner of a player who was a free agent at the snapshot date", () => {
        const transactions = [
            { player_id: "p1", transaction_type: "Add", team_name: "Team A", salary: 64, transaction_date: "2025-08-24" },
            { player_id: "p1", transaction_type: "Cut", team_name: "Team A", salary: 32, transaction_date: "2025-12-31" },
            { player_id: "p1", transaction_type: "Add", team_name: "Team B", salary: 54, transaction_date: "2026-08-22" },
        ];
        const leaguePrices = [{ player_id: "p1", price: 54, team_name: "Team B" }];

        // The snapshot the surplus math runs on says nobody holds him...
        const atSnapshot = reconstructRostersAtDate(
            transactions,
            makePlayers(),
            makeStats(),
            "2026-01-02",
            leaguePrices,
        );
        expect(atSnapshot).toHaveLength(0);

        // ...but he is rostered today, and that is what ownership must follow.
        expect(currentTeamByPlayer(leaguePrices).get("p1")).toBe("Team B");
    });
});
