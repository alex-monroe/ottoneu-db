/**
 * Render test for the weekly recap page.
 *
 * The derivation has its own suite (`lib/weekly-recap.test.ts`); what this pins
 * is that the page puts the derived facts on screen and stays honest about the
 * ones it does not have — a week nobody ranked, a week with no box scores yet,
 * and a league with no schedule at all. Those three branches are exactly what a
 * host hits at the start of a season, and each of them silently rendering a
 * screen of zeroes would be worse than an empty state.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import type { WeeklyRecap } from "@/lib/weekly-recap";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/lib/auth", () => ({
  requirePodcaster: jest.fn().mockResolvedValue({ userId: "u1", email: "host@example.com" }),
}));

jest.mock("@/lib/weekly-recap", () => ({
  fetchWeeklyRecap: jest.fn(),
}));

import { fetchWeeklyRecap } from "@/lib/weekly-recap";
import { requirePodcaster } from "@/lib/auth";
import WeeklyRecapPage from "@/app/podcast/recap/page";

const mockFetch = fetchWeeklyRecap as jest.MockedFunction<typeof fetchWeeklyRecap>;

function player(overrides: Partial<WeeklyRecap["topPerformers"][number]> = {}) {
  return {
    ottoneuId: 1,
    name: "Caleb Williams",
    position: "QB",
    nflTeam: "CHI",
    teamName: "The Triple Helix",
    slot: "QB",
    isStarter: true,
    points: 37.26,
    projected: 17.66,
    surprise: 19.6,
    statLine: "25-34 305yds 4TD",
    gameInfo: "W 27-7 @GB",
    ...overrides,
  };
}

function recap(overrides: Partial<WeeklyRecap> = {}): WeeklyRecap {
  return {
    season: 2026,
    week: 1,
    weeks: [{ week: 1, partial: false }],
    complete: true,
    hasLineups: true,
    games: [
      {
        gameId: 7286891,
        home: { teamName: "Irish Invasion", points: 126.92, pregame: 110.4, beat: 16.5 },
        away: { teamName: "Tinseltown Little Gold Men", points: 122.82, pregame: 119.3, beat: 3.5 },
        margin: 4.1,
        winner: "Irish Invasion",
        upset: true,
        combined: 249.74,
        final: true,
      },
    ],
    teams: [
      {
        teamName: "The Roseman Empire",
        points: 113.6,
        pregame: 122.2,
        beat: -8.6,
        scoringRank: 9,
        result: "loss",
        opponent: "The Hard Eight",
        opponentPoints: 129.7,
        powerRank: 1,
        powerSurprise: -8,
        votes: [{ userId: "a", displayName: "Wadsworth", rank: 1, note: "Best roster in the league" }],
      },
    ],
    topPerformers: [player()],
    overachievers: [player({ name: "Jalen Coker", isStarter: false, ottoneuId: 2 })],
    busts: [player({ name: "Kyler Murray", ottoneuId: 3, points: -0.38, projected: 17.82, surprise: -18.2 })],
    topBench: [player({ name: "Isaiah Likely", ottoneuId: 4, isStarter: false })],
    benchMisses: [
      {
        teamName: "Marin County Mountain Runners",
        actual: 95.8,
        optimal: 145.8,
        left: 50,
        shouldHaveStarted: [player({ name: "Chuba Hubbard", ottoneuId: 5, isStarter: false })],
        shouldHaveSat: [player({ name: "Jaylen Warren", ottoneuId: 6 })],
      },
    ],
    ranked: true,
    voters: [{ userId: "a", displayName: "Wadsworth" }],
    unprojected: 1,
    asOf: "2026-09-15T15:18:48.061305+00:00",
    ...overrides,
  };
}

async function renderPage(week?: string) {
  render(await WeeklyRecapPage({ searchParams: Promise.resolve(week ? { week } : {}) }));
}

beforeEach(() => jest.clearAllMocks());

describe("the recap a host actually opens", () => {
  it("is behind the podcaster gate", async () => {
    mockFetch.mockResolvedValue(recap());
    await renderPage();
    expect(requirePodcaster).toHaveBeenCalledWith("/podcast/recap");
  });

  it("passes the requested week through to the derivation", async () => {
    mockFetch.mockResolvedValue(recap({ week: 3 }));
    await renderPage("3");
    expect(mockFetch).toHaveBeenCalledWith(3);
  });

  it("asks for no particular week when none is requested", async () => {
    mockFetch.mockResolvedValue(recap());
    await renderPage();
    expect(mockFetch).toHaveBeenCalledWith(undefined);
  });

  it("ignores a week that is not a number rather than passing NaN down", async () => {
    mockFetch.mockResolvedValue(recap());
    await renderPage("banana");
    expect(mockFetch).toHaveBeenCalledWith(undefined);
  });

  it("leads with the week and the headline numbers", async () => {
    mockFetch.mockResolvedValue(recap());
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Week 1 recap");
    expect(screen.getByText("Highest score")).toBeInTheDocument();
    expect(screen.getByText("Left on benches")).toBeInTheDocument();
  });

  it("shows every section a first-pass episode is built from", async () => {
    mockFetch.mockResolvedValue(recap());
    await renderPage();
    for (const heading of [
      "The games",
      "Top performers",
      "Biggest surprises against the projection",
      "Biggest surprises against the Week 1 ranking",
      "Left on the bench",
    ]) {
      expect(screen.getByRole("heading", { name: new RegExp(heading, "i") })).toBeInTheDocument();
    }
  });

  it("names the upset, the bust and the bench miss", async () => {
    mockFetch.mockResolvedValue(recap());
    await renderPage();
    expect(screen.getByText("Upset")).toBeInTheDocument();
    expect(screen.getByText("Kyler Murray")).toBeInTheDocument();
    expect(screen.getByText(/Chuba Hubbard/)).toBeInTheDocument();
    expect(screen.getByText(/started 95.8 of a possible 145.8/)).toBeInTheDocument();
  });

  // Every game card is itself a link to the box score, and the sides inside it
  // carry team names. Rendering those as TeamName links nested an anchor inside
  // an anchor — invalid HTML, and the inner one swallows clicks meant for the
  // card.
  it("never nests a link inside a link", async () => {
    mockFetch.mockResolvedValue(recap());
    const { container } = render(
      await WeeklyRecapPage({ searchParams: Promise.resolve({}) }),
    );
    expect(container.querySelectorAll("a a")).toHaveLength(0);
  });

  it("puts each host's own placement beside the ranking miss", async () => {
    mockFetch.mockResolvedValue(recap());
    await renderPage();
    expect(screen.getByRole("columnheader", { name: "Wadsworth" })).toBeInTheDocument();
  });

  // A starter with no forecast is silently absent from both surprise lists, so
  // the page has to say how many it dropped or the lists look complete.
  it("says how many starters had no forecast to be measured against", async () => {
    mockFetch.mockResolvedValue(recap());
    await renderPage();
    expect(screen.getByText(/1 started player had no forecast at all/)).toBeInTheDocument();
  });
});

describe("what it says when it does not have the data", () => {
  it("does not invent a ranking for a week nobody ranked", async () => {
    mockFetch.mockResolvedValue(recap({ ranked: false, voters: [], teams: [] }));
    await renderPage();
    expect(screen.getByText("Week 1 was never ranked")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Wadsworth" })).not.toBeInTheDocument();
  });

  it("drops the player sections when no box scores are stored", async () => {
    mockFetch.mockResolvedValue(recap({ hasLineups: false }));
    await renderPage();
    expect(screen.getByText("No lineups stored for this week")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Top performers/i })).not.toBeInTheDocument();
    // The six results still stand on their own.
    expect(screen.getByRole("heading", { name: /The games/i })).toBeInTheDocument();
  });

  it("flags a week that is still being played", async () => {
    mockFetch.mockResolvedValue(recap({ complete: false }));
    await renderPage();
    expect(screen.getByText("Week not finished")).toBeInTheDocument();
  });

  it("says so when there is no week to recap at all", async () => {
    mockFetch.mockResolvedValue(null);
    await renderPage();
    expect(screen.getByText("No week to recap yet")).toBeInTheDocument();
  });
});
