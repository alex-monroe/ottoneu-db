/**
 * fetchAllRows paging: the overlap backstop that drops repeated ids and
 * reports them, so an unstable order surfaces in logs instead of as a
 * silently missing player.
 */
import { fetchAllRows, dropOverlappingRows } from "@/lib/supabase";

const rows = (ids: number[]) => ids.map((id) => ({ id, name: `p${id}` }));
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);

describe("fetchAllRows overlap backstop", () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  test("overlapping pages are deduped by id and reported", async () => {
    // Page 2 repeats 50 rows from page 1: what an unstable order produces.
    const pages: Record<number, { id: number; name: string }[]> = {
      0: rows(range(0, 1000)),
      1000: rows(range(950, 1100)),
    };
    const out = await fetchAllRows((from) =>
      Promise.resolve({ data: pages[from] ?? [], error: null }),
    );
    expect(out.map((r) => r.id)).toEqual(range(0, 1100));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("50 duplicate id(s)"));
  });

  test("clean pages pass through silently", async () => {
    const pages: Record<number, { id: number; name: string }[]> = {
      0: rows(range(0, 1000)),
      1000: rows(range(1000, 1200)),
    };
    const out = await fetchAllRows((from) =>
      Promise.resolve({ data: pages[from] ?? [], error: null }),
    );
    expect(out).toHaveLength(1200);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("rows without an id are left alone", () => {
    const noIds = [{ week: 5 }, { week: 5 }];
    expect(dropOverlappingRows(noIds)).toEqual(noIds);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
