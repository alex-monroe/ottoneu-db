/**
 * Component test for the snake draft: the setup choices reach the draft, the
 * bots pick on their own until the user is on the clock, and the user's pick
 * lands on their roster.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import SnakeDraftClient from "@/app/snake-draft/SnakeDraftClient";
import type { MarketPlayer, Pos } from "@/lib/snake-draft-engine";

/** Replacement lands on rank 12 at every position — see the engine tests. */
const pool: MarketPlayer[] = (["QB", "RB", "WR", "TE"] as Pos[]).flatMap((pos) =>
  Array.from({ length: 30 }, (_, i) => ({
    id: `${pos}${i}`,
    name: `${pos} Player ${i}`,
    pos,
    points: 100 - i * 2,
    vorp: 100 - i * 2 - 78,
    bye: 6,
  })),
);

function setup() {
  render(<SnakeDraftClient pool={pool} />);
}

/**
 * Let bot-pick timers fire. Each pick re-schedules the next one only after
 * React has re-rendered, so one `act` per pick.
 */
function tick(picks = 1) {
  for (let i = 0; i < picks; i++) {
    act(() => {
      jest.advanceTimersByTime(1000);
    });
  }
}

describe("SnakeDraftClient", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows the user's snake picks for the chosen slot", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Teams"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("My draft slot"), { target: { value: "3" } });
    expect(screen.getByText(/#3 · #18 · #23/)).toBeInTheDocument();
  });

  it("reports replacement level and moves it when superflex is selected", () => {
    setup();
    expect(screen.getByText(/QB12 · RB12 · WR12 · TE12/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Superflex"));
    expect(screen.getByText(/QB22 ·/)).toBeInTheDocument();
  });

  it("runs bot picks up to the user's slot, then waits", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Teams"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("My draft slot"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Start draft"));

    expect(screen.getByText(/is picking…/)).toBeInTheDocument();
    tick(2); // the two bots ahead of us
    expect(screen.getByText("You are on the clock")).toBeInTheDocument();
    expect(screen.getByText(/#3 overall/)).toBeInTheDocument();
    tick(2); // still our turn — no bot picks over us
    expect(screen.getByText("You are on the clock")).toBeInTheDocument();
  });

  it("puts a drafted player on the user's roster", () => {
    setup();
    fireEvent.click(screen.getByText("Start draft")); // slot 1: we are up immediately
    const board = screen.getByRole("table");
    const firstRow = within(board).getAllByRole("row")[1];
    const name = within(firstRow).getAllByRole("cell")[1].textContent!;
    fireEvent.click(within(firstRow).getByText("Draft"));

    const roster = screen.getByText(/My roster/).closest("div")!;
    expect(within(roster).getByText(name)).toBeInTheDocument();
    expect(screen.getByText(/is picking…/)).toBeInTheDocument(); // clock moved on
  });

  it("auto-drafts the remainder and shows the standings", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Rounds"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Start draft"));
    fireEvent.click(screen.getByText("Auto-draft rest"));
    expect(screen.getByText(/Draft complete — 36 picks/)).toBeInTheDocument();
    expect(screen.getByText("Starters")).toBeInTheDocument();
  });
});
