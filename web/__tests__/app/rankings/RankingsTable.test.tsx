import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import RankingsTable, { type RankingRow } from "@/app/rankings/RankingsTable";

function row(id: string, total_points: number, games_played: number, rank: number): RankingRow {
  return {
    player_id: id,
    ottoneu_id: rank,
    name: id,
    position: "WR",
    nfl_team: "ANY",
    team_name: null,
    price: 0,
    rank,
    positional_rank: { position: "WR", rank, of: 3, season: 2026 },
    games_played,
    total_points,
    ppg: total_points / games_played,
  };
}

// Ranked by total points: volume (60 over 4), steady (45 over 3), cameo (25 over 1).
const rows = [row("volume", 60, 4, 1), row("steady", 45, 3, 2), row("cameo", 25, 1, 3)];

function names(): string[] {
  return screen.getAllByRole("link").map((a) => a.textContent ?? "");
}

function renderTable(initialSort: "points" | "ppg" = "points", initialMinGames = 1) {
  return render(
    <RankingsTable
      rows={rows}
      hoverDataMap={{}}
      season={2026}
      maxGames={4}
      initialSort={initialSort}
      initialMinGames={initialMinGames}
    />,
  );
}

beforeEach(() => window.history.replaceState(null, "", "/rankings?pos=WR"));

test("defaults to total points, with no games slider", () => {
  renderTable();
  expect(names()).toEqual(["volume", "steady", "cameo"]);
  expect(screen.queryByLabelText("Minimum games")).not.toBeInTheDocument();
});

test("PPG re-ranks by rate and records the choice in the URL", () => {
  renderTable();
  fireEvent.click(screen.getByRole("button", { name: "PPG" }));
  // 25.0 > 15.0 = 15.0; the tie goes to more total points.
  expect(names()).toEqual(["cameo", "volume", "steady"]);
  expect(screen.getByText("WR1")).toBeInTheDocument();
  expect(window.location.search).toBe("?pos=WR&sort=ppg&min=1");
});

test("the slider drops players under the floor and re-numbers the rest", () => {
  renderTable("ppg", 1);
  fireEvent.change(screen.getByLabelText("Minimum games"), { target: { value: "3" } });
  expect(names()).toEqual(["volume", "steady"]);
  expect(screen.getByText(/2 of 3 players with at least 3 games/)).toBeInTheDocument();
  expect(window.location.search).toBe("?pos=WR&sort=ppg&min=3");
});

test("going back to total points clears the params", () => {
  renderTable("ppg", 2);
  fireEvent.click(screen.getByRole("button", { name: "Total points" }));
  expect(names()).toEqual(["volume", "steady", "cameo"]);
  expect(window.location.search).toBe("?pos=WR");
});
