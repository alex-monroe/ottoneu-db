#!/usr/bin/env python3
"""PreToolUse guard: blocks the few agent actions this repo forbids outright.

Each rule below used to be prose in AGENTS.md. Prose is advice; this hook is a
fact. Rules (see docs/references/autonomous-operation.md#guard-hooks):

1. SQL that names an `fp_*` table. The Supabase project is shared with the
   fantasy-pulse app, which owns every `fp_`-prefixed table.
2. `git commit` while the checkout is on `main`, and `git push` to `main`.
   Every change goes through a PR.
3. `just promote` / `just analyze` from a linked worktree. They write shared
   production data and must run from the main checkout after merging.

Blocking = exit code 2 with the reason on stderr (Claude sees it and adapts).
Anything unexpected exits 0: a broken guard must never block real work.
Known gap: rules 2 and 3 judge the session cwd, so `cd elsewhere && git commit`
is checked against the starting directory.

Stdlib only; must stay compatible with Python 3.9 (macOS system python3).
Tested in both directions by scripts/tests/test_harness_guards.py.
"""
import json
import re
import subprocess
import sys
from typing import Callable, Optional

SQL_TOOLS = ("mcp__supabase__execute_sql", "mcp__supabase__apply_migration")
FP_TABLE = re.compile(r"\bfp_[a-z0-9_]+", re.IGNORECASE)
GIT_COMMIT = re.compile(r"\bgit\s+(?:-C\s+(\S+)\s+)?commit\b")
# `git push origin main`, `git push origin HEAD:main`, `git push origin refs/heads/main`
PUSH_TO_MAIN = re.compile(r"\bgit\s+push\b[^;&|\n]*\s(?:\S+:)?(?:refs/heads/)?main(?=\s|$|[;&|])")
PROD_RECIPE = re.compile(r"\bjust\s+(promote|analyze)\b")


def _git(directory: str, *args: str) -> str:
    try:
        return subprocess.run(
            ["git", "-C", directory] + list(args),
            capture_output=True, text=True, timeout=5,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def current_branch(directory: str) -> str:
    return _git(directory, "branch", "--show-current")


def in_linked_worktree(directory: str) -> bool:
    return "/worktrees/" in _git(directory, "rev-parse", "--absolute-git-dir")


def check(
    payload: dict,
    branch_of: Callable[[str], str] = current_branch,
    is_worktree: Callable[[str], bool] = in_linked_worktree,
) -> Optional[str]:
    """Return a block reason, or None to let the tool call through."""
    tool = payload.get("tool_name") or ""
    tool_input = payload.get("tool_input") or {}
    cwd = payload.get("cwd") or "."

    if tool in SQL_TOOLS:
        sql = " ".join(str(tool_input.get(k) or "") for k in ("query", "name"))
        match = FP_TABLE.search(sql)
        if match:
            return (
                f"Blocked: this SQL names `{match.group(0)}`. Tables prefixed `fp_` belong "
                "to the fantasy-pulse app that shares this Supabase project — this repo "
                "must not read, write, alter or migrate them (AGENTS.md)."
            )
        return None

    if tool != "Bash":
        return None
    command = str(tool_input.get("command") or "")

    if PUSH_TO_MAIN.search(command):
        return (
            "Blocked: pushing to `main`. Push your feature branch "
            "(`git push -u origin HEAD`) and open a PR."
        )
    commit = GIT_COMMIT.search(command)
    if commit and branch_of(commit.group(1) or cwd) == "main":
        return (
            "Blocked: committing on `main`. Create a branch first: "
            "`git fetch origin main && git checkout -b <branch> origin/main`."
        )
    prod = PROD_RECIPE.search(command)
    if prod and is_worktree(cwd):
        return (
            f"Blocked: `just {prod.group(1)}` writes shared production data and must run "
            "from the main checkout after the change is merged, not from a worktree."
        )
    return None


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return
    reason = check(payload)
    if reason:
        sys.stderr.write(reason + "\n")
        sys.exit(2)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        pass
