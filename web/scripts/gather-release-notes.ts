/**
 * Gather the PRs merged to `main` in the past week for the release notes.
 *
 *   npx tsx scripts/gather-release-notes.ts [--until YYYY-MM-DD] [--json PATH]
 *                                           [--write-fallback] [--dry-run]
 *
 * Run every Monday by `.github/workflows/weekly-release-notes.yml`. It covers
 * the seven days before `--until` (default today, UTC), drops PRs labelled
 * `no-release-notes` and any PR an existing notes file already cites, and marks
 * the rest league-facing or internal by the paths they touch
 * (`web/lib/release-notes-gather.ts`).
 *
 * - `--json PATH` writes that list for Claude to turn into the week's notes.
 * - `--write-fallback` writes the notes file from the PR titles as-is, for
 *   when the Claude step fails. It never overwrites an existing file.
 * - `--dry-run` prints the fallback notes and writes nothing.
 *
 * In Actions it also sets the `notes_path`, `last_day` and `pr_count` outputs.
 *
 * Env: GITHUB_TOKEN (any token that can read the repo; optional locally for a
 * public repo, but unauthenticated calls are rate-limited), GITHUB_REPOSITORY
 * (default alex-monroe/ottoneu-db).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  type MergedPr,
  NOTES_REPO_DIR,
  citedPrNumbers,
  notesPath,
  renderFallbackNotes,
  selectPrs,
  weekWindow,
} from "../lib/release-notes-gather";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const API = "https://api.github.com";
// PR bodies are context for Claude, not content; keep the JSON small.
const BODY_CHARS = 1500;

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}: ${await res.text()}`);
  return (await res.json()) as T;
}

interface PullItem {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  merged_at: string | null;
  updated_at: string;
  labels: { name: string }[];
}

/**
 * PRs merged into `main` in [since, until). Walks closed PRs newest-updated
 * first and stops once a page is entirely older than the window (a PR merged
 * in the window was last updated no earlier than its merge).
 */
async function fetchMergedPrs(repo: string, since: string, until: string): Promise<MergedPr[]> {
  const from = `${since}T00:00:00Z`;
  const to = `${until}T00:00:00Z`;
  const items: PullItem[] = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await getJson<PullItem[]>(
      `${API}/repos/${repo}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100&page=${page}`,
    );
    items.push(...batch.filter((p) => p.merged_at && p.merged_at >= from && p.merged_at < to));
    if (batch.length < 100 || batch.every((p) => p.updated_at < from)) break;
  }
  const prs: MergedPr[] = [];
  for (const item of items) {
    const files: string[] = [];
    for (let page = 1; page <= 30; page++) {
      const batch = await getJson<{ filename: string }[]>(
        `${API}/repos/${repo}/pulls/${item.number}/files?per_page=100&page=${page}`,
      );
      files.push(...batch.map((f) => f.filename));
      if (batch.length < 100) break;
    }
    prs.push({
      number: item.number,
      title: item.title,
      body: (item.body ?? "").slice(0, BODY_CHARS),
      url: item.html_url,
      mergedAt: item.merged_at ?? "",
      labels: item.labels.map((l) => l.name),
      files,
    });
  }
  return prs;
}

function readExistingNotes(): string[] {
  const dir = path.join(REPO_ROOT, NOTES_REPO_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => readFileSync(path.join(dir, f), "utf8"));
}

function setOutput(name: string, value: string): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      until: { type: "string" },
      json: { type: "string" },
      "write-fallback": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const repo = process.env.GITHUB_REPOSITORY || "alex-monroe/ottoneu-db";
  const window = weekWindow(new Date(), values.until);
  const relPath = notesPath(window);

  const merged = await fetchMergedPrs(repo, window.since, window.until);
  const prs = selectPrs(merged, citedPrNumbers(readExistingNotes()));
  const internal = prs.filter((p) => p.kind === "internal").length;
  console.log(
    `${window.since}..${window.lastDay}: ${merged.length} merged, ${prs.length} to cover ` +
      `(${prs.length - internal} league-facing, ${internal} internal) -> ${relPath}`,
  );

  setOutput("notes_path", relPath);
  setOutput("last_day", window.lastDay);
  setOutput("pr_count", String(prs.length));

  if (values["dry-run"]) {
    console.log(`\n${renderFallbackNotes(window, prs)}`);
    return 0;
  }
  if (values.json) {
    writeFileSync(values.json, `${JSON.stringify({ window, notesPath: relPath, prs }, null, 2)}\n`);
  }
  if (values["write-fallback"] && prs.length > 0) {
    const abs = path.join(REPO_ROOT, relPath);
    if (existsSync(abs)) {
      console.log(`${relPath} already exists; leaving it as is.`);
    } else {
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, renderFallbackNotes(window, prs));
      console.log(`Wrote ${relPath} from PR titles.`);
    }
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
