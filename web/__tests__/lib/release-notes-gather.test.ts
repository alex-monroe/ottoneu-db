import {
  type MergedPr,
  NOTES_REPO_DIR,
  citedPrNumbers,
  classifyPr,
  notesPath,
  renderFallbackNotes,
  selectPrs,
  weekLabel,
  weekWindow,
} from "@/lib/release-notes-gather";

function pr(number: number, files: string[], labels: string[] = []): MergedPr {
  return {
    number,
    title: `PR ${number}`,
    body: "",
    url: `https://github.test/pull/${number}`,
    mergedAt: "2026-10-20T12:00:00Z",
    labels,
    files,
  };
}

describe("weekWindow", () => {
  it("covers the seven days before a Monday run and names the file for the Sunday", () => {
    const w = weekWindow(new Date("2026-10-26T13:00:00Z"));
    expect(w).toEqual({ since: "2026-10-19", until: "2026-10-26", lastDay: "2026-10-25" });
    expect(notesPath(w)).toBe(`${NOTES_REPO_DIR}/2026-10-25.md`);
  });

  it("takes an explicit end date", () => {
    expect(weekWindow(new Date(), "2026-11-02").since).toBe("2026-10-26");
  });

  it("reaches back to the latest notes file's day to catch PRs merged after it", () => {
    expect(weekWindow(new Date(), "2026-10-26", "2026-10-18").since).toBe("2026-10-18");
    // A same-week or long-stale file leaves the normal seven days.
    expect(weekWindow(new Date(), "2026-10-26", "2026-10-25").since).toBe("2026-10-19");
    expect(weekWindow(new Date(), "2026-10-26", "2026-09-27").since).toBe("2026-10-19");
  });
});

describe("weekLabel", () => {
  it("shortens a week inside one month", () => {
    expect(weekLabel(weekWindow(new Date(), "2026-10-26"))).toBe("October 19–25, 2026");
  });

  it("names both months across a month boundary", () => {
    expect(weekLabel(weekWindow(new Date(), "2026-11-02"))).toBe("October 26 – November 1, 2026");
  });

  it("names both years across New Year", () => {
    expect(weekLabel(weekWindow(new Date(), "2027-01-04"))).toBe(
      "December 28, 2026 – January 3, 2027",
    );
  });
});

describe("classifyPr", () => {
  it("treats a PR touching the site as league-facing", () => {
    expect(classifyPr(pr(1, ["web/app/trades/page.tsx", "docs/FRONTEND.md"]))).toBe("user");
  });

  it("treats data scripts as league-facing", () => {
    expect(classifyPr(pr(1, ["scripts/tasks/scrape_trades.py"]))).toBe("user");
  });

  it("treats docs, agent tooling, CI and tests alone as internal", () => {
    expect(
      classifyPr(
        pr(1, [".claude/skills/verify/SKILL.md", "AGENTS.md", ".github/workflows/x.yml",
          "web/__tests__/lib/x.test.ts", "scripts/tests/test_doctor.py", "scripts/doctor.py"]),
      ),
    ).toBe("internal");
  });

  it("skips a labelled PR and the job's own notes PRs", () => {
    expect(classifyPr(pr(1, ["web/app/page.tsx"], ["no-release-notes"]))).toBe("skip");
    expect(classifyPr(pr(1, [`${NOTES_REPO_DIR}/2026-10-25.md`]))).toBe("skip");
  });

  it("does not call a PR with no listed files internal", () => {
    expect(classifyPr(pr(1, []))).toBe("user");
  });
});

describe("selectPrs", () => {
  it("drops PRs an earlier notes file cites, sorted by number", () => {
    const cited = citedPrNumbers(["- **Trades** (#758)\n- Fix (#770, #771)\n- #1-seed odds"]);
    expect(cited).toEqual(new Set([758, 770, 771]));
    const out = selectPrs(
      [pr(780, ["web/app/page.tsx"]), pr(771, ["web/app/page.tsx"]), pr(779, ["docs/X.md"])],
      cited,
    );
    expect(out.map((p) => [p.number, p.kind])).toEqual([
      [779, "internal"],
      [780, "user"],
    ]);
  });
});

describe("renderFallbackNotes", () => {
  it("renders titles in the notes file's shape", () => {
    const w = weekWindow(new Date(), "2026-10-26");
    const md = renderFallbackNotes(
      w,
      selectPrs([pr(780, ["web/app/page.tsx"]), pr(781, ["docs/X.md"])], new Set()),
    );
    expect(md).toBe(
      [
        "# Week of October 19–25, 2026",
        "",
        "The 2 pull requests merged this week, by title.",
        "",
        "## Changes",
        "- PR 780 (#780)",
        "",
        "## Internal changes",
        "- PR 781 (#781)",
        "",
      ].join("\n"),
    );
  });
});
