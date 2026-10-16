/**
 * @jest-environment node
 *
 * Unit tests for lib/revalidate.ts — bearer-secret check and path parsing for
 * the /api/revalidate endpoint the data workflows call.
 */
import { isAuthorizedRevalidation, MAX_PATHS, parseRevalidationPaths } from "@/lib/revalidate";

describe("isAuthorizedRevalidation", () => {
  it("accepts the matching bearer token", () => {
    expect(isAuthorizedRevalidation("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("rejects a wrong, missing, or malformed token", () => {
    expect(isAuthorizedRevalidation("Bearer nope", "s3cret")).toBe(false);
    expect(isAuthorizedRevalidation(null, "s3cret")).toBe(false);
    expect(isAuthorizedRevalidation("s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedRevalidation("Basic s3cret", "s3cret")).toBe(false);
  });

  it("is closed when the secret is not configured", () => {
    expect(isAuthorizedRevalidation("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedRevalidation("Bearer anything", "")).toBe(false);
  });
});

describe("parseRevalidationPaths", () => {
  it("defaults to the whole site", () => {
    expect(parseRevalidationPaths(null)).toBe("all");
    expect(parseRevalidationPaths({})).toBe("all");
    expect(parseRevalidationPaths({ paths: [] })).toBe("all");
  });

  it("returns scoped absolute paths", () => {
    expect(parseRevalidationPaths({ paths: ["/scoreboard", "/matchup"] })).toEqual([
      "/scoreboard",
      "/matchup",
    ]);
  });

  it("rejects malformed bodies", () => {
    expect(parseRevalidationPaths("all")).toBeNull();
    expect(parseRevalidationPaths([])).toBeNull();
    expect(parseRevalidationPaths({ paths: "/scoreboard" })).toBeNull();
    expect(parseRevalidationPaths({ paths: ["scoreboard"] })).toBeNull();
    expect(parseRevalidationPaths({ paths: ["//evil.example"] })).toBeNull();
    expect(parseRevalidationPaths({ paths: [42] })).toBeNull();
    expect(parseRevalidationPaths({ paths: Array(MAX_PATHS + 1).fill("/") })).toBeNull();
  });
});
