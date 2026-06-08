/**
 * Server-only helpers for the admin workflow-status page (/admin/workflows).
 *
 * Reads GitHub Actions run history directly from the public REST API and
 * shapes it into a per-workflow × per-day grid (a "GitHub status page" view of
 * our scheduled jobs). The repo is public, so no token is required; if a
 * `GITHUB_TOKEN` is present it is used for a higher rate limit.
 *
 * Scope: only the cron-scheduled workflows (those with at least one
 * `event=schedule` run in the window). For those workflows every run is shown,
 * including manual `workflow_dispatch` re-runs, so an operator re-running a
 * failed job is reflected. Push/PR-triggered workflows (tests, code review) are
 * intentionally excluded. GH #559.
 */

const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? "alex-monroe";
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? "ottoneu-db";
const API_BASE = "https://api.github.com";

export type DayState =
  | "success"
  | "failure"
  | "in_progress"
  | "cancelled"
  | "none";

export interface WorkflowRun {
  workflow: string;
  event: string;
  /** GitHub run status: queued | in_progress | completed */
  status: string;
  /** GitHub conclusion: success | failure | cancelled | timed_out | ... | null */
  conclusion: string | null;
  createdAt: string;
  htmlUrl: string;
}

export interface DayCell {
  date: string; // YYYY-MM-DD (UTC)
  state: DayState;
  total: number;
  failures: number;
  successes: number;
  /** Link to the most recent run on this day, if any. */
  latestUrl: string | null;
}

export interface WorkflowRow {
  name: string;
  cells: DayCell[];
  lastState: DayState;
  lastRunAt: string | null;
  lastRunUrl: string | null;
  totalRuns: number;
  successRate: number | null; // 0..1 over completed runs in the window
}

export interface WorkflowHistory {
  days: string[]; // YYYY-MM-DD, oldest → newest
  workflows: WorkflowRow[];
  generatedAt: string;
}

/** UTC date key (YYYY-MM-DD) for an ISO timestamp. */
export function dayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toISOString().slice(0, 10);
}

/** The list of YYYY-MM-DD UTC day keys ending at `now`, oldest → newest. */
export function dayRange(now: Date, days: number): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(dayKey(d));
  }
  return keys;
}

function runState(run: WorkflowRun): DayState {
  if (run.status !== "completed") return "in_progress";
  switch (run.conclusion) {
    case "success":
      return "success";
    case "failure":
    case "timed_out":
    case "startup_failure":
      return "failure";
    case "cancelled":
    case "skipped":
    case "stale":
      return "cancelled";
    default:
      return run.conclusion ? "cancelled" : "in_progress";
  }
}

// Worst-wins precedence so a red day is never masked by a later green run.
const STATE_PRIORITY: Record<DayState, number> = {
  failure: 4,
  in_progress: 3,
  success: 2,
  cancelled: 1,
  none: 0,
};

/**
 * Shape raw runs into the per-workflow × per-day grid. Pure (no I/O) so it can
 * be unit-tested. Only workflows with at least one `schedule` run are kept.
 */
export function buildWorkflowHistory(
  runs: WorkflowRun[],
  now: Date,
  days: number,
): WorkflowHistory {
  const dayKeys = dayRange(now, days);
  const inWindow = new Set(dayKeys);

  const scheduled = new Set(
    runs.filter((r) => r.event === "schedule").map((r) => r.workflow),
  );

  const byWorkflow = new Map<string, WorkflowRun[]>();
  for (const run of runs) {
    if (!scheduled.has(run.workflow)) continue;
    if (!inWindow.has(dayKey(run.createdAt))) continue;
    const list = byWorkflow.get(run.workflow) ?? [];
    list.push(run);
    byWorkflow.set(run.workflow, list);
  }

  const workflows: WorkflowRow[] = [];
  for (const name of Array.from(byWorkflow.keys()).sort((a, b) =>
    a.localeCompare(b),
  )) {
    const wfRuns = byWorkflow
      .get(name)!
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const cellByDay = new Map<string, DayCell>();
    for (const key of dayKeys) {
      cellByDay.set(key, {
        date: key,
        state: "none",
        total: 0,
        failures: 0,
        successes: 0,
        latestUrl: null,
      });
    }

    for (const run of wfRuns) {
      const key = dayKey(run.createdAt);
      const cell = cellByDay.get(key);
      if (!cell) continue;
      const state = runState(run);
      cell.total += 1;
      if (state === "failure") cell.failures += 1;
      if (state === "success") cell.successes += 1;
      if (STATE_PRIORITY[state] >= STATE_PRIORITY[cell.state]) {
        cell.state = state;
      }
      cell.latestUrl = run.htmlUrl; // runs are sorted ascending → last wins
    }

    const completed = wfRuns.filter((r) => r.status === "completed");
    const successCount = completed.filter(
      (r) => runState(r) === "success",
    ).length;
    const last = wfRuns[wfRuns.length - 1] ?? null;

    workflows.push({
      name,
      cells: dayKeys.map((k) => cellByDay.get(k)!),
      lastState: last ? runState(last) : "none",
      lastRunAt: last ? last.createdAt : null,
      lastRunUrl: last ? last.htmlUrl : null,
      totalRuns: wfRuns.length,
      successRate: completed.length ? successCount / completed.length : null,
    });
  }

  return { days: dayKeys, workflows, generatedAt: now.toISOString() };
}

async function fetchRunsByEvent(
  event: string,
  sinceIso: string,
): Promise<WorkflowRun[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const runs: WorkflowRun[] = [];
  const perPage = 100;
  for (let page = 1; page <= 5; page++) {
    const url =
      `${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs` +
      `?event=${event}&created=%3E%3D${sinceIso}&per_page=${perPage}&page=${page}`;
    const res = await fetch(url, { headers, next: { revalidate: 600 } });
    if (!res.ok) {
      console.error(`GitHub Actions API ${event} page ${page}: ${res.status}`);
      break;
    }
    const json = (await res.json()) as {
      workflow_runs?: Array<{
        name: string;
        event: string;
        status: string;
        conclusion: string | null;
        created_at: string;
        html_url: string;
      }>;
    };
    const batch = json.workflow_runs ?? [];
    for (const r of batch) {
      runs.push({
        workflow: r.name,
        event: r.event,
        status: r.status,
        conclusion: r.conclusion,
        createdAt: r.created_at,
        htmlUrl: r.html_url,
      });
    }
    if (batch.length < perPage) break;
  }
  return runs;
}

/**
 * Fetch the scheduled + manual-dispatch run history for the given window.
 * Returns an empty array on API failure (the page renders an error state).
 */
export async function fetchScheduledWorkflowRuns(
  days: number,
  now: Date = new Date(),
): Promise<WorkflowRun[]> {
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - days);
  const sinceIso = dayKey(since);

  const [scheduled, dispatched] = await Promise.all([
    fetchRunsByEvent("schedule", sinceIso),
    fetchRunsByEvent("workflow_dispatch", sinceIso),
  ]);
  return [...scheduled, ...dispatched];
}
