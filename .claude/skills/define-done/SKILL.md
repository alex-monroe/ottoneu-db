---
name: define-done
description: Before starting a task, especially a loosely specified one (a "look into", "improve", "clean up", "why is X off", a UI change, a refactor), write down how success will be checked by commands you can run, and build the check first if none exists. Use at the start of any non-trivial task whose acceptance criteria are not already a test, a recipe or a number.
---
Decide how this task will be checked **before** changing anything. Agents do
well when they can test their work against a check and badly when "done" is a
judgement call, so the first job on a vague task is to turn it into one with a
check. The output is a short **validation contract** that you state to the user
up front, work against, and report on at the end.

The task (may be empty, in which case use the current request): $ARGUMENTS

## 1. Restate the goal as observable outcomes

Write 1–5 statements of the form *"after this change, <observable thing> is
true"*. Each must say what you would see: a value, a row count, a rendered
element, an error that no longer happens, a metric past a threshold. Rewrite
anything that only describes effort ("refactor X", "improve Y") as the outcome
it is meant to produce ("X has one implementation and its tests still pass";
"Y's MAE on held-out data is significantly lower").

If you cannot write even one such statement without guessing what the user
wants, that is the real blocker. Ask **one** focused question (AskUserQuestion
in unattended runs) that offers candidate outcomes, rather than starting work
on a guess.

## 2. Pick a check for each outcome

Use the cheapest check that would actually **fail if the outcome were not
met**. Check this repo's catalog first; it covers most tasks:

| Kind of outcome | Existing check |
|---|---|
| Code still correct overall | `just preflight` (lint + typecheck + both suites + doc checks, ~10s) |
| Python behaviour | a new or changed pytest in `scripts/tests/` (`just test-python`) |
| Web logic, component or route | a jest test in `web/__tests__/` (`just test-web-file <path>`) |
| Layering, constants, pagination rules | `just check-arch` |
| Projection accuracy | `just holdout-eval --protocol rolling` + `just significance` vs the active model (see `/experiment`); never the in-sample `just accuracy-report` |
| Data in the DB (counts, nulls, a player's row) | a `just py "<snippet>"` query, or the `db-reader` subagent |
| Schema / migration | `just check-migrations`, `just check-schema` |
| A scraper or poster | the recipe's `--dry-run` output |
| Data freshness | `just check-freshness`, `just check-db` |
| Docs and skills | `just check-docs` |
| Production build | `just build` |
| Something a page shows | a jest render test of the component; for layout, `just dev` and look at the page (`/start-dev`) |

Write each check as the **exact command** plus the **expected result**
(`exit 0`, `"N rows"`, `"CI excludes 0"`, `"test_x passes"`). "Looks right"
is not an expected result.

## 3. If no check exists, build it first

When none of the above would fail on the outcome you care about, building the
check is the first deliverable. In order of preference:

1. **A failing test** that encodes the outcome (pytest or jest). It stays in
   the repo afterwards.
2. **A small script or `just py` snippet** that prints a pass/fail line or a
   number. If it would be useful again, make it a recipe and a doc entry
   rather than leaving it in the transcript.
3. **A before/after snapshot**: capture the current output (a query result,
   a `--dry-run` log, generated markdown) to `$TMPDIR` now, so the change can be
   diffed against it.
4. **A manual check**, only when the outcome is visual or a matter of taste.
   Say exactly what a person should look at, and mark it as not checked by you.

## 4. Get a baseline

Run every check **before** changing code and record the result. A new test
should fail, and a metric should show its starting value. A check that already
passes before you start shows nothing about your change, so fix the check
until it can fail.

## 5. State the contract, then work

Post the contract before you edit anything, in this form:

```
Validation contract
1. <outcome>: `<command>` → expect <result> (baseline: <result now>)
2. ...
Manual / not checked by me: <anything left>
```

Work until every line passes. If one turns out to be the wrong check, change
it openly ("check 2 was wrong because …, replaced with …"). Do not quietly
drop it or loosen it until it passes.

## 6. Report against the contract

End the task (and the PR description) by repeating the contract with each
line's **final result**, and quote the command output for any that failed or
were skipped. Then run `/verify` as usual before committing.

## When not to use this

Skip it when the task already comes with a check, such as a failing test or
CI run to fix, an `/experiment` (the held-out gate is the contract), or a
one-line docs fix. The skill is for work where "done" is not yet defined.
