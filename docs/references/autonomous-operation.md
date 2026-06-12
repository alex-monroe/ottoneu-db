# Autonomous Operation — Permissions, Metrics, and Isolation

Goal: Claude Code sessions that run **safely with no human intervention**. This
document describes the layered approach, how approval friction is measured, and
how to interpret/act on the metrics.

## The layered model

A permission allowlist alone cannot deliver "safe + zero prompts": any list
broad enough to never prompt is broad enough to be no security boundary at all
(this repo already allowlists `just:*`, and `just py "<snippet>"` runs
arbitrary Python — so arbitrary code execution is *already* granted). The
allowlist is therefore treated as **friction control**, and actual safety comes
from outer layers:

| Layer | Mechanism | What it buys |
|-------|-----------|--------------|
| 1 | Allowlist + `just`-first habits (`.claude/settings.local.json`, `Justfile`) | Few prompts in normal supervised sessions |
| 2 | Prompt-rate instrumentation (`.claude/hooks/`, `just permission-report`) | Visibility: measure friction, catch regressions |
| 3 | Claude Code native sandbox (`sandbox.enabled` in settings) | OS-level (Seatbelt) containment on the host — optional middle ground |
| 4 | Devcontainer + egress firewall (`.devcontainer/`) | True isolation: run `claude --dangerously-skip-permissions` safely |

What the allowlist deliberately does **not** auto-approve, at any layer below 4:
`rm`, `sed -i`, non-localhost `curl`, `brew`, and anything matching the deny
list (`git push --force`, `sudo`). Production-data blast radius
(`mcp__supabase__execute_sql` / `apply_migration`) is allowlisted for workflow
reasons — if that ever feels wrong, move those two to an `ask` list.

## Layer 1 — Allowlist design notes

Transcript mining (June 2026, 31 sessions, ~1,650 Bash calls) showed ~80% of
prompts came from a handful of innocuous patterns:

- **`cd <repo> && …` compound commands** — Claude Code permission-checks every
  segment of a compound command, and `cd` was not allowlisted, so *every*
  `cd X && <allowed command>` prompted. This was the single largest source.
- `echo`/`printf` banners, `sed -n` (read-only paging), `pgrep`, `time`,
  `timeout`, `tr`, `cut`, `date`.
- Ad-hoc `venv/bin/python …` invocations not matching the old narrow prefixes
  (probe scripts, heredocs, absolute paths from worktrees).

All of these are now allowlisted. `venv/bin/python:*` and `node:*` are broad,
but per the layered model they add no capability beyond the pre-existing
`just py` escape hatch. Denials in 31 sessions of history: 3 — prompts here are
nearly pure friction, not safety catches.

Rules of thumb when extending:

- Project-specific or multi-step command → **new `just` recipe** (auto-approved
  via `just:*`, self-documenting, shows up in `just --list`).
- Simple safe utility → **allowlist entry** in `.claude/settings.local.json`
  (which is checked in — extend it via PR like any other change).
- Keep `rm`, `sed -i`, external `curl` gated; they prompt rarely and the prompt
  is the point.
- Shell `for`/`until`/`while` loops still prompt (no clean pattern exists).
  Habit fix: do iteration inside `just py` / a script instead of shell loops.

## Layer 2 — Measuring approval friction

**Why a hook is required:** approved permission prompts leave *no trace* in
transcripts (only denials do). The only durable record is the `Notification`
hook, which Claude Code fires whenever it needs permission.

Components:

- `.claude/hooks/log_permission_prompt.py` — Notification hook (registered in
  `.claude/settings.local.json`). Appends one JSON line per prompt to
  `~/.claude/metrics/ottoneu_db/permission_prompts.jsonl`, enriched with the
  pending tool name + input recovered from the transcript tail.
- `.claude/hooks/permission_report.py` — aggregator. Numerator: logged prompts.
  Denominator: total `tool_use` blocks mined from
  `~/.claude/projects/-Users-alexmonroe-dev-ottoneu-db/*.jsonl`.

**The metric: prompts per 100 tool calls**, weekly. Raw prompt counts mislead —
a heavy week prompts more in absolute terms even if friction per unit of work
improved.

Usage:

```
just permission-report              # weekly trend + top prompted families
just permission-report --days 14
just permission-report --check      # exit 2 if trailing-7d rate > 1.5x prior-28d baseline
```

Workflow:

- The **"Top prompted command families"** table is the backlog: each row is a
  candidate `just` recipe or allowlist entry. `/review-permission-gates`
  evaluates the current session the same way.
- The **regression check** catches drift (a new tool/habit/Claude Code release
  reintroducing prompts). Run it after settings or Justfile changes and
  periodically (e.g., as part of `/retro`).

Known limitations: events accrue only from the date the hook landed (no
retroactive data); background/bypass-permission sessions generate tool calls
but no prompts, which deflates the rate — trends still hold as long as the mix
of session types is roughly stable; the hook is host-local (the devcontainer
volume keeps its own log).

## Layer 3 — Native sandbox (optional)

`.claude/settings.local.json` currently sets `sandbox.enabled: false`. Setting
`"enabled": true` with `"autoAllowBashIfSandboxed": true` makes Claude Code run
Bash under macOS Seatbelt and auto-approve commands the sandbox can contain
(filesystem-read-only, no network), prompting only on escalation. It's the
middle ground when working on the host outside the devcontainer. Tradeoff:
some legitimate commands (DB writes, scrapers) escalate and still prompt, and
sandbox quirks can break commands in confusing ways. Try it for a week and
check the effect with `just permission-report`.

## Layer 4 — Devcontainer for full autonomy

`.devcontainer/` gives an isolated Linux container with:

- Python 3.9 (matches the project floor), Node 20, `gh`, `just`, Playwright
  Chromium deps;
- a **default-deny egress firewall** (`init-firewall.sh`, adapted from
  Anthropic's reference devcontainer) allowing only the domains in
  `allowed-domains.txt` — Anthropic, GitHub, npm/PyPI, the project's scrapers,
  and your Supabase host (**add your `<project-ref>.supabase.co` before first
  use** — find it in `SUPABASE_URL` in `.env`);
- a named volume for `~/.claude` so login and history persist across rebuilds.

Usage (VS Code: "Reopen in Container", or `devcontainer up` CLI):

1. First boot runs `post-create.sh` (installs Claude Code + project deps) and
   `init-firewall.sh` (applies the firewall — also re-applied on every start).
2. Copy `.env` / `web/.env.local` into the workspace if not already present.
3. Run `claude` once to authenticate, then:

```
claude --dangerously-skip-permissions
```

The **VS Code extension panel** works too: `devcontainer.json` sets
`claudeCode.allowDangerouslySkipPermissions` (adds "Bypass permissions" to the
extension's mode selector) and `claudeCode.initialPermissionMode:
"bypassPermissions"` (starts every conversation in it) — scoped via
devcontainer customizations, so host VS Code keeps normal prompting.

Inside the container that flag is reasonable: worst case is scoped to the
workspace copy, the container, and the allowlisted endpoints. **The remaining
real risk is the production Supabase database** (the container legitimately
needs credentials for it). Mitigations: prefer read-only keys for exploratory
work, rely on PR review for migrations, and remember `fp_*` tables are
off-limits (see CLAUDE.md).

Host caveats: the venv is created inside the container (Linux) — it coexists
with the macOS `venv/` only if the container uses its own checkout/volume;
with a bind mount, re-run `venv/bin/pip install -e .` when switching sides.
Production promotion actions should still run from the host main repo per
CLAUDE.md worktree notes.

## Is the metric worth it? (decision record)

Yes, with eyes open. The instrumentation is ~150 lines of stdlib Python, zero
external services, and answers questions that are otherwise unanswerable
(approved prompts are invisible in transcripts). The risks to keep in mind:

- **Goodhart**: the cheapest way to drive the rate to zero is allowlisting
  everything — which destroys the signal prompts provide in supervised
  sessions. The metric's purpose is to find *recipe-shaped* gaps and catch
  regressions, not to hit zero. Zero-prompt operation is what Layer 4 is for.
- **Denominator drift**: more background-job usage lowers the rate without any
  real improvement. Compare like-for-like periods.
