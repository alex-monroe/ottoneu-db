# Development Workflow

## Git Workflow

**CRITICAL: Never commit directly to `main`. All changes must go through pull requests.**

**CRITICAL: Always conclude your work by creating a pull request.** Every task—no matter how small—must end with a branch pushed and a PR created via `gh pr create --fill`. Do not leave changes uncommitted or on a local branch without a PR.

1. **Check out and update the main branch:**
   ```bash
   git checkout main && git pull origin main
   ```

2. **Create a new feature branch:**
   ```bash
   git checkout -b descriptive-branch-name
   ```
   Use descriptive branch names like `fix-vorp-calculation` or `add-roster-analysis-page`.

3. **Make changes and commit:**
   ```bash
   git add .
   git commit -m "Description"
   ```

4. **Push and create PR:**
   ```bash
   git push -u origin descriptive-branch-name
   gh pr create --fill
   ```

## Code Organization

### Python Configuration
All configuration constants live in `scripts/config.py`. All scripts import from here to eliminate duplication and ensure consistency.

### TypeScript Types
Shared type definitions in `web/lib/types.ts`:
- Player data interfaces
- Chart component types
- Position constants

### Reusable Components
- `DataTable` — generic sortable table with type safety
- `SummaryCard` — metric display cards
- `PositionFilter` — position selection buttons
- `ScatterChart` — player efficiency scatter plot
- Column definitions in `web/lib/columns.ts`
