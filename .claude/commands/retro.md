---
description: "Retrospective on the current task — conversation friction analysis plus git-based engineering metrics, with persistent history and trend tracking"
---

Run a retrospective on the task just completed in this conversation. Follow all steps carefully.

## Arguments
- `/retro` — conversation retro + last 7 days of git metrics (default)
- `/retro 24h` — git metrics for last 24 hours
- `/retro 14d` — git metrics for last 14 days
- `/retro 30d` — git metrics for last 30 days
- `/retro compare` — compare current window vs prior same-length window

If an argument is provided but doesn't match a number followed by `d` or `h`, or the word `compare`, show usage and stop.

---

## Part A — Conversation Friction Analysis

### Step 1 — Collect friction points

Review the entire conversation history. Look for:

- **Errors or failures** you (the agent) encountered that required retrying or backtracking (e.g. wrong tool use, broken command, incorrect assumption about the codebase)
- **User corrections** — any time the user redirected you, said "no not that", "don't do X", "actually do Y instead", or had to re-explain something
- **Repeated lookups** — files or facts you had to re-read because context wasn't documented
- **Surprises** — things that differed from what the docs or code suggested, causing wasted effort
- **Missing guardrails** — cases where a rule, architectural constraint, or workflow step wasn't documented but should have been
- **Manual approval gates** — any time the user had to manually approve a tool call during "accept edits" mode. For each one, consider: was the operation actually safe? Could a permission entry in settings, a different tool choice, or a safer command formulation have avoided the prompt? Propose the least-privilege fix that removes friction without expanding blast radius.

For each friction point, record:
1. What happened (brief description)
2. Category: `agent-error` | `user-correction` | `missing-docs` | `missing-skill` | `missing-guardrail` | `approval-gate` | `other`
3. Root cause: what underlying gap caused it?
4. Proposed fix: a specific change to a doc, skill, AGENTS.md, CLAUDE.md, or new file — or "no action needed" if it was a one-off

### Step 2 — Present friction findings

Display a concise table:

```
| # | What happened | Category | Root cause | Proposed fix |
|---|--------------|----------|------------|--------------|
| 1 | ...          | ...      | ...        | ...          |
```

Then list the concrete doc/skill changes you propose.

---

## Part B — Git-Based Engineering Metrics

### Step 3 — Detect default branch and gather data

Detect the repo's default branch:
```bash
_DEFAULT=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null || echo "main")
```

Fetch and identify the current user:
```bash
git fetch origin $_DEFAULT --quiet
git config user.name
```

Parse the argument to determine the time window (default 7 days). Run ALL of these git commands in parallel:

```bash
# 1. Commits with metadata
git log origin/$_DEFAULT --since="<window>" --format="%H|%aN|%ae|%ai|%s" --shortstat

# 2. Per-commit test vs production LOC
git log origin/$_DEFAULT --since="<window>" --format="COMMIT:%H|%aN" --numstat

# 3. Timestamps for session detection (Pacific time)
TZ=America/Los_Angeles git log origin/$_DEFAULT --since="<window>" --format="%at|%aN|%ai|%s" | sort -n

# 4. File hotspots
git log origin/$_DEFAULT --since="<window>" --format="" --name-only | grep -v '^$' | sort | uniq -c | sort -rn

# 5. PR numbers from commit messages
git log origin/$_DEFAULT --since="<window>" --format="%s" | grep -oE '#[0-9]+' | sort -un | sed 's/^/#/'

# 6. Test file count
find . -name '*.test.*' -o -name '*.spec.*' -o -name '*_test.*' -o -name '*_spec.*' 2>/dev/null | grep -v node_modules | wc -l

# 7. Test files changed in window
git log origin/$_DEFAULT --since="<window>" --format="" --name-only | grep -E '\.(test|spec)\.' | sort -u | wc -l
```

### Step 4 — Compute metrics summary table

| Metric | Value |
|--------|-------|
| Commits | N |
| PRs merged | N |
| Insertions / Deletions | +N / -N |
| Net LOC | N |
| Test LOC ratio | N% |
| Active days | N |
| Detected sessions | N |
| AI-assisted commits | N% |

**AI collaboration note:** If commits have `Co-Authored-By` AI trailers (e.g., `noreply@anthropic.com`), report the AI-assisted commit percentage. Frame neutrally — this is a tool usage metric, not a judgment.

### Step 5 — Commit time distribution

Show hourly histogram in Pacific time:

```
Hour  Commits  ████████████████
 09:    5      █████
 22:    8      ████████
```

Call out peak hours, dead zones, and late-night patterns (after 10pm).

### Step 6 — Work session detection

Detect sessions using **45-minute gap** threshold between consecutive commits.

Classify:
- **Deep sessions** (50+ min)
- **Medium sessions** (20–50 min)
- **Micro sessions** (<20 min, single-commit fire-and-forget)

Report total active coding time, average session length, and LOC per hour.

### Step 7 — Commit type breakdown

Categorize by conventional commit prefix (feat/fix/refactor/test/chore/docs). Show as percentage bar:

```
feat:     8  (40%)  ████████████████████
fix:     10  (50%)  █████████████████████████
chore:    2  (10%)  █████
```

Flag if fix ratio exceeds 50% — may indicate insufficient review before merging.

### Step 8 — Hotspot analysis

Show top 10 most-changed files. Flag files changed 5+ times (churn hotspots) and note test vs production files.

### Step 9 — Focus score + ship of the week

**Focus score:** Percentage of commits touching the single most-changed top-level directory. Higher = deeper focused work. Lower = scattered context-switching. Report as: "Focus score: 62% (scripts/)"

**Ship of the week:** Auto-identify the highest-LOC PR/commit in the window. Highlight PR number, title, LOC changed, and why it matters (infer from commit messages and files touched).

### Step 10 — Streak tracking

Count consecutive days with at least 1 commit to the default branch, going back from today:

```bash
TZ=America/Los_Angeles git log origin/$_DEFAULT --format="%ad" --date=format:"%Y-%m-%d" | sort -u
```

Count backward from today — how many consecutive days have at least one commit? Display: "Shipping streak: N consecutive days"

### Step 11 — Load history and compare

Check for prior retro snapshots:
```bash
ls -t .context/retros/*.json 2>/dev/null
```

**If prior retros exist:** Load the most recent one. Show a **Trends vs Last Retro** section:
```
                    Last        Now         Delta
Test ratio:         22%    →    41%         ↑19pp
Sessions:           10     →    14          ↑4
Commits:            32     →    47          ↑47%
Deep sessions:      3      →    5           ↑2
Fix ratio:          54%    →    30%         ↓24pp (improving)
LOC/hour:           200    →    350         ↑75%
```

**If no prior retros:** "First retro recorded — run again next week to see trends."

### Step 12 — Save retro snapshot

```bash
mkdir -p .context/retros
```

Determine the next sequence number for today:
```bash
today=$(TZ=America/Los_Angeles date +%Y-%m-%d)
existing=$(ls .context/retros/${today}-*.json 2>/dev/null | wc -l | tr -d ' ')
next=$((existing + 1))
# Save as .context/retros/${today}-${next}.json
```

Save a JSON snapshot with this schema:

```json
{
  "date": "2026-03-17",
  "window": "7d",
  "metrics": {
    "commits": 47,
    "prs_merged": 12,
    "insertions": 3200,
    "deletions": 800,
    "net_loc": 2400,
    "test_ratio": 0.41,
    "active_days": 6,
    "sessions": 14,
    "deep_sessions": 5,
    "avg_session_minutes": 42,
    "loc_per_session_hour": 350,
    "feat_pct": 0.40,
    "fix_pct": 0.30,
    "peak_hour": 22,
    "ai_assisted_commits": 32
  },
  "streak_days": 47,
  "friction_points": 3
}
```

**Note:** The JSON snapshot is the ONLY file written to the filesystem. All narrative output goes directly to the conversation.

---

## Part C — Combined Presentation

### Step 13 — Present the full retro

Structure the output as:

**Tweetable summary** (first line):
```
Week of Mar 17: 47 commits, 3.2k LOC, 38% tests, 12 PRs, peak: 10pm | Streak: 47d | 3 friction points
```

## Engineering Retro: [date range]

### Summary Table
(from Step 4)

### Trends vs Last Retro
(from Step 11 — skip if first retro)

### Time & Session Patterns
(from Steps 5–6 — narrative interpreting work patterns, peak hours, session quality)

### Shipping Velocity
(from Steps 7–8 — commit type mix, hotspot analysis, PR discipline)

### Focus & Highlights
(from Step 9 — focus score, ship of the week)

### Streak
(from Step 10)

### Conversation Friction Points
(from Steps 1–2 — the friction table and proposed fixes)

### What You Did Well
2–3 specific things anchored in actual commits from the window. Not "great work" — say exactly what was good. Example: "Shipped the entire projection pipeline refactor in 3 focused sessions with 45% test coverage."

### Where to Level Up
1–2 specific, actionable suggestions anchored in actual data. Frame as investment, not criticism. Example: "Test ratio was 12% this week — adding coverage to the scraper module before it gets more complex would pay off."

### 3 Habits for Next Week
Small, practical, realistic. Each takes <5 minutes to adopt.

**Ask the user to confirm before proceeding to implementation.** Wait for explicit approval. The user may say "skip #2", "also add X", or "go ahead".

---

## Part D — Implement Approved Changes

### Step 14 — Implement approved changes

After the user approves:

1. Start from updated main:
   `git checkout main && git pull origin main`

2. Create a retro branch:
   `git checkout -b retro/<task-slug>` (derive a short slug from the task just completed)

3. Make the approved changes:
   - Edit or create doc files under `docs/`, `AGENTS.md`, `CLAUDE.md`, or `.claude/commands/`
   - Keep changes focused on what was approved — do not refactor unrelated docs

4. Commit:
   `git add <specific files> && git commit -m "retro: <short description of what was improved>"`

5. Push and open a PR:
   `git push -u origin retro/<task-slug>`
   `gh pr create --title "retro: <short description>" --body "..."`

   The PR body should include:
   - A brief summary of what task triggered this retro
   - The friction-point table from Part A
   - The key engineering metrics from Part B
   - A section listing each file changed and why

## Compare Mode

When the user runs `/retro compare` (or `/retro compare 14d`):

1. Compute metrics for the current window using `--since`
2. Compute metrics for the prior same-length window using both `--since` and `--until` to avoid overlap
3. Show side-by-side comparison table with deltas and arrows
4. Write a brief narrative on biggest improvements and regressions
5. Save only the current-window snapshot to `.context/retros/`

## Tone

- Encouraging but candid — no coddling, no generic praise
- Specific and concrete — always anchor in actual commits or conversation events
- Frame improvements as leveling up, not criticism
- "Great work" is banned — say exactly what was good and why
- Growth suggestions should feel like investment advice — "this is worth your time because..."
- Keep total output around 1500–2500 words
- Use markdown tables and code blocks for data, prose for narrative

## Notes

- This is a solo engineer repo. Do not generate team breakdowns, per-teammate sections, or contributor leaderboards.
- If there are no actionable friction points, say so clearly in Part A.
- Do not invent problems. Only surface real friction from this conversation and real patterns from git history.
- Prefer editing existing docs over creating new files.
- New skill files go in `.claude/commands/<name>.md` and must be registered in CLAUDE.md's skill list and documentation map.
- Use `origin/<default>` for all git queries (not local main which may be stale).
- Convert all timestamps to Pacific time for display.
- If the window has zero commits, report it and suggest a different window.
- On first run with no prior retros, skip comparison sections gracefully.
