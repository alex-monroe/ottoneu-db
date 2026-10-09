---
name: create-pr
description: Create a pull request for current changes
---
1. Make sure you are on a feature branch, never `main`. In a worktree you
   already are; otherwise branch from the latest main without disturbing other
   checkouts: `git fetch origin main && git checkout -b <branch> origin/main`.
2. Run the local gate: `just preflight` (fix failures before pushing).
3. Stage the specific files you changed (`git add <paths>` — not `git add .`)
   and commit with a clear message.
4. Push: `git push -u origin HEAD`
5. Open the PR as a *plain* `gh` call, so it runs outside the sandbox (gh fails
   TLS inside it): write the description to a file with the Write tool, then
   `gh pr create --title "<title>" --body-file <path>` (or `gh pr create --fill`).
   No `$(cat <<EOF …)`, heredoc, `cd` or pipe in the same call — the guard hook
   blocks those. Show the full PR URL.

Projection-system changes must lead the PR body with the held-out verdict — see
AGENTS.md "Projection Model Update Requirements".
