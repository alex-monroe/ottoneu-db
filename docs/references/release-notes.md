# Weekly release notes

League members see what changed on the site each week at `/release-notes`. Each
week is one markdown file in `web/content/release-notes/`, named for the last
day it covers (`2026-10-25.md` covers Monday Oct 19 through Sunday Oct 25).
Files arrive by PR, so every week's wording is reviewed before it goes live,
and merging the PR publishes it through the normal Vercel deploy from `main`.

## The weekly job

`.github/workflows/weekly-release-notes.yml` runs Mondays at 13:00 UTC:

1. **Gather.** `web/scripts/gather-release-notes.ts` lists the PRs merged to
   `main` in the seven days before the run, using the repo-scoped
   `GET /repos/{repo}/pulls` endpoint and the PR file lists. The pure logic
   lives in `web/lib/release-notes-gather.ts`:
   - a PR labelled **`no-release-notes`** is left out,
   - a PR that only touches notes files (the job's own PRs) is left out,
   - a PR any existing notes file already cites as `(#N)` is left out, so an
     overlapping or re-run window never repeats an entry,
   - the rest are tagged `user` or `internal`. Internal means every changed
     file is docs, CI, tests, migrations or agent/developer tooling
     (`INTERNAL_PREFIXES` / `INTERNAL_FILES`). This is only a hint to the writer.
2. **Write.** `anthropics/claude-code-action` (the `CLAUDE_CODE_OAUTH_TOKEN`
   secret, limited to file tools) reads that list plus the earlier weeks and
   writes the new file in the same shape. If the step fails or writes nothing,
   the script's `--write-fallback` writes the PR titles as-is instead.
3. **Open the PR.** The file is committed on `release-notes/<date>` and opened
   as a PR assigned to the repo owner. Edit the wording there, then merge.

A week with no new PRs, or one whose file or branch already exists, does
nothing. `workflow_dispatch` takes `until` (cover the 7 days before that date)
and `dry_run` (write and print the notes, no PR).

**Repo setting:** the job needs *Settings → Actions → General → Allow GitHub
Actions to create and approve pull requests*. PRs opened with `GITHUB_TOKEN` do
not set off other workflows, so `run-tests` and the Claude review do not run on
the notes PR, which only adds one markdown file.

## File shape

```markdown
# Week of October 19–25, 2026

One sentence summing up the week's highlights.

## New features
### Trades
- **Short bold lead.** One or two plain sentences for a team manager. (#801)

## Fixes
- ...

## Internal changes
- ...
```

The `#` line is the week's title on the page. Empty sections are left out.
Every bullet cites its PR as `(#N)`: the page links it to the PR, and the next
run treats any cited PR as covered. The page (`web/lib/release-notes.ts`)
understands only headings, paragraphs, `- ` bullets and inline bold, italic,
code and links, so the notes use nothing else. The title-only fallback uses a
single `## Changes` section in place of New features / Fixes.

## Locally

```bash
just release-notes --dry-run                     # this week so far, title-only notes
just release-notes --until 2026-10-26 --dry-run  # the week of Oct 19–25
```

`GITHUB_TOKEN` is optional locally because the repo is public, but
unauthenticated calls are rate-limited.
