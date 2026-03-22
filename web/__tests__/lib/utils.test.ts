import { isValidRedirect } from "../../lib/utils";

describe("isValidRedirect", () => {
  it("should return true for valid relative paths", () => {
    expect(isValidRedirect("/")).toBe(true);
    expect(isValidRedirect("/home")).toBe(true);
    expect(isValidRedirect("/api/auth/login")).toBe(true);
    expect(isValidRedirect("/path?query=1")).toBe(true);
  });

  it("should return false for non-string inputs", () => {
    expect(isValidRedirect(null)).toBe(false);
    expect(isValidRedirect(undefined)).toBe(false);
    expect(isValidRedirect(123)).toBe(false);
    expect(isValidRedirect({})).toBe(false);
    expect(isValidRedirect([])).toBe(false);
  });

  it("should return false for absolute URLs", () => {
    expect(isValidRedirect("https://example.com")).toBe(false);
    expect(isValidRedirect("http://example.com")).toBe(false);
    expect(isValidRedirect("ftp://example.com")).toBe(false);
    expect(isValidRedirect("mailto:user@example.com")).toBe(false);
  });

  it("should return false for schema-less absolute URLs", () => {
    expect(isValidRedirect("//example.com")).toBe(false);
    expect(isValidRedirect("//example.com/path")).toBe(false);
  });

  it("should return false for paths starting with /\\", () => {
    expect(isValidRedirect("/\\example.com")).toBe(false);
  });

  it("should return false for URLs with whitespace or control characters", () => {
    expect(isValidRedirect("/\n/example.com")).toBe(false);
    expect(isValidRedirect("/\r/example.com")).toBe(false);
    expect(isValidRedirect("/\t/example.com")).toBe(false);
    expect(isValidRedirect(" /example.com")).toBe(false);
    expect(isValidRedirect("/example.com ")).toBe(false);
    expect(isValidRedirect("/path \n/path")).toBe(false);
    expect(isValidRedirect("/path\u0000")).toBe(false);
    expect(isValidRedirect("/\x08path")).toBe(false);
  });
});
