import {
  lookupTeamIcon,
  MAX_TEAM_ICON_BYTES,
  parseTeamIconDataUrl,
  teamIconSrc,
} from "@/lib/team-icons";

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

describe("parseTeamIconDataUrl", () => {
  test.each([
    ["image/png", PNG],
    ["image/jpeg", JPEG],
    ["image/webp", WEBP],
  ])("accepts a real %s", (type, bytes) => {
    const parsed = parseTeamIconDataUrl(`data:${type};base64,${b64(bytes)}`);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.contentType).toBe(type);
      expect(Array.from(parsed.bytes)).toEqual(bytes);
    }
  });

  test("refuses SVG — it would be served from our own origin and can carry script", () => {
    const svg = btoa('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(parseTeamIconDataUrl(`data:image/svg+xml;base64,${svg}`).ok).toBe(false);
  });

  test("refuses a file whose bytes are not the type it claims", () => {
    expect(parseTeamIconDataUrl(`data:image/png;base64,${b64(JPEG)}`).ok).toBe(false);
  });

  test("refuses an oversized image", () => {
    const big = new Array(MAX_TEAM_ICON_BYTES + 1).fill(0);
    big.splice(0, PNG.length, ...PNG);
    // btoa over a spread of 64K args would overflow the stack; build in chunks.
    let s = "";
    for (let i = 0; i < big.length; i += 8192) s += String.fromCharCode(...big.slice(i, i + 8192));
    const parsed = parseTeamIconDataUrl(`data:image/png;base64,${btoa(s)}`);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/too large/);
  });

  test("refuses things that are not data URLs", () => {
    expect(parseTeamIconDataUrl("https://example.com/icon.png").ok).toBe(false);
    expect(parseTeamIconDataUrl("data:image/png;base64,").ok).toBe(false);
  });
});

describe("lookupTeamIcon", () => {
  const versions = { "the witchcraft": 1700000000000 };

  test("matches team names case- and whitespace-insensitively", () => {
    expect(lookupTeamIcon(versions, "  The Witchcraft ")).toBe(
      teamIconSrc("The Witchcraft", 1700000000000),
    );
  });

  test("a new upload is a new URL", () => {
    expect(teamIconSrc("A B", 1)).not.toBe(teamIconSrc("A B", 2));
    expect(teamIconSrc("A B", 1)).toBe("/team-icons/A%20B?v=1");
  });

  test("teams without an icon, free agents and a missing map resolve to null", () => {
    expect(lookupTeamIcon(versions, "Someone Else")).toBeNull();
    expect(lookupTeamIcon(versions, "FA")).toBeNull();
    expect(lookupTeamIcon(versions, null)).toBeNull();
    expect(lookupTeamIcon(null, "The Witchcraft")).toBeNull();
  });
});
