/**
 * Component test for the live mock draft: the clock actually runs, the AI
 * opponents bid while it does, and lots hammer on their own.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import MockDraftClient from "@/app/mock-draft/MockDraftClient";
import type { MockDraftTeamSeed } from "@/lib/mock-draft";
import type { FAPlayer } from "@/lib/mock-draft-engine";

const seeds: MockDraftTeamSeed[] = ["Witchcraft", "Rival A", "Rival B"].map((name) => ({
  name,
  roster: [],
  committed: 0,
  cap: 200,
}));

const faPool: FAPlayer[] = [
  { id: "w1", name: "Alpha Receiver", pos: "WR", mv: 55, nflTeam: "SF" },
  { id: "q1", name: "Bravo Passer", pos: "QB", mv: 45, nflTeam: "BUF" },
  { id: "r1", name: "Charlie Back", pos: "RB", mv: 35, nflTeam: "DAL" },
];

/** Push wall-clock + timers forward together (the engine reads Date.now()). */
function advance(ms: number, stepMs = 100) {
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    jest.setSystemTime(Date.now() + stepMs);
    act(() => {
      jest.advanceTimersByTime(stepMs);
    });
  }
}

function startLiveDraft() {
  render(<MockDraftClient teams={seeds} faPool={faPool} season={2026} />);
  fireEvent.click(screen.getByText("Start draft"));
}

describe("MockDraftClient (live auction)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-22T12:00:00Z"));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("opens a lot with a running countdown", () => {
    startLiveDraft();
    expect(screen.getByText(/On the block/)).toBeInTheDocument();
    expect(screen.getByText("Current bid")).toBeInTheDocument();
    const before = screen.getByText(/^\d+\.\ds$/).textContent!;
    advance(1000);
    const after = screen.getByText(/^\d+\.\ds$/).textContent!;
    expect(parseFloat(after)).toBeLessThan(parseFloat(before));
  });

  it("lets the AI bid on their own while the clock runs", () => {
    startLiveDraft();
    expect(screen.getByText(/Waiting for an opening bid/)).toBeInTheDocument();
    advance(4000);
    expect(screen.queryByText(/Waiting for an opening bid/)).not.toBeInTheDocument();
    expect(screen.getByText("Bidding")).toBeInTheDocument();
  });

  it("hammers the lot and logs the sale without any user input", () => {
    startLiveDraft();
    advance(40000);
    // the draft log has filled in on its own
    expect(screen.queryByText("No picks yet.")).not.toBeInTheDocument();
  });

  it("puts the user on the board when they bid", () => {
    startLiveDraft();
    fireEvent.click(screen.getByRole("button", { name: /^Bid \$1$/ }));
    expect(screen.getByText("You lead")).toBeInTheDocument();
  });

  it("freezes the clock while paused", () => {
    startLiveDraft();
    fireEvent.click(screen.getByRole("button", { name: /Pause/ }));
    expect(screen.getByText("paused")).toBeInTheDocument();
    advance(3000);
    expect(screen.getByText("paused")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Resume/ }));
    expect(screen.queryByText("paused")).not.toBeInTheDocument();
  });

  it("carries the valuation-noise slider into the draft", () => {
    render(<MockDraftClient teams={seeds} faPool={faPool} season={2026} />);
    const slider = screen.getByLabelText("Manager valuation noise");
    expect(screen.getByText("off")).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: "60" } });
    expect(screen.getByText("±60%")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Start draft"));
    // the drafting header advertises the spread the AI managers are using
    expect(screen.getByText(/±60% valuations/)).toBeInTheDocument();
  });

  it("turn-by-turn mode has no clock", () => {
    render(<MockDraftClient teams={seeds} faPool={faPool} season={2026} />);
    fireEvent.click(screen.getByText("Turn by turn"));
    fireEvent.click(screen.getByText("Start draft"));
    expect(screen.getByText("Your max bid")).toBeInTheDocument();
    expect(screen.queryByText("Current bid")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Pass$/ }));
    expect(screen.queryByText("No picks yet.")).not.toBeInTheDocument();
  });
});
