#!/usr/bin/env python3
"""Antigravity PreToolUse guard: the same rules as .claude/hooks/guard.py.

This is an adapter, not a second rule set. It translates Antigravity's hook
payload into the shape the Claude Code guard expects and calls `guard.check`,
so the two agents can never disagree about what is forbidden:

1. SQL that names an `fp_*` table (Supabase MCP `execute_sql` / `apply_migration`).
2. `git commit` on `main`, and `git push` to `main`.
3. `just promote` / `just analyze` from a linked worktree.

The Claude guard's fourth rule (a `gh` call that would stay inside Claude's
sandbox) does not apply here: Antigravity lets `gh` out of its sandbox through
`unsandboxed(...)` permission rules instead (see `just antigravity-setup`).

On top of that, `apply_migration` always prompts (`force_ask`), mirroring the
`ask` rule in .claude/settings.json — an "always allow" click must not turn
schema changes on a shared production database into a silent action.

Contract (docs: https://antigravity.google/docs/hooks): the payload arrives on
stdin as `{"toolCall": {"name", "args"}, "workspacePaths": [...]}`; a decision
is a JSON object on stdout. No output means no opinion — the normal permission
rules decide. Anything unexpected prints nothing: a broken guard must never
block real work.

Stdlib only; must stay compatible with Python 3.9 (macOS system python3).
Tested in both directions by scripts/tests/test_antigravity.py.
"""
import importlib.util
import json
import os
import sys
from typing import Any, Callable, Iterator, Optional

_CLAUDE_GUARD = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", ".claude", "hooks", "guard.py"
)
_spec = importlib.util.spec_from_file_location("claude_guard", _CLAUDE_GUARD)
claude_guard = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(claude_guard)

SQL_TOOL = "mcp__supabase__execute_sql"
MIGRATION_TOOL = "mcp__supabase__apply_migration"


def _strings(value: Any) -> Iterator[str]:
    """Every string in a nested tool-argument value, keys included."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from _strings(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from _strings(item)


def decide(
    payload: dict,
    branch_of: Callable[[str], str] = claude_guard.current_branch,
    is_worktree: Callable[[str], bool] = claude_guard.in_linked_worktree,
) -> Optional[dict]:
    """Return a hook decision, or None to leave the call to the permission rules."""
    call = payload.get("toolCall") or {}
    name = str(call.get("name") or "")
    args = call.get("args") or {}
    workspace = (payload.get("workspacePaths") or ["."])[0]

    if name == "run_command":
        reason = claude_guard.check(
            {
                "tool_name": "Bash",
                # Skips the Claude-sandbox-only `gh` rule; see the module docstring.
                "tool_input": {"command": args.get("CommandLine"), "dangerouslyDisableSandbox": True},
                "cwd": args.get("Cwd") or workspace,
            },
            branch_of=branch_of,
            is_worktree=is_worktree,
        )
        return {"decision": "deny", "reason": reason} if reason else None

    # An MCP call: agy 1.3.2 sends `call_mcp_tool` with ServerName / ToolName /
    # Arguments. That layout is not documented, so look at every string in it
    # rather than at a named field. The tool is identified from
    # the short strings only (names, not bodies), so an issue comment that
    # merely mentions `execute_sql` is not mistaken for a SQL call.
    strings = list(_strings(args))
    text = " ".join(strings)
    ident = " ".join([name] + [s for s in strings if len(s) <= 64])

    # GitHub MCP: prevent pushing/writing directly to main, ask on PR merges.
    tool_name = str(args.get("ToolName") or "")
    server_name = str(args.get("ServerName") or "")
    is_github = server_name == "github-mcp-server" or "github" in name.lower()
    if is_github or "push_files" in ident or "create_or_update_file" in ident or "merge_pull_request" in ident:
        if tool_name in ("push_files", "create_or_update_file") or "push_files" in ident or "create_or_update_file" in ident:
            mcp_args = args.get("Arguments")
            if isinstance(mcp_args, str):
                try:
                    mcp_args = json.loads(mcp_args)
                except ValueError:
                    mcp_args = {}
            if isinstance(mcp_args, dict):
                branch = str(mcp_args.get("branch") or "")
                if branch in ("main", "refs/heads/main"):
                    return {
                        "decision": "deny",
                        "reason": (
                            "Blocked: pushing/writing to `main` via GitHub MCP. "
                            "Push your feature branch and open a PR."
                        ),
                    }
        if tool_name == "merge_pull_request" or "merge_pull_request" in ident:
            return {
                "decision": "force_ask",
                "reason": "Merging pull requests modifies main; confirm each merge.",
            }

    is_migration = "apply_migration" in ident
    if not (is_migration or "execute_sql" in ident):
        return None
    reason = claude_guard.check(
        {"tool_name": MIGRATION_TOOL if is_migration else SQL_TOOL, "tool_input": {"query": text}}
    )
    if reason:
        return {"decision": "deny", "reason": reason}
    if is_migration:
        return {
            "decision": "force_ask",
            "reason": "Migrations change the shared production database; confirm each one.",
        }
    return None


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return
    decision = decide(payload)
    if decision:
        json.dump(decision, sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
