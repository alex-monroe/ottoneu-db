import { POST } from "@/app/api/auth/logout/route";
import { clearAuthCookie } from "@/lib/auth";

jest.mock("@/lib/auth", () => ({
  clearAuthCookie: jest.fn(),
}));

// Mock console.error to avoid cluttering test output
const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

describe("Logout API Route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    consoleSpy.mockRestore();
  });

  it("should call clearAuthCookie and return success: true", async () => {
    (clearAuthCookie as jest.Mock).mockResolvedValue(undefined);

    const response = await POST();
    const data = await response.json();

    expect(clearAuthCookie).toHaveBeenCalledTimes(1);
    expect(data).toEqual({ success: true });
    expect(response.status).toBe(200);
  });

  it("should return 500 if clearAuthCookie throws an error", async () => {
    (clearAuthCookie as jest.Mock).mockRejectedValue(new Error("Logout failed"));

    const response = await POST();
    const data = await response.json();

    expect(clearAuthCookie).toHaveBeenCalledTimes(1);
    expect(data).toEqual({ error: "Internal server error" });
    expect(response.status).toBe(500);
    expect(consoleSpy).toHaveBeenCalled();
  });
});
