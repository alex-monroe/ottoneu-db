/**
 * The worm's chosen view (Clock / Minutes played / Win %) survives a reload and
 * the live page's refresh, because it is kept in the URL (`?worm=`).
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import ScoreWorm from "@/components/ScoreWorm";
import { wormChart, type ScoreSnapshot } from "@/lib/score-worm";

let search = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useSearchParams: () => search,
}));

const row = (at: string, home: number, away: number, p: number, win: number): ScoreSnapshot => ({
  scraped_at: at,
  home_points: home,
  away_points: away,
  home_progress: p,
  away_progress: p,
  home_win_prob: win,
  home_proj_remaining: 100 * (1 - p),
  away_proj_remaining: 100 * (1 - p),
});

const PLAYS = [
  row("2026-11-01T17:00:00Z", 0, 0, 0, 0.5),
  row("2026-11-01T18:00:00Z", 7, 3, 0.3, 0.6),
  row("2026-11-01T19:00:00Z", 12, 15, 0.6, 0.4),
];

function renderWorm(snapshots: ScoreSnapshot[] = PLAYS) {
  return render(<ScoreWorm {...wormChart(snapshots, "Alpha", "Beta", "plays")!} />);
}

const pressed = () => screen.getAllByRole("button").find((b) => b.getAttribute("aria-pressed") === "true");

beforeEach(() => {
  search = new URLSearchParams();
  window.history.replaceState(null, "", "/scoreboard/7");
});

describe("ScoreWorm view", () => {
  it("starts on the clock", () => {
    renderWorm();
    expect(pressed()).toHaveTextContent("Clock");
  });

  it("starts on the view named in the URL", () => {
    search = new URLSearchParams("worm=win");
    renderWorm();
    expect(pressed()).toHaveTextContent("Win %");
  });

  it("writes the chosen view to the URL, and clears it for the clock", () => {
    renderWorm();
    fireEvent.click(screen.getByRole("button", { name: "Win %" }));
    expect(window.location.search).toBe("?worm=win");
    fireEvent.click(screen.getByRole("button", { name: "Clock" }));
    expect(window.location.search).toBe("");
  });

  it("falls back to the clock for a view this game doesn't have", () => {
    search = new URLSearchParams("worm=minutes");
    renderWorm(PLAYS.map(({ scraped_at, home_points, away_points }) => ({ scraped_at, home_points, away_points })));
    expect(screen.queryByRole("button", { name: "Minutes played" })).toBeNull();
  });
});
