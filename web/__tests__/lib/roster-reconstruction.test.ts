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
} from "@/lib/roster-reconstruction";

import type {
    RosterData,
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
});

// ---------------------------------------------------------------------------
// getRosterForTeam
// ---------------------------------------------------------------------------

describe("getRosterForTeam", () => {
    it("returns undefined for non-existent team", () => {
        expect(getRosterForTeam([], "Nonexistent")).toBeUndefined();
    });
});
