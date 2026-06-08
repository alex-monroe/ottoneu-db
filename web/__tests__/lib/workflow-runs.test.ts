import {
  buildWorkflowHistory,
  dayKey,
  dayRange,
  type WorkflowRun,
} from "@/lib/workflow-runs";

function run(overrides: Partial<WorkflowRun>): WorkflowRun {
  return {
    workflow: "Daily Job",
    event: "schedule",
    status: "completed",
    conclusion: "success",
    createdAt: "2026-06-08T09:00:00Z",
    htmlUrl: "https://example.com/run",
    ...overrides,
  };
}

const NOW = new Date("2026-06-08T23:00:00Z");

describe("dayKey / dayRange", () => {
  it("dayKey returns the UTC date", () => {
    expect(dayKey("2026-06-08T23:30:00Z")).toBe("2026-06-08");
  });

  it("dayRange returns N ascending UTC day keys ending today", () => {
    const r = dayRange(NOW, 3);
    expect(r).toEqual(["2026-06-06", "2026-06-07", "2026-06-08"]);
  });
});

describe("buildWorkflowHistory", () => {
  it("keeps only workflows with a schedule run", () => {
    const runs = [
      run({ workflow: "Scheduled WF", event: "schedule" }),
      run({ workflow: "Push WF", event: "push" }),
    ];
    const h = buildWorkflowHistory(runs, NOW, 3);
    expect(h.workflows.map((w) => w.name)).toEqual(["Scheduled WF"]);
  });

  it("includes manual dispatch runs of a scheduled workflow", () => {
    const runs = [
      run({ workflow: "WF", event: "schedule", createdAt: "2026-06-07T09:00:00Z" }),
      run({ workflow: "WF", event: "workflow_dispatch", createdAt: "2026-06-08T09:00:00Z" }),
    ];
    const h = buildWorkflowHistory(runs, NOW, 3);
    expect(h.workflows[0].totalRuns).toBe(2);
  });

  it("produces one cell per day, oldest → newest", () => {
    const h = buildWorkflowHistory([run({})], NOW, 3);
    expect(h.days).toEqual(["2026-06-06", "2026-06-07", "2026-06-08"]);
    expect(h.workflows[0].cells.map((c) => c.date)).toEqual(h.days);
  });

  it("marks a day with no run as 'none'", () => {
    const h = buildWorkflowHistory(
      [run({ createdAt: "2026-06-08T09:00:00Z" })],
      NOW,
      3,
    );
    const cells = h.workflows[0].cells;
    expect(cells[0].state).toBe("none"); // 06-06
    expect(cells[2].state).toBe("success"); // 06-08
  });

  it("failure wins over a later success on the same day", () => {
    const runs = [
      run({ conclusion: "failure", createdAt: "2026-06-08T06:00:00Z" }),
      run({ conclusion: "success", createdAt: "2026-06-08T12:00:00Z" }),
    ];
    const h = buildWorkflowHistory(runs, NOW, 3);
    const today = h.workflows[0].cells[2];
    expect(today.state).toBe("failure");
    expect(today.total).toBe(2);
    expect(today.failures).toBe(1);
    expect(today.successes).toBe(1);
  });

  it("treats non-completed runs as in_progress", () => {
    const h = buildWorkflowHistory(
      [run({ status: "in_progress", conclusion: null })],
      NOW,
      3,
    );
    expect(h.workflows[0].cells[2].state).toBe("in_progress");
  });

  it("computes success rate over completed runs only", () => {
    const runs = [
      run({ conclusion: "success" }),
      run({ conclusion: "failure" }),
      run({ status: "in_progress", conclusion: null }), // excluded from rate
    ];
    const h = buildWorkflowHistory(runs, NOW, 3);
    expect(h.workflows[0].successRate).toBeCloseTo(0.5);
  });

  it("drops runs outside the window", () => {
    const runs = [
      run({ createdAt: "2026-06-08T09:00:00Z" }),
      run({ createdAt: "2026-05-01T09:00:00Z" }), // outside 3-day window
    ];
    const h = buildWorkflowHistory(runs, NOW, 3);
    expect(h.workflows[0].totalRuns).toBe(1);
  });

  it("reports the latest run as lastState/lastRunUrl", () => {
    const runs = [
      run({ conclusion: "failure", createdAt: "2026-06-07T09:00:00Z", htmlUrl: "old" }),
      run({ conclusion: "success", createdAt: "2026-06-08T09:00:00Z", htmlUrl: "new" }),
    ];
    const h = buildWorkflowHistory(runs, NOW, 3);
    expect(h.workflows[0].lastState).toBe("success");
    expect(h.workflows[0].lastRunUrl).toBe("new");
  });
});
