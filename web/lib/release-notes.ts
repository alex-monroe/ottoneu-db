/**
 * Weekly release notes for `/release-notes`.
 *
 * One Markdown file per week lives in `web/content/release-notes/`, named for
 * the last day of the week it covers (`2026-10-18.md`), so a weekly job can add
 * a file through a PR without touching code. The page is static, so the files
 * are read at build time and a merged notes PR goes live with the deploy.
 *
 * Only the Markdown the notes need is understood: a `#` title, `##`/`###`
 * headings, paragraphs, `- ` bullets, and inline `**bold**`, `_italic_`,
 * `` `code` ``, `[text](url)` and `#123` (a link to that pull request).
 * Anything else renders as plain text, never as HTML.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const RELEASE_NOTES_DIR = path.join(process.cwd(), "content", "release-notes");
export const PR_URL_BASE = "https://github.com/alex-monroe/ottoneu-db/pull/";

const FILE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "list"; items: Inline[][] };

export interface ReleaseNotesWeek {
  /** The file's date, the last day of the week covered (YYYY-MM-DD). */
  date: string;
  title: string;
  blocks: Block[];
}

const INLINE_RE =
  /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|(?<!\w)_[^_]+_(?!\w)|(?<![\w/&?=])#\d+(?![\w-]))/g;

/** A link target the page will render: site-relative paths and http(s) only. */
function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (/^https?:\/\//i.test(href)) return href;
  return null;
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE_RE)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) out.push({ kind: "text", text: source.slice(last, start) });
    last = start + token.length;

    if (token.startsWith("`")) {
      out.push({ kind: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("**")) {
      out.push({ kind: "bold", text: token.slice(2, -2) });
    } else if (token.startsWith("_")) {
      out.push({ kind: "italic", text: token.slice(1, -1) });
    } else if (token.startsWith("#")) {
      out.push({ kind: "link", text: token, href: `${PR_URL_BASE}${token.slice(1)}` });
    } else {
      const [, text, href] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      const safe = safeHref(href ?? "");
      out.push(safe ? { kind: "link", text, href: safe } : { kind: "text", text: token });
    }
  }
  if (last < source.length) out.push({ kind: "text", text: source.slice(last) });
  return out;
}

/** Parse one week's file. The `#` line is the title; the date comes from the filename. */
export function parseReleaseNotes(date: string, markdown: string): ReleaseNotesWeek {
  let title = date;
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Inline[][] | null = null;

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", content: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
    if (list) {
      blocks.push({ kind: "list", items: list });
      list = null;
    }
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flush();
      if (heading[1].length === 1) title = heading[2];
      else blocks.push({ kind: "heading", level: heading[1].length as 2 | 3, text: heading[2] });
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (paragraph.length) flush();
      (list ??= []).push(parseInline(bullet[1]));
      continue;
    }
    if (list) flush();
    paragraph.push(line);
  }
  flush();
  return { date, title, blocks };
}

/** Every week's notes, newest first. A missing folder means no notes yet. */
export function loadReleaseNotes(dir: string = RELEASE_NOTES_DIR): ReleaseNotesWeek[] {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  return files
    .map((f) => f.match(FILE_RE)?.[1])
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => b.localeCompare(a))
    .map((date) => parseReleaseNotes(date, readFileSync(path.join(dir, `${date}.md`), "utf8")));
}
