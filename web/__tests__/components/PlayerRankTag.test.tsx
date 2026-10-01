/**
 * The rank tag beside player names. It comes from the root layout's
 * `PositionalRanksProvider`, so every list that renders `PlayerName` or a
 * hover card gets it without being passed anything.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import PlayerName from "@/components/PlayerName";
import PositionalRanksProvider from "@/components/PositionalRanksProvider";
import type { RankTable } from "@/lib/types";

const table: RankTable = {
  season: 2026,
  ppg_min_games: 1,
  rows: {
    101: ["WR", 17, 169, 20, null],
    102: ["TE", 16, 93, 1, "fire"],
  },
};

function inProvider(ui: React.ReactNode) {
  return render(<PositionalRanksProvider table={table}>{ui}</PositionalRanksProvider>);
}

test("a linked name carries its rank tag", () => {
  inProvider(<PlayerName name="Receiver" ottoneuId={101} />);
  expect(screen.getByRole("link", { name: "Receiver" })).toBeInTheDocument();
  expect(screen.getByText("WR17")).toHaveAttribute(
    "title",
    "17th of 169 WRs in 2026 by total points",
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

test("the fire icon rides along when the ranks disagree", () => {
  inProvider(<PlayerName name="Tight End" ottoneuId={102} />);
  expect(screen.getByText("TE16")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /TE1 by PPG vs TE16 by total points/ })).toHaveTextContent("🔥");
});

test("hover mode carries it too", () => {
  inProvider(<PlayerName name="Receiver" ottoneuId={101} mode="hover" />);
  expect(screen.getByText("WR17")).toBeInTheDocument();
});

test("a player with no rank yet shows no tag, not an empty chip", () => {
  const { container } = inProvider(<PlayerName name="Rookie" ottoneuId={999} />);
  expect(container.querySelector(".position-badge")).toBeNull();
});

test("showRankTag={false} opts out", () => {
  inProvider(<PlayerName name="Receiver" ottoneuId={101} showRankTag={false} />);
  expect(screen.queryByText("WR17")).not.toBeInTheDocument();
});

test("outside the provider, names render exactly as before", () => {
  render(<PlayerName name="Receiver" ottoneuId={101} />);
  expect(screen.queryByText("WR17")).not.toBeInTheDocument();
});
