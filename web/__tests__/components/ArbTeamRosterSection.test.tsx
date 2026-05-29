import "@testing-library/jest-dom";
import { render, screen, fireEvent, within } from "@testing-library/react";
import TeamRosterSection from "@/components/arb-planner/TeamRosterSection";
import type { ArbPlannerPlayer } from "@/components/arb-planner/types";

const player: ArbPlannerPlayer = {
  player_id: "p1",
  ottoneu_id: 123,
  name: "Test Player",
  position: "RB",
  nfl_team: "KC",
  price: 10,
  team_name: "The Witchcraft",
  ppg: 12.5,
  games_played: 16,
  dollar_value: 18,
  surplus: 8,
};

function renderOpen(extra: Partial<React.ComponentProps<typeof TeamRosterSection>> = {}) {
  const onAllocationChange = jest.fn();
  render(
    <TeamRosterSection
      teamName="The Witchcraft"
      players={[player]}
      allocations={{}}
      teamAllocated={0}
      onAllocationChange={onAllocationChange}
      {...extra}
    />
  );
  // Section is collapsed by default — expand it.
  fireEvent.click(screen.getByText(/The Witchcraft/));
  return { onAllocationChange };
}

describe("shared arb-planner TeamRosterSection", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is collapsed by default and toggles open", () => {
    render(
      <TeamRosterSection
        teamName="The Witchcraft"
        players={[player]}
        allocations={{}}
        teamAllocated={0}
        onAllocationChange={jest.fn()}
      />
    );
    expect(screen.queryByText("Allocation")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/The Witchcraft/));
    expect(screen.getByText("Allocation")).toBeInTheDocument();
  });

  it("hides Value/Surplus columns in read-only (public) mode", () => {
    renderOpen();
    expect(screen.queryByText("Value")).not.toBeInTheDocument();
    expect(screen.queryByText("Surplus")).not.toBeInTheDocument();
    // PPG/GP/Salary always present
    expect(screen.getByText("PPG")).toBeInTheDocument();
    expect(screen.getByText("Salary")).toBeInTheDocument();
  });

  it("shows Value/Surplus columns when showSurplus is true (authed mode)", () => {
    renderOpen({ showSurplus: true });
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("Surplus")).toBeInTheDocument();
  });

  it("renders an Adj. Surplus column only when adjustedSurplus is provided", () => {
    const adjustedSurplus = new Map<string, number>([["p1", 11]]);
    renderOpen({ showSurplus: true, adjustedSurplus });
    expect(screen.getByText("Adj. Surplus")).toBeInTheDocument();
    expect(screen.getByText("$11")).toBeInTheDocument();
  });

  it("calls onAllocationChange clamped to 0-4", () => {
    const { onAllocationChange } = renderOpen();
    const input = screen.getByLabelText("Allocation for Test Player");
    fireEvent.change(input, { target: { value: "9" } });
    expect(onAllocationChange).toHaveBeenCalledWith("p1", 4);
    fireEvent.change(input, { target: { value: "3" } });
    expect(onAllocationChange).toHaveBeenCalledWith("p1", 3);
  });

  it("renders the player name as plain text in plain name mode (no link)", () => {
    renderOpen({ nameMode: "plain" });
    const cell = screen.getByText("Test Player");
    expect(within(cell.closest("td")!).queryByRole("link")).toBeNull();
  });
});
