/**
 * The release-notes reader (web/lib/release-notes.ts).
 *
 * The notes are written by hand or by the weekly job, so what matters is that
 * every file in the folder parses into the shapes the page renders, that the
 * newest week comes first, and that a link can never carry a script URL.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  PR_URL_BASE,
  loadReleaseNotes,
  parseInline,
  parseReleaseNotes,
} from "@/lib/release-notes";

describe("parseInline", () => {
  test("splits bold, italic, code, links and PR numbers out of text", () => {
    expect(parseInline("**Trades.** See [the log](/trades), `just x` and _soon_ (#758, #771).")).toEqual([
      { kind: "bold", text: "Trades." },
      { kind: "text", text: " See " },
      { kind: "link", text: "the log", href: "/trades" },
      { kind: "text", text: ", " },
      { kind: "code", text: "just x" },
      { kind: "text", text: " and " },
      { kind: "italic", text: "soon" },
      { kind: "text", text: " (" },
      { kind: "link", text: "#758", href: `${PR_URL_BASE}758` },
      { kind: "text", text: ", " },
      { kind: "link", text: "#771", href: `${PR_URL_BASE}771` },
      { kind: "text", text: ")." },
    ]);
  });

  test("leaves snake_case words and #1-seed alone", () => {
    expect(parseInline("the fa_market table")).toEqual([{ kind: "text", text: "the fa_market table" }]);
    expect(parseInline("#1-seed odds")).toEqual([{ kind: "text", text: "#1-seed odds" }]);
  });

  test("never links an unsafe URL", () => {
    for (const source of ["[x](javascript:alert(1))", "[x](//evil.example)", "[x](data:text/html,hi)"]) {
      expect(parseInline(source).some((part) => part.kind === "link")).toBe(false);
    }
  });
});

describe("parseReleaseNotes", () => {
  test("takes the title from the # line and groups bullets into lists", () => {
    const week = parseReleaseNotes(
      "2026-10-18",
      "# Week of Oct 11\n\nIntro line\ncontinued.\n\n## New features\n\n### Trades\n- One\n- Two\n\n## Fixes\n- Three\n",
    );
    expect(week.title).toBe("Week of Oct 11");
    expect(week.blocks).toEqual([
      { kind: "paragraph", content: [{ kind: "text", text: "Intro line continued." }] },
      { kind: "heading", level: 2, text: "New features" },
      { kind: "heading", level: 3, text: "Trades" },
      { kind: "list", items: [[{ kind: "text", text: "One" }], [{ kind: "text", text: "Two" }]] },
      { kind: "heading", level: 2, text: "Fixes" },
      { kind: "list", items: [[{ kind: "text", text: "Three" }]] },
    ]);
  });

  test("falls back to the date when the file has no title", () => {
    expect(parseReleaseNotes("2026-10-25", "- Only a bullet").title).toBe("2026-10-25");
  });
});

describe("loadReleaseNotes", () => {
  test("reads dated files newest first and ignores everything else", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "release-notes-"));
    writeFileSync(path.join(dir, "2026-10-18.md"), "# First\n");
    writeFileSync(path.join(dir, "2026-10-25.md"), "# Second\n");
    writeFileSync(path.join(dir, "README.md"), "# Not a week\n");
    expect(loadReleaseNotes(dir).map((w) => [w.date, w.title])).toEqual([
      ["2026-10-25", "Second"],
      ["2026-10-18", "First"],
    ]);
  });

  test("returns no weeks when the folder is missing", () => {
    expect(loadReleaseNotes(path.join(tmpdir(), "no-such-release-notes-dir"))).toEqual([]);
  });

  test("every committed notes file parses into a titled week with content", () => {
    const weeks = loadReleaseNotes(path.join(__dirname, "..", "..", "content", "release-notes"));
    expect(weeks.length).toBeGreaterThan(0);
    for (const week of weeks) {
      expect(week.title).not.toBe(week.date);
      expect(week.blocks.some((b) => b.kind === "list")).toBe(true);
    }
  });
});
