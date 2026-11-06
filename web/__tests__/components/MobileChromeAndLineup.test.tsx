import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import Navigation from "@/components/Navigation";
import GlobalPlayerSearch from "@/components/GlobalPlayerSearch";
import LineupClient from "@/app/lineup/LineupClient";
import type { LineupTeam } from "@/app/lineup/page";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/players",
  useRouter: () => ({ push: pushMock, refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        or: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

describe("Mobile chrome (Navigation + GlobalPlayerSearch)", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("renders a collapsed-bar brand home link alongside the hamburger toggle", () => {
    render(
      <Navigation
        isAuthenticated={false}
        isAdmin={false}
        activeSinceSeason={2025}
        hasProjectionsAccess={false}
        isPodcaster={false}
        viewerTeam={null}
      />,
    );

    const brandLinks = screen.getAllByRole("link", { name: "The SOFA" });
    // One is the collapsed internal `/` brand link; the other is the external Ottoneu league link.
    expect(brandLinks.some((el) => el.getAttribute("href") === "/")).toBe(true);
  });

  it("opens full-width mobile search, clears query with X button, and closes on Cancel", () => {
    render(<GlobalPlayerSearch activeSinceSeason={2025} />);

    // Mobile trigger button opens and focuses the single search input
    const openBtn = screen.getByRole("button", { name: "Open player search" });
    fireEvent.click(openBtn);

    const input = screen.getByLabelText("Search players globally");
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    // Entering text reveals the touch-friendly Clear button
    fireEvent.change(input, { target: { value: "Josh" } });
    const clearBtn = screen.getByLabelText("Clear search");
    fireEvent.click(clearBtn);
    expect(input).toHaveValue("");
    expect(document.activeElement).toBe(input);

    // Cancel closes the mobile search bar and restores the compact trigger
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Open player search" })).toBeInTheDocument();
  });
});

describe("LineupClient mobile layout", () => {
  const mockTeams: LineupTeam[] = [
    {
      team_name: "Test Squad",
      players: [
        {
          player_id: "p1",
          name: "Josh Allen",
          position: "QB",
          nfl_team: "BUF",
          ottoneu_id: 1001,
          ppg: 24.5,
          projected_ppg: 25.2,
          weekly_points: 26.4,
          weekly_opponent: "@MIA",
        },
        {
          player_id: "p2",
          name: "Bijan Robinson",
          position: "RB",
          nfl_team: "ATL",
          ottoneu_id: 1002,
          ppg: 18.0,
          projected_ppg: 19.1,
          weekly_points: 20.0,
          weekly_opponent: "vs NO",
        },
      ],
    },
  ];

  it("renders labelled slot selects and updates the sticky mobile total bar on Optimize", () => {
    render(
      <LineupClient
        teams={mockTeams}
        hasProjections={true}
        defaultTeam="Test Squad"
        season={2026}
        week={9}
        weeks={[8, 9, 10]}
        hasWeekly={true}
        viewerTeam="Test Squad"
        statsSeason={2025}
      />,
    );

    const qbSelect = screen.getByLabelText("QB starter");
    expect(qbSelect).toBeInTheDocument();

    const mobileBar = screen.getByTestId("mobile-lineup-total");
    expect(mobileBar).toHaveTextContent("0.0");

    // Click Optimize inside the sticky mobile bar
    const optimizeButtons = screen.getAllByRole("button", { name: "Optimize" });
    fireEvent.click(optimizeButtons[optimizeButtons.length - 1]);

    // 26.4 + 20.0 = 46.4
    expect(mobileBar).toHaveTextContent("46.4");
  });
});
