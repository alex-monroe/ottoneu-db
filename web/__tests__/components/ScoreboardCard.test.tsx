/**
 * A scoreboard card leads with ESPN's live score during a live week and shows
 * Ottoneu's own score small beneath it.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import ScoreboardCard from "@/components/ScoreboardCard";
import type { Matchup } from "@/lib/standings";

jest.mock("@/components/TeamName", () => ({
  __esModule: true,
  default: ({ name }: { name: string }) => <span>{name}</span>,
}));

const matchup = {
  game_id: 7,
  week: 8,
  game_type: "regular",
  home_team_name: "Alpha",
  away_team_name: "Beta",
  home_score: 44.6,
  away_score: 99.88,
  status: "in_progress",
  status_label: "In progress",
} as unknown as Matchup;

describe("ScoreboardCard", () => {
  it("shows the schedule's score with no live score", () => {
    render(<ScoreboardCard matchup={matchup} />);
    expect(screen.getByText("44.60")).toBeInTheDocument();
    expect(screen.queryByText(/Ottoneu/)).toBeNull();
  });

  it("leads with the live score and shows Ottoneu's beneath", () => {
    render(
      <ScoreboardCard
        matchup={matchup}
        score={{
          home: 51.6,
          away: 104.46,
          official: { home: 44.6, away: 99.88 },
          liveAt: "2026-11-01T21:21:55Z",
        }}
      />,
    );
    expect(screen.getByText("51.60")).toBeInTheDocument();
    expect(screen.getByText("104.46")).toBeInTheDocument();
    expect(screen.getByText("Live · Ottoneu 44.60 – 99.88")).toBeInTheDocument();
  });

  it("shows a live score even while the schedule still says scheduled", () => {
    render(
      <ScoreboardCard
        matchup={{ ...matchup, status: "scheduled" } as Matchup}
        score={{ home: 3, away: 0, official: { home: 0, away: 0 }, liveAt: "2026-11-01T17:05:00Z" }}
      />,
    );
    expect(screen.getByText("3.00")).toBeInTheDocument();
  });
});
