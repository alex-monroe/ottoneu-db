// Mock the supabase client to prevent real initialization in Jest
// We place this at the top level for Jest's hoisting, as is done in roster-reconstruction.test.ts
// Note: bun test will fail on this file if Supabase dependencies are not installed,
// but since jest is the official CI framework, it works identically to `roster-reconstruction.test.ts`.

jest.mock("@/lib/supabase", () => ({
    supabase: {},
}));

import { getHistoricalSeasonsForYear } from "@/lib/analysis";

describe("getHistoricalSeasonsForYear", () => {
  it("should return the three preceding years in ascending order", () => {
    // Happy paths
    expect(getHistoricalSeasonsForYear(2026)).toEqual([2023, 2024, 2025]);
    expect(getHistoricalSeasonsForYear(2025)).toEqual([2022, 2023, 2024]);
    expect(getHistoricalSeasonsForYear(2000)).toEqual([1997, 1998, 1999]);

    // Edge cases (zero, negative)
    expect(getHistoricalSeasonsForYear(0)).toEqual([-3, -2, -1]);
    expect(getHistoricalSeasonsForYear(-5)).toEqual([-8, -7, -6]);
  });
});
