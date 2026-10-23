# Validation-first workflow: skill vs CLAUDE.md

**Date:** 2026-10-23
**Status:** Implemented as a hybrid: the `/define-done` skill plus a one-line rule in AGENTS.md

## Problem

Agents do well on tasks that come with a check they can run against their own
work: a failing test, a CI run, the held-out gate in `/experiment`. On loosely
specified tasks ("look into X", "improve Y", "why does this page look off")
there is nothing to test against, so the agent decides by itself when it has
finished and often gets it wrong. The idea: before starting, work out how
success will be checked, and build the tooling for that check if it is
missing.

The question was where that behaviour should live, in a **Claude skill** or in
**CLAUDE.md** (in this repo, that means AGENTS.md: CLAUDE.md has to stay a
pointer, which `scripts/check_docs_freshness.py` enforces).

## The two pathways

| | Skill (`.claude/skills/define-done/`) | Always-loaded rule (AGENTS.md) |
|---|---|---|
| **When it reaches the model** | Only the `description` is always in context; the body loads when the skill is invoked (by the model, or by `/define-done`) | Every session, every turn |
| **Fires on vague tasks?** | Weak point. The model has to recognise that a task is vague, and that is exactly the judgement it gets wrong on vague tasks. Mitigated by writing the description around trigger phrases ("look into", "improve", "clean up") | Yes, because nothing has to be recognised. It is always in context |
| **Room for procedure** | Plenty: steps, a catalog of this repo's checks, a contract template, an "if no check exists, build one" ladder | Very little. AGENTS.md says it holds only what every task needs, and every line costs context in every session. A long rule there is diluted by everything else in the file |
| **Repo-specific** | Can map task types to this repo's real checks (`just preflight`, `just holdout-eval` + `just significance`, `just py`, `--dry-run`, `just check-schema`, …) | Could only point at them |
| **Explicit use** | `/define-done` lets Alex (or Idea Queue's prompt) require it for a task | None |
| **Drift / enforcement** | Registered in CLAUDE.md's skill list (checked by `just check-docs`) | Prose; nothing checks it is followed |
| **Precedent here** | Same shape as `verify`: the skill holds the procedure and the rule says when to run it | Projection-model rules: a short rule that points at a detailed reference |

### Verdict

**Neither works well alone, and the skill matters more.** The value is in the
procedure: restate the task as outcomes, map each outcome to a command, build
the check if it is missing, take a baseline, and report against it. A
one-line instruction cannot carry that. "Identify validation criteria first"
in CLAUDE.md alone is the kind of rule a model agrees with and then applies
loosely. But a skill alone has a trigger problem: the vague tasks it is for
are the ones where the model is least likely to notice that it needs the
skill.

So the trigger lives in AGENTS.md as one short, imperative rule ("define done
as a runnable check before you start; if you can't, run `/define-done`"), and
everything else lives in the skill. The rule costs about one line of context
per session. The skill costs nothing until it is used.

## What was built

- `.claude/skills/define-done/SKILL.md`: a 6-step procedure. Restate the
  task as observable outcomes; pick a check per outcome from a catalog of this
  repo's checks; if none would fail on the outcome, build one first (failing
  test, then script or recipe, then snapshot diff, then a manual check marked
  as such); run a baseline so every check is shown to be able to fail; post a
  "Validation contract" before editing; report each line's final result at the
  end. It also says when to skip it (the task already has a check).
- AGENTS.md **Critical Rules**: the trigger rule above.
- Registered in CLAUDE.md's skill list and `docs/INDEX.md`. There is also a row
  in [harness-controls.md](../references/harness-controls.md) with a
  retirement condition.

## Options not taken (yet)

- **A `UserPromptSubmit` hook** that injects a reminder on every prompt. This
  is the strongest trigger, but it is noisy on small requests and adds context
  to every turn. Worth trying only if the AGENTS.md rule turns out not to fire
  (see the follow-up below). Note that `.claude/hooks/` cannot be written from
  the Idea Queue sandbox, so this would need a hands-on session.
- **A `Stop` hook** that blocks finishing until the transcript contains a
  "Validation contract" with results. This enforces the rule mechanically,
  which harness-controls.md prefers, but it is brittle: it would have to tell
  vague tasks from trivial ones by pattern matching. Revisit if the softer
  version is often skipped.
- **Idea Queue prompt change.** Idea Queue's unattended prompt already says
  "run the project's tests"; prefixing tasks with `/define-done` there would
  make it explicit for queued ideas, which are the vaguest tasks this repo
  gets. That is outside this repo.

## How to tell whether it works

Over the next ~10 vague tasks (Idea Queue items are a good sample), check
whether the transcript or PR contains a validation contract, and whether its
checks were real commands with a baseline. If the contract is often missing,
the trigger is the weak link, so add the `UserPromptSubmit` hook. If
contracts appear but their checks could never have failed, tighten step 4 of
the skill.
