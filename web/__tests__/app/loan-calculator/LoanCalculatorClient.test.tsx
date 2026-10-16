/**
 * Component test for the loan-trade calculator: nothing is valued until there
 * is a trade, picking players and a loan produces both sides' valuations, and
 * the two team pickers can never name the same team.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import LoanCalculatorClient from "@/app/loan-calculator/LoanCalculatorClient";
import type { LoanTradePlayer } from "@/lib/loan-trade";
import type { Matchup } from "@/lib/standings";

const teams = ["Alpha", "Bravo", "Charlie", "Delta"];
const positions = ["QB", "QB", "RB", "RB", "RB", "WR", "WR", "WR", "TE", "K"];
const players: LoanTradePlayer[] = teams.flatMap((team, t) =>
  positions.map((position, i) => ({
    player_id: `${team}-${i}`,
    name: `${team} ${position} ${i}`,
    position,
    nfl_team: "FA",
    team_name: team,
    salary: 5 + i,
    ppg: 8 + t + (i % 3),
    dollar_value: 10 + i,
  })),
);

const matchups: Matchup[] = [1, 2, 3].flatMap((week) => [
  [teams[0], teams[week]],
  [teams[(week % 3) + 1], teams[((week + 1) % 3) + 1]],
].map(([home, away], i) => ({
  game_id: week * 10 + i,
  season: 2026,
  week,
  home_team_id: 0,
  home_team_name: home,
  home_score: null,
  away_team_id: 0,
  away_team_name: away,
  away_score: null,
  status: "scheduled" as const,
  game_type: "regular" as const,
  starts_on: null,
  ends_on: null,
  status_label: null,
})));

function setup() {
  render(
    <LoanCalculatorClient
      players={players}
      matchups={matchups}
      season={2026}
      viewerTeam="Delta"
      capPerTeam={400}
      annualRaise={4}
      weeklySd={20}
      weeklySdMeasured={false}
    />,
  );
}

describe("LoanCalculatorClient", () => {
  it("starts from the viewer's team as borrower and values nothing yet", () => {
    setup();
    expect(screen.getByLabelText("Borrower (receives cap)")).toHaveValue("Delta");
    expect(screen.getByLabelText("Lender (sends cap)")).toHaveValue("Alpha");
    expect(screen.queryByText("What it's worth")).not.toBeInTheDocument();
  });

  it("values both sides once a trade is entered", () => {
    setup();
    fireEvent.click(screen.getByLabelText(/Alpha WR 5/));
    fireEvent.click(screen.getByLabelText(/Delta QB 1/));
    fireEvent.change(screen.getByLabelText("Loan"), { target: { value: "40" } });

    expect(screen.getByText("What it's worth")).toBeInTheDocument();
    expect(screen.getByText("Borrower")).toBeInTheDocument();
    expect(screen.getByText("Lender")).toBeInTheDocument();
    expect(screen.getByText(/of keeper value for \$40 of cap/)).toBeInTheDocument();
    // The lender's cap drops by the loan; the borrower's rises.
    expect(screen.getByText(/of \$440$/)).toBeInTheDocument();
    expect(screen.getByText(/of \$360$/)).toBeInTheDocument();
  });

  it("swaps rather than letting both pickers name one team", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Lender (sends cap)"), { target: { value: "Delta" } });
    expect(screen.getByLabelText("Lender (sends cap)")).toHaveValue("Delta");
    expect(screen.getByLabelText("Borrower (receives cap)")).not.toHaveValue("Delta");
  });
});
