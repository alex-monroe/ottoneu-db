/**
 * Guards on the design layer.
 *
 * These are the invariants the 2026-09 design review found broken, written down
 * so they cannot quietly come back: badge contrast was below WCAG AA on all five
 * positions, and the page shell was copy-pasted into ~25 files with `p-8` at
 * every breakpoint.
 */
import fs from "fs";
import path from "path";
import { POSITION_COLORS, POSITION_COLORS_DARK, POSITIONS } from "@/lib/types";

const WEB = path.join(__dirname, "..", "..");

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;

describe("position badge contrast", () => {
  // The badge renders its label at 11-12px bold, so AA for normal text applies.
  it.each(POSITIONS)("%s is legible in light mode", (pos) => {
    expect(contrast("#ffffff", POSITION_COLORS[pos])).toBeGreaterThanOrEqual(AA);
  });

  it.each(POSITIONS)("%s is legible in dark mode", (pos) => {
    // Dark-mode badges carry dark text (#0f172a), not white — a fill light
    // enough to read on a dark page cannot also hold white text at 4.5:1.
    expect(contrast("#0f172a", POSITION_COLORS_DARK[pos])).toBeGreaterThanOrEqual(AA);
  });

  it("defines a dark counterpart for every light fill", () => {
    expect(Object.keys(POSITION_COLORS_DARK).sort()).toEqual(
      Object.keys(POSITION_COLORS).sort(),
    );
  });
});

describe("font wiring", () => {
  // Removing the `font-family: Arial` override was not enough on its own.
  // next/font defines `--font-geist-sans` on whichever element carries its
  // `.variable` class, while Tailwind's `@theme inline` puts `--font-sans` on
  // `:root`. With the classes on <body>, the theme variable resolved against a
  // variable that did not exist there, so `--font-sans` was empty and both the
  // body rule and the `font-sans` utility fell through to `ui-sans-serif` —
  // Geist was loaded, paid for, and still not rendered.
  const layout = fs.readFileSync(path.join(WEB, "app", "layout.tsx"), "utf8");

  it("declares the font variables on the same element the theme lands on", () => {
    const html = layout.match(/<html[^>]*>/)?.[0] ?? "";
    expect(html).toContain("geistSans.variable");
    expect(html).toContain("geistMono.variable");
  });

  it("does not reintroduce a font-family override in globals.css", () => {
    const css = fs
      .readFileSync(path.join(WEB, "app", "globals.css"), "utf8")
      // Comments explain the Arial rule that used to be here; only a live
      // declaration is a regression.
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/font-family:\s*Arial/i);
  });
});

describe("page shell", () => {
  const pages = fs
    .readdirSync(path.join(WEB, "app"), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => path.join(WEB, "app", f));

  it("is not re-implemented per page", () => {
    // `min-h-screen bg-white dark:bg-black p-8` was pasted into ~25 files, which
    // is how phones ended up with 32px desktop gutters on every route.
    const offenders = pages.filter((p) =>
      /min-h-screen[^"]*\bp-8\b/.test(fs.readFileSync(p, "utf8")),
    );
    expect(offenders.map((p) => path.relative(WEB, p))).toEqual([]);
  });

  it("keeps light-mode captions above the AA floor", () => {
    // `text-slate-400` measures 2.56:1 on the page ground. `--ink-subtle`
    // (slate-500, 4.6:1) is the floor, and the token is the way to reach it.
    const offenders = pages
      .concat(
        fs
          .readdirSync(path.join(WEB, "components"), { recursive: true, encoding: "utf8" })
          .filter((f) => typeof f === "string" && f.endsWith(".tsx"))
          .map((f) => path.join(WEB, "components", f)),
      )
      .filter((p) => /(?<!dark:)text-slate-(300|400)\b/.test(fs.readFileSync(p, "utf8")));
    expect(offenders.map((p) => path.relative(WEB, p))).toEqual([]);
  });
});
