import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  buildWorkflowHistory,
  fetchScheduledWorkflowRuns,
  type DayState,
  type DayCell,
  type WorkflowRow,
} from "@/lib/workflow-runs";

export const revalidate = 600;

const LOOKBACK_DAYS = 21;

const STATE_STYLES: Record<DayState, string> = {
  success: "bg-emerald-500 dark:bg-emerald-500",
  failure: "bg-rose-500 dark:bg-rose-500",
  in_progress: "bg-amber-400 dark:bg-amber-400 animate-pulse",
  cancelled: "bg-slate-400 dark:bg-slate-600",
  none: "bg-slate-100 dark:bg-slate-800/60",
};

const STATE_LABEL: Record<DayState, string> = {
  success: "Success",
  failure: "Failure",
  in_progress: "In progress",
  cancelled: "Cancelled / skipped",
  none: "No run",
};

export default async function WorkflowsPage() {
  const user = await getAuthenticatedUser();
  if (!user?.isAdmin) redirect("/");

  const now = new Date();
  const runs = await fetchScheduledWorkflowRuns(LOOKBACK_DAYS, now);
  const history = buildWorkflowHistory(runs, now, LOOKBACK_DAYS);
  const todayKey = history.days[history.days.length - 1];

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Workflow Status
          </h1>
          <Link
            href="/admin"
            className="text-sm text-slate-500 dark:text-slate-400 hover:underline"
          >
            ← User Management
          </Link>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Scheduled GitHub Actions over the last {LOOKBACK_DAYS} days (UTC).
          Each square is a day; hover for run counts, click to open the latest
          run. Manual re-runs of a scheduled workflow are included.
        </p>
      </header>

      <Legend />

      {history.workflows.length === 0 ? (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          No scheduled workflow runs found in the window — either none have run
          yet, or the GitHub Actions API could not be reached.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900">
                <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900 px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-300">
                  Workflow
                </th>
                {history.days.map((d) => (
                  <th
                    key={d}
                    className={`px-0.5 py-2 text-center text-[10px] font-normal tabular-nums ${
                      d === todayKey
                        ? "text-slate-900 dark:text-white font-semibold"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                    title={d}
                  >
                    {dayLabel(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.workflows.map((wf) => (
                <WorkflowRowView key={wf.name} wf={wf} todayKey={todayKey} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Generated {new Date(history.generatedAt).toUTCString()} · refreshes
        every 10 minutes.
      </p>
    </main>
  );
}

function dayLabel(key: string): string {
  // key = YYYY-MM-DD → "D" (day of month), with month on the 1st.
  const [, month, day] = key.split("-");
  return day === "01" ? `${Number(month)}/1` : String(Number(day));
}

function Legend() {
  const states: DayState[] = [
    "success",
    "failure",
    "in_progress",
    "cancelled",
    "none",
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600 dark:text-slate-400">
      {states.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={`inline-block h-3.5 w-3.5 rounded-sm ${STATE_STYLES[s]}`} />
          {STATE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

function WorkflowRowView({
  wf,
  todayKey,
}: {
  wf: WorkflowRow;
  todayKey: string;
}) {
  return (
    <tr className="border-t border-slate-100 dark:border-slate-900">
      <td className="sticky left-0 z-10 bg-white dark:bg-slate-950 px-4 py-2 align-middle">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${STATE_STYLES[wf.lastState]}`}
            title={`Last run: ${STATE_LABEL[wf.lastState]}`}
          />
          <span className="font-medium text-slate-900 dark:text-white whitespace-nowrap">
            {wf.lastRunUrl ? (
              <a href={wf.lastRunUrl} className="hover:underline">
                {wf.name}
              </a>
            ) : (
              wf.name
            )}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
          {wf.successRate !== null
            ? `${Math.round(wf.successRate * 100)}% ok`
            : "—"}{" "}
          · {wf.totalRuns} run{wf.totalRuns === 1 ? "" : "s"}
          {wf.lastRunAt ? ` · last ${relativeTime(wf.lastRunAt)}` : ""}
        </div>
      </td>
      {wf.cells.map((cell) => (
        <td key={cell.date} className="px-0.5 py-2 text-center">
          <DaySquare cell={cell} isToday={cell.date === todayKey} />
        </td>
      ))}
    </tr>
  );
}

function DaySquare({ cell, isToday }: { cell: DayCell; isToday: boolean }) {
  const title =
    cell.total === 0
      ? `${cell.date}: no run`
      : `${cell.date}: ${cell.total} run${cell.total === 1 ? "" : "s"}` +
        `${cell.failures ? `, ${cell.failures} failed` : ""}` +
        `${cell.successes ? `, ${cell.successes} ok` : ""}`;

  const square = (
    <span
      className={`inline-block h-4 w-4 rounded-sm ${STATE_STYLES[cell.state]} ${
        isToday ? "ring-1 ring-slate-900 dark:ring-white ring-offset-1 ring-offset-white dark:ring-offset-slate-950" : ""
      }`}
      title={title}
    />
  );

  return cell.latestUrl ? (
    <a href={cell.latestUrl} className="inline-block align-middle">
      {square}
    </a>
  ) : (
    square
  );
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "<1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
