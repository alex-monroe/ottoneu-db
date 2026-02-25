import { render, screen, fireEvent } from "@testing-library/react";
import PlayerSearch from "@/components/PlayerSearch";
import { PlayerListItem } from "@/lib/types";

// Mock data
const mockPlayers: PlayerListItem[] = [
    {
        id: "1",
        ottoneu_id: 101,
        name: "Player One",
        position: "QB",
        nfl_team: "KC",
        price: 10,
        team_name: "Team A",
        total_points: 300.0,
        ppg: 20.5,
        games_played: 15,
    },
    {
        id: "2",
        ottoneu_id: 102,
        name: "Player Two",
        position: "RB",
        nfl_team: "SF",
        price: 20,
        team_name: "Team B",
        total_points: 200.0,
        ppg: 15.0,
        games_played: 14,
    },
    {
        id: "3",
        ottoneu_id: 103,
        name: "Player Three",
        position: "WR",
        nfl_team: "BUF",
        price: null,
        team_name: null, // Free Agent
        total_points: null,
        ppg: null,
        games_played: 0,
    },
];

describe("PlayerSearch", () => {
    it("renders search input and initial list", () => {
        render(<PlayerSearch players={mockPlayers} />);

        // Check for search input
        expect(screen.getByRole("textbox")).toBeInTheDocument();

        // Check for player names
        expect(screen.getByText("Player One")).toBeInTheDocument();
        expect(screen.getByText("Player Two")).toBeInTheDocument();
        expect(screen.getByText("Player Three")).toBeInTheDocument();
    });

    it("filters by name", () => {
        render(<PlayerSearch players={mockPlayers} />);

        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "One" } });

        expect(screen.getByText("Player One")).toBeInTheDocument();
        expect(screen.queryByText("Player Two")).not.toBeInTheDocument();
    });

    it("filters by position", () => {
        render(<PlayerSearch players={mockPlayers} />);

        // Assuming buttons will be identifiable by text content
        const qbButton = screen.getByText("QB");
        fireEvent.click(qbButton);

        expect(screen.getByText("Player One")).toBeInTheDocument();
        expect(screen.queryByText("Player Two")).not.toBeInTheDocument();
    });

    it("clears search when clear button is clicked", () => {
        render(<PlayerSearch players={mockPlayers} />);

        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "One" } });

        // Check that only Player One is visible
        expect(screen.queryByText("Player Two")).not.toBeInTheDocument();

        // Find and click clear button (using aria-label we plan to add)
        const clearButton = screen.getByLabelText("Clear search");
        fireEvent.click(clearButton);

        // Check input is empty
        expect(input).toHaveValue("");

        // Check that Player Two is back
        expect(screen.getByText("Player Two")).toBeInTheDocument();
    });

    it("shows empty state when no matches found", () => {
        render(<PlayerSearch players={mockPlayers} />);

        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "NonExistent" } });

        expect(screen.getByText(/no players found/i)).toBeInTheDocument();
    });
});
