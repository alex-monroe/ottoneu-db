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

4. **Push the branch and create a pull request:**
   ```bash
   git push -u origin descriptive-branch-name
   gh pr create --fill
   ```

**Always start from an updated `main` branch to avoid merge conflicts and ensure you're working with the latest code.**
