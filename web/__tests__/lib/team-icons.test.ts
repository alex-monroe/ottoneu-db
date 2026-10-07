import {
  lookupTeamIcon,
  MAX_TEAM_ICON_BYTES,
  parseTeamIconDataUrl,
  iconLayout,
  visibleBounds,
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

describe("visibleBounds / iconLayout", () => {
  /** A w×h RGBA buffer, opaque only inside `box`. */
  function rgba(w: number, h: number, box?: { x: number; y: number; w: number; h: number }) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const inside = !box || (x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h);
        data[(y * w + x) * 4 + 3] = inside ? 255 : 0;
      }
    return data;
  }

  test("finds the visible mark inside transparent margins", () => {
    expect(visibleBounds(rgba(10, 12, { x: 2, y: 3, w: 5, h: 7 }), 10, 12)).toEqual({
      x: 2, y: 3, w: 5, h: 7,
    });
  });

  test("a fully transparent image has no bounds", () => {
    expect(visibleBounds(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toBeNull();
  });

  test("a logo is trimmed and fit whole — a tall mark is not clipped", () => {
    const { src, dest } = iconLayout(584, 661, { x: 69, y: 51, w: 434, h: 551 }, 128, 0.06);
    expect(src).toEqual({ x: 69, y: 51, w: 434, h: 551 });
    expect(dest.h).toBeCloseTo(128 * 0.88);
    expect(dest.w).toBeLessThan(dest.h);
    expect(dest.x).toBeCloseTo((128 - dest.w) / 2);
  });

  test("an opaque photo is center-cropped to a square", () => {
    const { src, dest } = iconLayout(400, 300, { x: 0, y: 0, w: 400, h: 300 }, 128);
    expect(src).toEqual({ x: 50, y: 0, w: 300, h: 300 });
    expect(dest).toEqual({ x: 0, y: 0, w: 128, h: 128 });
  });
});
