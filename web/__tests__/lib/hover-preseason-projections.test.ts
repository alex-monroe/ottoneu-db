/**
 * Hover cards drop the preseason projection and Draft Sharks values in season.
 *
 * Both are preseason numbers that never update once games start, and a hover
 * card is exactly where a stale projection gets read as current. The gate lives
 * in `fetchHoverExtras`, so every hover-card caller inherits it; the
 * `/projections` page reads the model directly and keeps it.
 */
import { fetchHoverExtras } from "@/lib/analysis";
import { getSeasonContextNow, getProjectionSeason } from "@/lib/season";
import { fetchDraftSharksMap } from "@/lib/data";
import { fetchAllRows } from "@/lib/supabase";
import { isPreseasonProjectionStale } from "@/lib/preseason-projections";
import { PHASES } from "@/lib/season";

jest.mock("@/lib/supabase", () => ({
    supabase: {},
    fetchAllRows: jest.fn(),
    getSupabaseAdmin: jest.fn(),
}));
jest.mock("@/lib/season", () => ({
    ...jest.requireActual("@/lib/season"),
    getSeasonContextNow: jest.fn(),
    getProjectionSeason: jest.fn(),
}));
jest.mock("@/lib/data", () => ({
    ...jest.requireActual("@/lib/data"),
    fetchDraftSharksMap: jest.fn(),
}));
jest.mock("@/lib/positional-rank-data", () => ({
    fetchCurrentPositionalRanks: jest.fn().mockResolvedValue(new Map()),
}));

const mockCtx = getSeasonContextNow as jest.Mock;
const mockDs = fetchDraftSharksMap as jest.Mock;
const mockRows = fetchAllRows as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    (getProjectionSeason as jest.Mock).mockResolvedValue(2026);
    mockDs.mockResolvedValue({ p1: { ds_auction_value: 30, market_auction_value: 28 } });
    mockRows.mockResolvedValue([
        { player_id: "p1", projected_ppg: 12, projection_method: "v44", projected_games: 16 },
    ]);
});

describe("isPreseasonProjectionStale", () => {
    test("is stale only while games are being played", () => {
        const stale = PHASES.filter((p) => isPreseasonProjectionStale(p));
        expect(stale).toEqual(["in_season"]);
    });
});

describe("fetchHoverExtras — preseason gate", () => {
    test("offseason: projection and Draft Sharks maps are returned", async () => {
        mockCtx.mockResolvedValue({ phase: "pre_arb" });
        const { projMap, dsMap } = await fetchHoverExtras(true);
        expect(projMap?.p1.ppg).toBe(12);
        expect(dsMap?.p1.ds_auction_value).toBe(30);
    });

    test("in season: both maps are null and never fetched", async () => {
        mockCtx.mockResolvedValue({ phase: "in_season" });
        const { projMap, dsMap, rankMap } = await fetchHoverExtras(true);
        expect(projMap).toBeNull();
        expect(dsMap).toBeNull();
        expect(rankMap).toEqual({});
        expect(mockDs).not.toHaveBeenCalled();
        expect(mockRows).not.toHaveBeenCalled();
    });

    test("without projections access the maps stay null regardless of phase", async () => {
        mockCtx.mockResolvedValue({ phase: "pre_arb" });
        const { projMap, dsMap } = await fetchHoverExtras(false);
        expect(projMap).toBeNull();
        expect(dsMap).toBeNull();
    });
});
