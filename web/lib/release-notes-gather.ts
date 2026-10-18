/**
 * Pure helpers for the weekly release-notes job
 * (`web/scripts/gather-release-notes.ts`, run by
 * `.github/workflows/weekly-release-notes.yml`).
 *
 * The job lists the PRs merged to `main` in the past week, sorts each into
 * league-facing or internal, and either hands that list to Claude to write the
 * week's notes file or, as a fallback, renders the PR titles as-is. Everything
 * here is I/O-free so it can be tested without GitHub.
 */

/**
 * Where each week's notes file lives, relative to the repo root. The page
 * reads the same folder (`web/lib/release-notes.ts`).
 */
export const NOTES_REPO_DIR = "web/content/release-notes";

/** A PR with this label is left out of the notes entirely. */
export const SKIP_LABEL = "no-release-notes";

/**
 * Paths that change nothing a league member sees. A PR touching only these is
 * listed under "Internal changes" rather than dropped, matching how the
 * hand-written first week grouped them.
 */
const INTERNAL_PREFIXES = [
  ".agents/",
  ".claude/",
  ".devcontainer/",
  ".github/",
  "docs/",
  "migrations/",
  // Developer tooling under scripts/ (the rest of scripts/ feeds the site).
  "scripts/antigravity_setup.py",
  "scripts/check_",
  "scripts/doctor.py",
  "scripts/tests/",
  "web/__tests__/",
];

const INTERNAL_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "Justfile",
  "pyproject.toml",
  "requirements.txt",
  "uv.lock",
]);

export interface MergedPr {
  number: number;
  title: string;
  body: string;
  url: string;
  mergedAt: string;
  labels: string[];
  files: string[];
}

export type PrKind = "skip" | "internal" | "user";

export interface ClassifiedPr extends MergedPr {
  kind: Exclude<PrKind, "skip">;
}

export interface WeekWindow {
  /** First day covered, inclusive (YYYY-MM-DD, UTC). */
  since: string;
  /** Day after the last day covered, exclusive (YYYY-MM-DD, UTC). */
  until: string;
  /** Last day covered; also the notes file's name. */
  lastDay: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/**
 * The seven days ending yesterday (UTC). Run on a Monday, that is the previous
 * Monday through Sunday, and the file is named for the Sunday.
 *
 * When the latest notes file is from the past two weeks, the window starts on
 * that file's day instead: PRs merged later that same day were not in it, and
 * the cited-PR filter drops the ones that were.
 */
export function weekWindow(now: Date, until?: string, latestNotes?: string): WeekWindow {
  const end = until ?? isoDate(now);
  let since = addUtcDays(end, -7);
  if (latestNotes && latestNotes < since && latestNotes >= addUtcDays(end, -14)) {
    since = latestNotes;
  }
  return { since, until: end, lastDay: addUtcDays(end, -1) };
}

export function notesPath(window: WeekWindow): string {
  return `${NOTES_REPO_DIR}/${window.lastDay}.md`;
}

function isInternalPath(path: string): boolean {
  if (INTERNAL_FILES.has(path)) return true;
  if (INTERNAL_PREFIXES.some((p) => path.startsWith(p))) return true;
  return /\.test\.tsx?$/.test(path) || /(^|\/)test_[^/]+\.py$/.test(path);
}

export function classifyPr(pr: Pick<MergedPr, "labels" | "files">): PrKind {
  if (pr.labels.includes(SKIP_LABEL)) return "skip";
  // The job's own notes PRs touch nothing but notes files.
  if (pr.files.length > 0 && pr.files.every((f) => f.startsWith(`${NOTES_REPO_DIR}/`))) {
    return "skip";
  }
  if (pr.files.length > 0 && pr.files.every(isInternalPath)) return "internal";
  return "user";
}

/**
 * Every `#123` PR reference in the given notes files, by the same rule the page
 * links them (so "#1-seed" is not PR 1).
 */
export function citedPrNumbers(notes: string[]): Set<number> {
  const cited = new Set<number>();
  for (const text of notes) {
    for (const m of text.matchAll(/(?<![\w/&?=])#(\d+)(?![\w-])/g)) cited.add(Number(m[1]));
  }
  return cited;
}

/**
 * Classify the week's PRs, dropping skipped ones and any PR an earlier notes
 * file already covers (so overlapping windows never repeat an entry).
 */
export function selectPrs(prs: MergedPr[], alreadyCited: Set<number>): ClassifiedPr[] {
  const out: ClassifiedPr[] = [];
  for (const pr of [...prs].sort((a, b) => a.number - b.number)) {
    if (alreadyCited.has(pr.number)) continue;
    const kind = classifyPr(pr);
    if (kind === "skip") continue;
    out.push({ ...pr, kind });
  }
  return out;
}

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });

/** "October 19–25, 2026", or "October 26 – November 1, 2026" across a month. */
export function weekLabel(window: WeekWindow): string {
  const a = new Date(`${window.since}T00:00:00Z`);
  const b = new Date(`${window.lastDay}T00:00:00Z`);
  const ma = MONTH_FMT.format(a);
  const mb = MONTH_FMT.format(b);
  const year = b.getUTCFullYear();
  if (a.getUTCFullYear() !== year) {
    return `${ma} ${a.getUTCDate()}, ${a.getUTCFullYear()} – ${mb} ${b.getUTCDate()}, ${year}`;
  }
  if (ma === mb) return `${ma} ${a.getUTCDate()}–${b.getUTCDate()}, ${year}`;
  return `${ma} ${a.getUTCDate()} – ${mb} ${b.getUTCDate()}, ${year}`;
}

/**
 * The no-Claude version of a week's notes: PR titles grouped into league-facing
 * and internal. Same shape as the written notes (`#` title, a one-line intro,
 * `##` sections, `(#N)` citations) so the page renders either.
 */
export function renderFallbackNotes(window: WeekWindow, prs: ClassifiedPr[]): string {
  const user = prs.filter((p) => p.kind === "user");
  const internal = prs.filter((p) => p.kind === "internal");
  const noun = prs.length === 1 ? "pull request" : "pull requests";
  const lines = [
    `# Week of ${weekLabel(window)}`,
    "",
    `The ${prs.length} ${noun} merged this week, by title.`,
  ];
  if (user.length > 0) {
    lines.push("", "## Changes", ...user.map((p) => `- ${p.title} (#${p.number})`));
  }
  if (internal.length > 0) {
    lines.push("", "## Internal changes", ...internal.map((p) => `- ${p.title} (#${p.number})`));
  }
  return `${lines.join("\n")}\n`;
}
