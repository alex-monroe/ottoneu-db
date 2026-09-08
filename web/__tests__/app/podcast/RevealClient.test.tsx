/**
 * Component test for the live reveal.
 *
 * This is the one screen that runs in front of a microphone with no chance to
 * fix it, so the properties pinned here are the ones a bug would ruin the take
 * over: it counts *up* from last place, it never shows a slot before it is
 * called, the keyboard drives it, and the "biggest split" callout cannot spoil
 * a team that has not been read out yet.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import RevealClient from "@/app/podcast/power-rankings/reveal/RevealClient";
import { consolidate, biggestDisagreement, type Ballot } from "@/lib/power-rankings";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
}));

const TEAMS = ["Alpha", "Bravo", "Charlie", "Delta"];

function ballot(userId: string, order: string[]): Ballot {
  return {
    userId,
    displayName: userId,
    submittedAt: "2026-09-08T12:00:00Z",
    entries: order.map((teamName, i) => ({ teamName, rank: i + 1, note: null })),
  };
}

const ROWS = consolidate(
  [
    ballot("alex", ["Alpha", "Bravo", "Charlie", "Delta"]),
    ballot("wads", ["Delta", "Charlie", "Bravo", "Alpha"]),
  ],
  TEAMS,
  ["Delta", "Charlie", "Bravo", "Alpha"], // last week, so movement is non-null
);

function setup() {
  render(
    <RevealClient
      week={3}
      weeks={[1, 2, 3]}
      rows={ROWS}
      voters={[
        { userId: "alex", displayName: "alex" },
        { userId: "wads", displayName: "wads" },
      ]}
      records={{
        Alpha: { record: "2-0-0", pointsFor: 250.5, standingsRank: 1 },
        Bravo: { record: "1-1-0", pointsFor: 210.1, standingsRank: 2 },
        Charlie: { record: "1-1-0", pointsFor: 200.2, standingsRank: 3 },
        Delta: { record: "0-2-0", pointsFor: 180.3, standingsRank: 4 },
      }}
      unranked={[]}
      split={biggestDisagreement(ROWS)}
    />,
  );
}

/** Team names as they currently appear in the revealed stack, top to bottom. */
function revealedTeams(): string[] {
  return screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
}

describe("RevealClient", () => {
  it("starts with nothing revealed", () => {
    setup();
    expect(revealedTeams()).toEqual([]);
    expect(screen.getByText(/0 of 4 revealed/)).toBeInTheDocument();
    for (const team of TEAMS) {
      expect(screen.queryByText(team)).not.toBeInTheDocument();
    }
  });

  it("counts up from last place", () => {
    setup();
    const button = screen.getByRole("button", { name: /Reveal #4/ });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    // Whoever the consolidation put last is the first team on screen.
    expect(revealedTeams()).toEqual([ROWS[3].teamName]);
    expect(screen.getByRole("button", { name: /Reveal #3/ })).toBeInTheDocument();
  });

  it("stacks newest on top, so the finished page reads 1 through n", () => {
    setup();
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole("button", { name: /Reveal #|All revealed/ }));
    }
    expect(revealedTeams()).toEqual(ROWS.map((r) => r.teamName));
    expect(screen.getByRole("button", { name: /All revealed/ })).toBeDisabled();
  });

  it("never shows a slot before it is called", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Reveal #4/ }));
    fireEvent.click(screen.getByRole("button", { name: /Reveal #3/ }));
    // The top two are still hidden, and the page says how many.
    expect(revealedTeams()).toEqual([ROWS[2].teamName, ROWS[3].teamName]);
    expect(screen.queryByText(ROWS[0].teamName)).not.toBeInTheDocument();
    expect(screen.getByText(/2 teams still hidden/)).toBeInTheDocument();
  });

  it("is driven from the keyboard — space forward, arrow back, r resets", () => {
    setup();
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(revealedTeams()).toHaveLength(2);

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(revealedTeams()).toHaveLength(1);

    fireEvent.keyDown(window, { key: "r" });
    expect(revealedTeams()).toEqual([]);
  });

  it("ignores keystrokes typed into the week picker", () => {
    setup();
    const select = screen.getByLabelText("Week");
    fireEvent.keyDown(select, { key: " " });
    expect(revealedTeams()).toEqual([]);
  });

  it("does not step past either end", () => {
    setup();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(revealedTeams()).toEqual([]);
    for (let i = 0; i < 10; i++) fireEvent.keyDown(window, { key: " " });
    expect(revealedTeams()).toHaveLength(ROWS.length);
  });

  it("shows each host's own placement on a revealed card", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Reveal #4/ }));
    expect(screen.getByText("alex")).toBeInTheDocument();
    expect(screen.getByText("wads")).toBeInTheDocument();
  });

  it("holds the biggest-split callout back until the countdown is over", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Reveal #4/ }));
    // Naming the most-argued-about team early would give away its slot.
    expect(screen.queryByText(/Biggest split/)).not.toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: /Reveal #/ }));
    }
    expect(screen.getByText(/Biggest split/)).toBeInTheDocument();
  });

  it("marks a team as new when there is nothing to compare against", () => {
    render(
      <RevealClient
        week={1}
        weeks={[1]}
        rows={consolidate([ballot("alex", TEAMS)], TEAMS)}
        voters={[{ userId: "alex", displayName: "alex" }]}
        records={{}}
        unranked={["Echo"]}
        split={null}
      />,
    );
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("new")).toBeInTheDocument();
    // A team no locked ballot ranked is reported rather than silently missing.
    expect(screen.getByText(/Not on any locked ballot: Echo/)).toBeInTheDocument();
  });
});
