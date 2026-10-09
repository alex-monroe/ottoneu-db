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
4. A `gh` call that would stay inside the sandbox. `gh` fails TLS verification
   under macOS Seatbelt, so it only works as an `excludedCommands` call, and a
   call only leaves the sandbox when it is *plain*: every part matches an
   exclusion, with no `cd`, `$(...)`, heredoc, redirection or subshell. Blocking
   up front with the rewrite beats a confusing TLS error and an unsandboxed retry.

Rules 2-4 match only where a command starts (line start or after `;`, `&&`,
`||`, `|`, `(`), never inside quoted text or heredoc bodies — so writing a file
that merely mentions `just promote` is not blocked.

Blocking = exit code 2 with the reason on stderr (Claude sees it and adapts).
Anything unexpected exits 0: a broken guard must never block real work.
Known gap: rules 2 and 3 judge the session cwd, so `cd elsewhere && git commit`
is checked against the starting directory.

Stdlib only; must stay compatible with Python 3.9 (macOS system python3).
Tested in both directions by scripts/tests/test_harness_guards.py.
"""
import json
import os
import re
import subprocess
import sys
from typing import Callable, List, Optional

SQL_TOOLS = ("mcp__supabase__execute_sql", "mcp__supabase__apply_migration")
FP_TABLE = re.compile(r"\bfp_[a-z0-9_]+", re.IGNORECASE)

# A command position: start of the call or of a line, or right after a shell operator.
CMD = r"(?:^|[;&|(]|\n)\s*"
GIT_COMMIT = re.compile(CMD + r"git\s+(?:-C\s+(\S+)\s+)?commit\b")
# `git push origin main`, `git push origin HEAD:main`, `git push origin refs/heads/main`
PUSH_TO_MAIN = re.compile(CMD + r"git\s+push\b[^;&|\n]*\s(?:\S+:)?(?:refs/heads/)?main(?=\s|$|[;&|])")
PROD_RECIPE = re.compile(CMD + r"just\s+(promote|analyze)\b")
GH_CALL = re.compile(r"(?:^|[;&|(\n]|\$\(|`)\s*gh(?:\s|$)")

QUOTED = re.compile(r"'[^']*'|\"(?:\\.|[^\"\\])*\"")
HEREDOC = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?[^\n]*\n.*?\n\s*\1\s*(?:\n|$)", re.DOTALL)
FD_DUP = re.compile(r"\d?>&\d")
SEGMENT_SPLIT = re.compile(r"&&|\|\||[;|\n]")
SHELL_STARTERS = ("cd", "pushd", "popd", "if", "for", "while", "until", "case", "sudo", "eval", "xargs")


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


def excluded_patterns(project_dir: str) -> List[str]:
    """The sandbox's `excludedCommands`, read from the shared project settings."""
    try:
        with open(os.path.join(project_dir, ".claude", "settings.json")) as f:
            return list(json.load(f).get("sandbox", {}).get("excludedCommands") or [])
    except (OSError, ValueError, AttributeError):
        return ["gh *"]


def _code_only(command: str) -> str:
    """The command with heredoc bodies and quoted strings blanked out."""
    return QUOTED.sub("''", HEREDOC.sub("<<HEREDOC\n", command))


def _matches(segment: str, patterns: List[str]) -> bool:
    for pattern in patterns:
        if pattern.endswith(" *"):
            stem = pattern[:-2]
            if segment == stem or segment.startswith(stem + " "):
                return True
        elif segment == pattern:
            return True
    return False


def gh_sandbox_problem(command: str, patterns: List[str]) -> Optional[str]:
    """Why a call containing `gh` would stay sandboxed, or None if it leaves it."""
    code = _code_only(command)
    if not GH_CALL.search(code):
        return None
    if "$(" in command or "`" in command:
        return "it contains a command substitution"
    if "<<" in code:
        return "it uses a heredoc"
    if re.search(r"[<>]", FD_DUP.sub("", code)):
        return "it redirects input or output"
    if re.search(r"[()]", code):
        return "it uses a subshell"
    for segment in (s.strip() for s in SEGMENT_SPLIT.split(code)):
        if not segment:
            continue
        word = segment.split()[0]
        if word in SHELL_STARTERS:
            return f"it runs `{word}`"
        if not _matches(segment, patterns):
            return f"`{word}` is not in sandbox.excludedCommands"
    return None


def check(
    payload: dict,
    branch_of: Callable[[str], str] = current_branch,
    is_worktree: Callable[[str], bool] = in_linked_worktree,
    exclusions: Optional[List[str]] = None,
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
    code = _code_only(command)

    if PUSH_TO_MAIN.search(code):
        return (
            "Blocked: pushing to `main`. Push your feature branch "
            "(`git push -u origin HEAD`) and open a PR."
        )
    commit = GIT_COMMIT.search(code)
    if commit and branch_of(commit.group(1) or cwd) == "main":
        return (
            "Blocked: committing on `main`. Create a branch first: "
            "`git fetch origin main && git checkout -b <branch> origin/main`."
        )
    prod = PROD_RECIPE.search(code)
    if prod and is_worktree(cwd):
        return (
            f"Blocked: `just {prod.group(1)}` writes shared production data and must run "
            "from the main checkout after the change is merged, not from a worktree."
        )
    if not tool_input.get("dangerouslyDisableSandbox"):
        if exclusions is None:
            exclusions = excluded_patterns(os.environ.get("CLAUDE_PROJECT_DIR") or cwd)
        problem = gh_sandbox_problem(command, exclusions)
        if problem:
            return (
                f"Blocked: this `gh` call would stay inside the sandbox, where gh fails TLS "
                f"verification — {problem}. gh only leaves the sandbox as a plain call. "
                "Rewrite it: write a PR/issue body to a file with the Write tool and pass "
                "`--body-file <path>`; use gh's `--jq`/`--template` instead of piping to "
                "other tools; drop `cd` (run from the repo root, or pass "
                "`--repo alex-monroe/ottoneu-db`); run other commands as separate calls."
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
