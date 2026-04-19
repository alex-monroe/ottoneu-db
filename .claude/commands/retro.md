---
description: Retrospective on the current task — identify friction points, propose doc/skill improvements, and open a PR with changes
---

Run a retrospective on the task just completed in this conversation. Follow these steps carefully.

## Step 0 — Review permission gates

Before collecting friction points, invoke the `review-permission-gates` skill. Its output identifies manual approval gates from this session — the findings slot directly into the Step 1 table under the `approval-gate` category with concrete proposed fixes already included. Complete Step 0 before proceeding to Step 1.

## Step 1 — Collect friction points

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

## Step 2 — Present findings for review

Display a concise table of findings:

```
| # | What happened | Category | Root cause | Proposed fix |
|---|--------------|----------|------------|--------------|
| 1 | ...          | ...      | ...        | ...          |
```

Then list the concrete changes you propose to make (which files to create or edit, and what content to add/change).

**Ask the user to confirm before proceeding.** Wait for explicit approval. The user may say "skip #2", "also add X", or "go ahead".

## Step 3 — Implement approved changes

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
   - The friction-point table from Step 2
   - A section listing each file changed and why

## Notes

- If there are no actionable friction points, say so clearly and skip Step 3.
- Do not invent problems. Only surface real friction from this conversation.
- Prefer editing existing docs over creating new files.
- New skill files go in `.claude/commands/<name>.md` and must be registered in CLAUDE.md's skill list and documentation map if they are user-invocable.
