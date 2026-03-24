import { isValidRedirect } from "../../lib/utils";

describe("isValidRedirect", () => {
  it("allows valid relative redirects", () => {
    expect(isValidRedirect("/home")).toBe(true);
    expect(isValidRedirect("/dashboard/settings")).toBe(true);
    expect(isValidRedirect("/")).toBe(true);
  });

  it("blocks absolute URLs", () => {
    expect(isValidRedirect("http://example.com")).toBe(false);
    expect(isValidRedirect("https://example.com")).toBe(false);
  });

  it("blocks protocol-relative URLs (open redirect vectors)", () => {
    expect(isValidRedirect("//example.com")).toBe(false);
    expect(isValidRedirect("/\\example.com")).toBe(false);
    expect(isValidRedirect("\\\\example.com")).toBe(false);
  });

  it("blocks open redirect bypasses using whitespace or control characters", () => {
    expect(isValidRedirect("/\n//example.com")).toBe(false);
    expect(isValidRedirect("/\t//example.com")).toBe(false);
    expect(isValidRedirect("/ //example.com")).toBe(false);
    expect(isValidRedirect("\n//example.com")).toBe(false);
    expect(isValidRedirect("\t//example.com")).toBe(false);
    expect(isValidRedirect(" //example.com")).toBe(false);
    expect(isValidRedirect("/\x00//example.com")).toBe(false);
  });

  it("returns false for non-string inputs", () => {
    expect(isValidRedirect(null)).toBe(false);
    expect(isValidRedirect(undefined)).toBe(false);
    expect(isValidRedirect(123)).toBe(false);
    expect(isValidRedirect({})).toBe(false);
  });
});
