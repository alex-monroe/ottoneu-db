---
description: Review Bash commands from the current session that required manual permission approval, group them by type, and evaluate which are candidates for new just targets or allowlist entries
---

Scan the current session for permission gate events and evaluate coverage against the Justfile and allowlist.

## Step 1 — Load reference files

Read `.claude/settings.local.json` — note every `Bash(...)` pattern in the allow list.

Read `Justfile` — note every recipe name and what command it wraps.

## Step 2 — Scan the conversation for Bash tool calls

Review the full conversation history in this session. Find every `Bash(...)` tool call that was made (by you or by any subagent you dispatched).

For each call, determine whether it is **pre-approved** under the current allowlist:
- Matches `Bash(just:*)` → covered (starts with `just `)
- Matches `Bash(git:*)` → covered
- Matches `Bash(gh ...:*)` or exact gh entry → covered
- Matches any other wildcard or exact entry → covered
- **Otherwise → manual permission gate**

## Step 3 — Group and categorize

Group manual permission gates by command family (the first word of the command, or the logical operation). For each group:

| Field | Description |
|-------|-------------|
| **Command pattern** | e.g. `which`, `mkdir -p`, `curl`, `brew install` |
| **Count** | How many times in this session |
| **Purpose** | What was being accomplished |
| **Already a just target?** | Does an existing `just <recipe>` cover this? |
| **Disposition** | One of: `new-just-target` · `new-allowlist-entry` · `use-existing-just` · `one-off` |

## Step 4 — Make recommendations

For each group, recommend the least-friction fix that keeps blast radius small:

- **`new-just-target`** — write the exact recipe to add to the Justfile (name + body)
- **`new-allowlist-entry`** — write the exact string to add to `settings.local.json` allow list
- **`use-existing-just`** — note which `just` recipe should have been used and why it wasn't (doc gap vs agent habit)
- **`one-off`** — explain why no action is needed

## Step 5 — Present findings

Display the table from Step 3, then list concrete proposed changes:

```
## Manual Permission Gates — [Session Date]

| Command | Count | Purpose | Just target? | Disposition |
|---------|-------|---------|--------------|-------------|
| ...     | ...   | ...     | ...          | ...         |

### Proposed changes

**New Justfile recipes:**
[exact recipe text]

**New allowlist entries:**
[exact JSON strings]

**Agent habit / doc gaps:**
[what should have been called and what doc needs updating]
```

## Notes

- This output feeds directly into the retro Step 2 table — surface impactful items as `approval-gate` friction points.
- Do not flag commands that are already in the allowlist — only flag ones that actually needed manual approval.
- Prefer `just` targets over raw allowlist entries for anything that wraps a complex or project-specific command. Prefer raw allowlist entries for simple, safe system utilities (e.g. `which`, `mkdir`).
