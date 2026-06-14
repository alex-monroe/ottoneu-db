# Git Workflow

**CRITICAL: All changes MUST be submitted as pull requests. NEVER commit directly to `main`.**

**CRITICAL: Always conclude your work by creating a pull request.** Every task — no matter how small — must end with a branch pushed and a PR created via `gh pr create --fill`. Do not leave changes uncommitted or on a local branch without a PR.

## Starting a New Task

Before beginning ANY new task or change, always follow this workflow:

1. **Check out and update the main branch:**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Create a new feature branch from main:**
   ```bash
   git checkout -b descriptive-branch-name
   ```
   Use descriptive branch names like `fix-vorp-calculation` or `add-roster-analysis-page`.

3. **Make your changes and commit:**
   ```bash
   # Make changes to files
   git add .
   git commit -m "Clear description of changes"
   ```

4. **Run `just preflight` before pushing:**
   ```bash
   just preflight   # lint + typecheck + both test suites (no coverage) + doc checks, ~9s
   ```
   This mirrors CI's pass/fail locally so failures are caught here instead of in a
   multi-minute CI round-trip. Optionally install it as a pre-push hook once with
   `just install-hooks` (opt-in; skip a WIP push with `git push --no-verify`).

5. **Push the branch and create a pull request:**
   ```bash
   git push -u origin descriptive-branch-name
   gh pr create --fill
   ```

**Always start from an updated `main` branch to avoid merge conflicts and ensure you're working with the latest code.**

## Stacked / dependent PRs

**Prefer basing every PR on `main`, even when the work is part of a multi-PR
series.** PRs in this repo are **squash-merged**, and a squash merge does NOT
propagate to a PR stacked on the base PR's branch.

The trap (this has bitten real work twice): if PR B's base is PR A's feature
branch and A is squash-merged to `main`, clicking "merge" on B merges it into
A's now-orphaned branch — **B's changes silently never reach `main`.**

What to do instead:

- **Default:** base each PR directly on `main`. If a PR genuinely needs unmerged
  work from another, say so in the description and plan to re-land once it merges.
- **Re-land a stranded/stacked PR onto `main`:**
  ```bash
  git checkout -b new-branch main
  git cherry-pick <commit>        # base content already in main is skipped cleanly
  gh pr create --base main --fill
  ```
- **Retarget an existing stacked PR after its base merges:**
  ```bash
  gh pr edit <n> --base main
  git rebase origin/main          # the duplicated base commit drops as "previously applied"
  git push --force-with-lease
  ```
- Before merging any PR in a series, **confirm its base is `main`** (`gh pr view
  <n> --json baseRefName`).
