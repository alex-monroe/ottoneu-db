/**
 * Render test for the /trades page.
 *
 * The judgement has its own suite (`lib/trades.test.ts`); this pins that the
 * page puts it on screen and stays honest about what it cannot see — a
 * card-rebuilt trade must say loans are not visible rather than read as
 * loan-free, and a league whose trade-history scrape has not run must say so.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import type { Matchup } from "@/lib/standings";
import {
  findSellOffs,
  judgeSellOffs,
  mostTradedPlayers,
  summariseLoans,
  valueTrade,
  type LeagueTrade,
  type TradeAsset,
  type ValueBooks,
} from "@/lib/trades";
import type { TradesPageData } from "@/lib/trades-data";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/lib/trades-data", () => ({ fetchTradesPageData: jest.fn() }));

import { fetchTradesPageData } from "@/lib/trades-data";
import TradesPage from "@/app/trades/page";

const mockFetch = fetchTradesPageData as jest.MockedFunction<typeof fetchTradesPageData>;

const asset = (name: string, amount: number, fromTeam: string, toTeam: string, kind: "player" | "loan" = "player"): TradeAsset => ({
  kind, playerId: kind === "loan" ? null : name.toLowerCase(), ottoneuId: null, isCollege: false,
  name, position: kind === "loan" ? null : "QB", amount, fromTeam, toTeam,
});

const trade = (key: string, at: string, teams: [string, string], assets: TradeAsset[], extra: Partial<LeagueTrade> = {}): LeagueTrade => ({
  key, source: "trade_history", ottoneuTradeId: 40644, status: "processed",
  season: Number(at.slice(0, 4)), acceptedAt: at, processedAt: at, teams, assets, loansKnown: true, ...extra,
});

const game = (week: number, endsOn: string, home: string, hs: number, away: string, as: number, status: Matchup["status"] = "final"): Matchup => ({
  game_id: week, season: Number(endsOn.slice(0, 4)), week, home_team_id: 1, home_team_name: home, home_score: hs,
  away_team_id: 2, away_team_name: away, away_score: as, status, game_type: "regular",
  starts_on: null, ends_on: endsOn, status_label: null,
});

function pageData(trades: LeagueTrade[], hasTradeHistory = true): TradesPageData {
  const books: ValueBooks = {
    projected: new Map([
      [2025, new Map([["josh allen", 95], ["trevor lawrence", 20]])],
      [2026, new Map([["josh allen", 90], ["trevor lawrence", 30]])],
    ]),
    realized: new Map([[2026, new Map([["josh allen", 60], ["trevor lawrence", 25]])]]),
  };
  const s2025 = [
    game(1, "2025-09-15", "The Witchcraft", 80, "Irish Invasion", 120),
    game(16, "2025-12-28", "The Witchcraft", 0, "Irish Invasion", 0, "scheduled"),
  ];
  const s2026 = [game(1, "2026-09-15", "The Witchcraft", 130, "Irish Invasion", 100)];
  const bySeason = new Map([[2025, s2025], [2026, s2026]]);
  const valuations = trades.map((t) => valueTrade(t, books, bySeason.get(t.season) ?? []));
  const sellOffs = findSellOffs(valuations, bySeason);
  return {
    valuations,
    pending: valuations.filter((v) => v.trade.status === "pending"),
    loans: summariseLoans(trades),
    sellOffs,
    verdict: judgeSellOffs(sellOffs),
    travellers: mostTradedPlayers(trades),
    currentOwners: {},
    historyFrom: "2025-11-12T11:35",
    hasTradeHistory,
    projectionSeason: 2026,
  };
}

const allenTrade = trade("th:40644", "2025-11-12T11:35", ["The Witchcraft", "Irish Invasion"], [
  asset("Josh Allen", 110, "The Witchcraft", "Irish Invasion"),
  asset("Loan", 90, "The Witchcraft", "Irish Invasion", "loan"),
  asset("Trevor Lawrence", 22, "Irish Invasion", "The Witchcraft"),
]);

async function renderPage(params: Record<string, string> = {}) {
  render(await TradesPage({ searchParams: Promise.resolve(params) }));
}

describe("TradesPage", () => {
  it("shows a sell-off with its loan and its following season", async () => {
    mockFetch.mockResolvedValue(pageData([allenTrade]));
    await renderPage();
    expect(screen.getByRole("heading", { name: "Sell-offs" })).toBeInTheDocument();
    const ledger = screen.getAllByRole("listitem").find((li) => /lent/.test(li.textContent ?? ""));
    expect(ledger).toHaveTextContent("The Witchcraft lent $90 to Irish Invasion");
    // Keeper: Lawrence 30 − 26 = 4 in; Allen 90 − 114 → 0 out.
    expect(screen.getAllByText("+$4").length).toBeGreaterThan(0);
    expect(screen.getByText(/#1 \(1-0\)/)).toBeInTheDocument();
    expect(screen.getByText("Nothing pending right now")).toBeInTheDocument();
  });

  it("puts a pending trade first, with when it processes", async () => {
    const pending = trade("th:44322", "2026-10-14T20:45", ["The Witchcraft", "Irish Invasion"], [
      asset("Josh Allen", 114, "Irish Invasion", "The Witchcraft"),
    ], { status: "pending", processedAt: "2026-10-16T20:45:00", season: 2026 });
    mockFetch.mockResolvedValue(pageData([pending, allenTrade]));
    await renderPage();
    expect(screen.getByText(/Pending · processes Fri, Oct 16, 8:45 PM/)).toBeInTheDocument();
  });

  it("marks a card-rebuilt trade's loans as unknown", async () => {
    const card = trade("card:x", "2024-10-01T10:00", ["The Witchcraft", "Irish Invasion"], [
      asset("Trevor Lawrence", 18, "The Witchcraft", "Irish Invasion"),
    ], { source: "player_cards", loansKnown: false, ottoneuTradeId: null, acceptedAt: null });
    mockFetch.mockResolvedValue(pageData([allenTrade, card], false));
    await renderPage();
    expect(screen.getByText(/From player cards · loans not visible/)).toBeInTheDocument();
    expect(screen.getByText("Loans and pending trades are not loaded yet")).toBeInTheDocument();
  });

  it("filters the log by team and season", async () => {
    const other = trade("th:1", "2026-09-01T10:00", ["The Golden Gouda", "The Hard Eight"], [
      asset("Trevor Lawrence", 22, "The Golden Gouda", "The Hard Eight"),
    ]);
    mockFetch.mockResolvedValue(pageData([other, allenTrade]));
    await renderPage({ team: "The Hard Eight" });
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("says so when no trades are stored", async () => {
    mockFetch.mockResolvedValue(pageData([]));
    await renderPage();
    expect(screen.getByText("No trades stored yet")).toBeInTheDocument();
  });
});
