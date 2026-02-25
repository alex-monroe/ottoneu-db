import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import PositionFilter from "@/components/PositionFilter";
import { Position, POSITIONS, POSITION_COLORS } from "@/lib/types";

describe("PositionFilter", () => {
    const mockOnToggle = jest.fn();
    const mockOnToggleAll = jest.fn();
    const positions: readonly Position[] = POSITIONS;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("renders all provided positions", () => {
        render(
            <PositionFilter
                positions={positions}
                selectedPositions={[]}
                onToggle={mockOnToggle}
            />
        );

        positions.forEach((pos) => {
            expect(screen.getByText(pos)).toBeInTheDocument();
        });
    });

    it("calls onToggle with the correct position when clicked", () => {
        render(
            <PositionFilter
                positions={positions}
                selectedPositions={[]}
                onToggle={mockOnToggle}
            />
        );

        fireEvent.click(screen.getByText("QB"));
        expect(mockOnToggle).toHaveBeenCalledWith("QB");

        fireEvent.click(screen.getByText("RB"));
        expect(mockOnToggle).toHaveBeenCalledWith("RB");
    });

    it("highlights selected positions with their specific colors", () => {
        const selected: Position[] = ["QB", "WR"];
        render(
            <PositionFilter
                positions={positions}
                selectedPositions={selected}
                onToggle={mockOnToggle}
            />
        );

        const qbButton = screen.getByText("QB");
        const wrButton = screen.getByText("WR");
        const rbButton = screen.getByText("RB");

        expect(qbButton).toHaveStyle(`background-color: ${POSITION_COLORS["QB"]}`);
        expect(wrButton).toHaveStyle(`background-color: ${POSITION_COLORS["WR"]}`);
        expect(rbButton).not.toHaveStyle("background-color");
    });

    it("does not render the All button when showAll is false", () => {
        render(
            <PositionFilter
                positions={positions}
                selectedPositions={[]}
                onToggle={mockOnToggle}
                showAll={false}
            />
        );

        expect(screen.queryByText("All")).not.toBeInTheDocument();
    });

    it("renders the All button when showAll is true and onToggleAll is provided", () => {
        render(
            <PositionFilter
                positions={positions}
                selectedPositions={[]}
                onToggle={mockOnToggle}
                showAll={true}
                onToggleAll={mockOnToggleAll}
            />
        );

        expect(screen.getByText("All")).toBeInTheDocument();
    });

    it("calls onToggleAll when the All button is clicked", () => {
        render(
            <PositionFilter
                positions={positions}
                selectedPositions={[]}
                onToggle={mockOnToggle}
                showAll={true}
                onToggleAll={mockOnToggleAll}
            />
        );

        fireEvent.click(screen.getByText("All"));
        expect(mockOnToggleAll).toHaveBeenCalledTimes(1);
    });

    it("highlights the All button when all positions are selected", () => {
        render(
            <PositionFilter
                positions={positions}
                selectedPositions={[...positions]}
                onToggle={mockOnToggle}
                showAll={true}
                onToggleAll={mockOnToggleAll}
            />
        );

        const allButton = screen.getByText("All");
        expect(allButton).toHaveClass("bg-slate-700");
    });

    it("does not highlight the All button when only some positions are selected", () => {
        render(
            <PositionFilter
                positions={positions}
                selectedPositions={["QB"]}
                onToggle={mockOnToggle}
                showAll={true}
                onToggleAll={mockOnToggleAll}
            />
        );

        const allButton = screen.getByText("All");
        expect(allButton).not.toHaveClass("bg-slate-700");
        expect(allButton).toHaveClass("bg-transparent");
    });
});
