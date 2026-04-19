# Build System: Replace Make with Just — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `Makefile` with a `Justfile` so all agent-invoked commands route through a single `just <recipe>` entrypoint, collapsing ~150 allowlist entries to one.

**Architecture:** `just` is a Rust-based command runner installed via Homebrew. A `Justfile` at the repo root defines all recipes using `venv/bin/python` and `venv/bin/pytest` variables. The `settings.local.json` allowlist is trimmed to `Bash(just:*)` plus git/gh/mcp entries.

**Tech Stack:** `just` (command runner), existing Python/Node stack unchanged

---

### Task 1: Install just

**Files:**
- No file changes — verification only

- [ ] **Step 1: Install just via Homebrew**

```bash
brew install just
```

- [ ] **Step 2: Verify installation**

```bash
just --version
```

Expected output: `just 1.x.x` (any recent version)

- [ ] **Step 3: Commit nothing** — installation is local, not repo state

---

### Task 2: Create the Justfile

**Files:**
- Create: `Justfile`

- [ ] **Step 1: Write the Justfile**

Create `/Users/alexmonroe/dev/ottoneu_db/Justfile` with this exact content:

```just
# Justfile — Common recipes for the Ottoneu DB project
# Usage: just <recipe>  |  just --list

python := "venv/bin/python"
pytest  := "venv/bin/pytest"

# Show all available recipes
default:
    @just --list

# ──────────────────────────────────────────────
# Setup
# ──────────────────────────────────────────────

# Install all dependencies (Python + Node)
install:
    python3 -m venv venv
    venv/bin/pip install -r requirements.txt
    venv/bin/playwright install chromium
    cd web && npm install

# ──────────────────────────────────────────────
# Frontend
# ──────────────────────────────────────────────

# Start Next.js dev server on localhost:3000
dev:
    cd web && npm run dev

# Production build (validates correctness)
build:
    cd web && npm run build

# Run ESLint on web/
lint:
    cd web && npm run lint

# TypeScript type checking
typecheck:
    cd web && npx tsc --noEmit

# ──────────────────────────────────────────────
# Testing
# ──────────────────────────────────────────────

# Run all tests (Python + web)
test: test-python test-web

# Run Python tests with coverage
test-python:
    {{pytest}} --cov=. --cov-report=term-missing

# Run Jest tests with coverage
test-web:
    cd web && npx jest --coverage

# ──────────────────────────────────────────────
# Backend
# ──────────────────────────────────────────────

# Run full scrape pipeline
scrape:
    {{python}} scripts/ottoneu_scraper.py

# Run all analysis scripts
analyze:
    {{python}} scripts/run_all_analyses.py

# Verify database contents
check-db:
    {{python}} scripts/check_db.py

# ──────────────────────────────────────────────
# Harness checks
# ──────────────────────────────────────────────

# Run architectural/structural tests only
check-arch:
    {{pytest}} scripts/tests/test_architecture.py -v
    cd web && npx jest __tests__/lib/architecture.test.ts --no-coverage

# Check documentation freshness
check-docs:
    {{python}} scripts/check_docs_freshness.py

# Full CI suite (lint + typecheck + tests + doc checks)
ci: lint typecheck test check-docs

# ──────────────────────────────────────────────
# Projection CLI — fixed args
# ──────────────────────────────────────────────

# Generate projections for a model  (e.g. just project v24_learned_elite)
project model seasons="2022,2023,2024,2025":
    {{python}} scripts/feature_projections/cli.py run --model {{model}} --seasons {{seasons}}

# Backtest a model against actuals  (e.g. just backtest v24_learned_elite)
backtest model seasons="2022,2023,2024,2025":
    {{python}} scripts/feature_projections/cli.py backtest --model {{model}} --test-seasons {{seasons}}

# Train a learned model  (e.g. just train v24_learned_elite)
train model seasons="2022,2023,2024":
    {{python}} scripts/feature_projections/train_model.py --model {{model}} --seasons {{seasons}}

# Promote a model to production  (e.g. just promote v24_learned_elite)
promote model:
    {{python}} scripts/feature_projections/cli.py promote --model {{model}}

# Compare two or more models  (e.g. just compare v23_baseline,v24_learned_elite 2024)
compare models season="2024":
    {{python}} scripts/feature_projections/cli.py compare --models {{models}} --season {{season}}

# List all available model definitions
list-models:
    {{python}} scripts/feature_projections/cli.py list

# ──────────────────────────────────────────────
# Projection CLI — variadic passthrough
# ──────────────────────────────────────────────

# Per-player diagnostics  (e.g. just diagnostics --model v24 --season 2025 --top 20)
diagnostics *args:
    {{python}} scripts/feature_projections/cli.py diagnostics {{args}}

# Segmented accuracy analysis  (e.g. just segment-analysis --segments experience,age_bucket)
segment-analysis *args:
    {{python}} scripts/feature_projections/cli.py segment-analysis {{args}}

# Generate accuracy report  (e.g. just accuracy-report --run-backtest)
accuracy-report *args:
    {{python}} scripts/feature_projections/accuracy_report.py {{args}}
```

- [ ] **Step 2: Verify `just --list` shows all recipes**

```bash
just --list
```

Expected: table of recipe names with their descriptions (20+ recipes listed)

- [ ] **Step 3: Verify a simple recipe runs correctly**

```bash
just list-models
```

Expected: list of available projection model definitions (no error)

- [ ] **Step 4: Commit**

```bash
git add Justfile
git commit -m "feat: add Justfile with all common project recipes"
```

---

### Task 3: Delete the Makefile

**Files:**
- Delete: `Makefile`

- [ ] **Step 1: Delete the Makefile**

```bash
git rm Makefile
```

- [ ] **Step 2: Confirm no other files reference `make` commands**

```bash
grep -r "^make " docs/ AGENTS.md CLAUDE.md --include="*.md" -l
```

Expected: matches in AGENTS.md (the `make check-arch` reference) and COMMANDS.md — note these for Tasks 5 and 6.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: delete Makefile replaced by Justfile"
```

---

### Task 4: Trim the allowlist in settings.local.json

**Files:**
- Modify: `.claude/settings.local.json`

The goal is to replace ~150 Bash entries with one `Bash(just:*)` entry, keeping only git, gh, mcp, utility, and web entries that `just` doesn't cover.

- [ ] **Step 1: Rewrite the `permissions.allow` array**

Replace the entire `permissions.allow` array in `.claude/settings.local.json` with:

```json
{
  "permissions": {
    "allow": [
      "Bash(just:*)",
      "Bash(brew install just)",
      "Bash(git:*)",
      "Bash(git -C /Users/alexmonroe/dev/ottoneu_db log --oneline -15)",
      "Bash(gh pr create:*)",
      "Bash(gh pr view:*)",
      "Bash(gh pr merge:*)",
      "Bash(gh pr checks:*)",
      "Bash(gh pr close:*)",
      "Bash(gh pr edit:*)",
      "Bash(gh repo view:*)",
      "Bash(gh api:*)",
      "Bash(gh issue:*)",
      "Bash(gh issue list:*)",
      "Bash(gh issue view:*)",
      "Bash(gh label:*)",
      "Bash(gh run:*)",
      "Bash(gh run list:*)",
      "Bash(gh run view:*)",
      "Bash(gh workflow:*)",
      "Bash(gh auth:*)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(grep:*)",
      "Bash(wc:*)",
      "Bash(jq:*)",
      "Bash(find:*)",
      "Bash(psql:*)",
      "Bash(supabase --version:*)",
      "WebSearch",
      "WebFetch(domain:ottoneu.fangraphs.com)",
      "WebFetch(domain:community.ottoneu.com)",
      "WebFetch(domain:github.com)",
      "WebFetch(domain:www.rotowire.com)",
      "WebFetch(domain:www.fantasypros.com)",
      "WebFetch(domain:g.espncdn.com)",
      "WebFetch(domain:openai.com)",
      "mcp__filesystem__list_directory",
      "mcp__filesystem__directory_tree",
      "mcp__filesystem__write_file",
      "mcp__filesystem__read_text_file",
      "mcp__filesystem__read_multiple_files",
      "mcp__filesystem__create_directory",
      "mcp__filesystem__list_allowed_directories",
      "mcp__supabase__list_projects",
      "mcp__supabase__list_migrations",
      "mcp__supabase__execute_sql",
      "mcp__supabase__apply_migration",
      "mcp__supabase__get_advisors",
      "mcp__supabase__search_docs",
      "mcp__supabase__get_publishable_keys",
      "mcp__github__get_issue",
      "mcp__github__create_pull_request",
      "mcp__github__add_issue_comment",
      "mcp__github__create_issue",
      "mcp__github__get_pull_request_status",
      "Read(//private/tmp/**)",
      "Read(//Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/bin/**)",
      "Skill(update-config)"
    ]
  },
  "enabledMcpjsonServers": [
    "filesystem",
    "supabase",
    "puppeteer",
    "github"
  ],
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cd /Users/alexmonroe/dev/ottoneu_db && git checkout main && git pull origin main 2>/dev/null || true",
            "timeout": 30,
            "statusMessage": "Updating from main..."
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Validate the JSON is well-formed**

```bash
jq . .claude/settings.local.json
```

Expected: the JSON prints cleanly with no parse error

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.local.json
git commit -m "chore: trim allowlist to Bash(just:*) — remove ~150 one-off entries"
```

---

### Task 5: Update docs/COMMANDS.md

**Files:**
- Modify: `docs/COMMANDS.md`

- [ ] **Step 1: Replace the "Makefile Shortcuts" section**

Find the section starting with `## Makefile Shortcuts` and replace it entirely with:

```markdown
## just Recipes

Install `just` once with `brew install just`, then run any recipe from the repo root:

```bash
just                    # List all recipes
just install            # Install all dependencies (Python + Node)
just dev                # Start Next.js dev server on localhost:3000
just build              # Production build
just lint               # ESLint
just typecheck          # TypeScript type check
just test               # Run all tests (Python + web)
just test-python        # Python tests with coverage
just test-web           # Jest tests with coverage
just scrape             # Full scrape pipeline
just analyze            # Run all analysis scripts
just check-db           # Verify database contents
just check-arch         # Architectural/structural tests only
just check-docs         # Documentation freshness check
just ci                 # Full CI suite (lint + typecheck + tests + doc checks)

# Projection CLI
just list-models                                    # List available models
just project <model> [seasons]                      # Generate projections
just backtest <model> [seasons]                     # Backtest against actuals
just train <model> [seasons]                        # Train a learned model
just promote <model>                                # Promote model to production
just compare <models> [season]                      # Compare two or more models
just diagnostics [--model <m>] [--season <s>] ...  # Per-player diagnostics
just segment-analysis [--segments <s>] ...          # Segmented accuracy analysis
just accuracy-report [--run-backtest] ...           # Generate accuracy report
```
```

- [ ] **Step 2: Add a note to the Backend section**

At the top of the `## Backend` section, add:

```markdown
> **Prefer `just` recipes** for consistency. Use the raw commands below as reference, or when running outside the repo root.
```

- [ ] **Step 3: Commit**

```bash
git add docs/COMMANDS.md
git commit -m "docs: update COMMANDS.md to document just recipes"
```

---

### Task 6: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the `make check-arch` reference**

Find this line in AGENTS.md:

```
Run `make check-arch` to validate these rules locally.
```

Replace with:

```
Run `just check-arch` to validate these rules locally.
```

- [ ] **Step 2: Update the Quick Reference commands entry**

Find in Quick Reference:

```
- **Commands:** See [docs/COMMANDS.md](docs/COMMANDS.md) for all CLI commands (frontend, backend, make, cron)
```

Replace with:

```
- **Commands:** See [docs/COMMANDS.md](docs/COMMANDS.md) for all CLI commands (frontend, backend, just recipes, cron)
```

- [ ] **Step 3: Add a "Command Entrypoint" rule to the Critical Rules section**

After the existing `## Critical Rules` block opening, add this rule before the existing bullets:

```markdown
- **Always use `just <recipe>`** instead of invoking Python, pytest, or npm scripts directly. This ensures the correct venv and flags are used, and keeps the agent allowlist minimal. Run `just --list` to see all available recipes.
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add just entrypoint rule to AGENTS.md, fix make references"
```

---

### Task 7: Verify end-to-end and open PR

**Files:**
- No new changes

- [ ] **Step 1: Verify `just check-arch` passes**

```bash
just check-arch
```

Expected: Python architecture tests pass, Jest architecture test passes

- [ ] **Step 2: Verify `just list-models` works**

```bash
just list-models
```

Expected: list of model definitions printed, no error

- [ ] **Step 3: Verify `just --list` shows all recipes cleanly**

```bash
just --list
```

Expected: ~20 recipes listed with descriptions

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "feat: replace Makefile with Justfile" --body "$(cat <<'EOF'
## Summary
- Replaces `Makefile` with a `Justfile` using [just](https://github.com/casey/just), a modern command runner
- Adds projection CLI recipes (`just project`, `just backtest`, `just train`, `just diagnostics`, etc.)
- Trims `settings.local.json` allowlist from ~150 entries to ~55 — one `Bash(just:*)` entry covers all Python/pytest/npm agent invocations
- Updates `AGENTS.md` with an explicit rule to always use `just <recipe>`
- Updates `docs/COMMANDS.md` with full recipe reference

## Install
```bash
brew install just
just --list
```

## Test plan
- [ ] `just check-arch` passes
- [ ] `just list-models` returns model list
- [ ] `just --list` shows all ~20 recipes
- [ ] `.claude/settings.local.json` JSON is valid (`jq . .claude/settings.local.json`)

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- ✅ Justfile with all Makefile targets translated
- ✅ Projection CLI fixed-arg recipes (`project`, `backtest`, `train`, `promote`, `compare`, `list-models`)
- ✅ Projection CLI variadic recipes (`diagnostics`, `segment-analysis`, `accuracy-report`)
- ✅ Allowlist collapsed to `Bash(just:*)`
- ✅ COMMANDS.md updated
- ✅ AGENTS.md updated with enforcement rule
- ✅ Makefile deleted immediately

**Placeholder scan:** None found. All steps include exact commands and expected output.

**Type consistency:** N/A — no code types involved, only shell commands and JSON.
