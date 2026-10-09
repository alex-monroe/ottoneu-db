"""Tests for the agent PreToolUse guard (.claude/hooks/guard.py).

Guards are tested in both directions. A suite that only checks what gets
blocked lets a guard drift towards blocking everything, which agents then learn
to route around. So every rule has must-block and must-allow cases.
"""

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

GUARD_PATH = Path(__file__).resolve().parents[2] / ".claude" / "hooks" / "guard.py"
_spec = importlib.util.spec_from_file_location("guard", GUARD_PATH)
guard = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(guard)


def _bash(command, cwd="/repo"):
    return {"tool_name": "Bash", "tool_input": {"command": command}, "cwd": cwd}


def _sql(query, tool="mcp__supabase__execute_sql"):
    return {"tool_name": tool, "tool_input": {"query": query}, "cwd": "/repo"}


def _check(payload, branch="feature/x", worktree=False):
    return guard.check(payload, branch_of=lambda _d: branch, is_worktree=lambda _d: worktree)


# ── fp_* tables ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("query", [
    "select * from fp_notes",
    "SELECT count(*) FROM public.FP_LEAGUES",
    "update fp_user_integrations set x = 1",
    "drop table fp_teams",
])
def test_blocks_sql_on_fp_tables(query):
    assert "fp_" in _check(_sql(query)).lower()


def test_blocks_migration_touching_fp_tables():
    payload = {"tool_name": "mcp__supabase__apply_migration",
               "tool_input": {"name": "x", "query": "alter table fp_teams add column y int"}}
    assert _check(payload)


@pytest.mark.parametrize("query", [
    "select * from players where position = 'QB'",
    "select count(*) from player_stats where season = 2025",
])
def test_allows_ordinary_sql(query):
    assert _check(_sql(query)) is None


def test_any_fp_identifier_blocks_even_a_column():
    # Deliberately name-based and conservative: the guard doesn't parse SQL, so
    # an fp_-prefixed column blocks too. No table in this repo uses that prefix.
    assert _check(_sql("select fp_rank_hint from model_projections"))


def test_allows_identifiers_merely_containing_fp():
    assert _check(_sql("select * from player_fpts where season = 2025")) is None


# ── git on main ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("command", [
    "git push origin main",
    "git push -u origin main",
    "git push origin HEAD:main",
    "git push origin refs/heads/main",
    "cd web && git push origin main && echo done",
])
def test_blocks_push_to_main(command):
    assert "main" in _check(_bash(command))


@pytest.mark.parametrize("command", [
    "git push -u origin HEAD",
    "git push origin feature/main-menu",
    "git push origin claude/maintenance",
    "git fetch origin main",
    "git checkout -b fix origin/main",
    "git log origin/main..HEAD",
])
def test_allows_other_git(command):
    assert _check(_bash(command)) is None


def test_blocks_commit_on_main():
    assert _check(_bash('git commit -m "x"'), branch="main")


def test_blocks_commit_with_C_flag_on_main():
    seen = []
    guard.check(_bash('git -C /other commit -m x'),
                branch_of=lambda d: seen.append(d) or "main", is_worktree=lambda _d: False)
    assert seen == ["/other"]


def test_allows_commit_on_feature_branch():
    assert _check(_bash('git add a.py && git commit -m "x"'), branch="feature/y") is None


def test_branch_lookup_skipped_for_non_commit_commands():
    calls = []
    guard.check(_bash("git status"), branch_of=lambda d: calls.append(d) or "main",
                is_worktree=lambda _d: False)
    assert calls == []


# ── production recipes from worktrees ──────────────────────────────────────

@pytest.mark.parametrize("command", ["just promote v99_x", "just analyze", "cd /x && just promote m"])
def test_blocks_prod_recipes_in_worktree(command):
    assert "main checkout" in _check(_bash(command), worktree=True)


@pytest.mark.parametrize("command", ["just promote v99_x", "just analyze"])
def test_allows_prod_recipes_in_main_checkout(command):
    assert _check(_bash(command), worktree=False) is None


@pytest.mark.parametrize("command", ["just preflight", "just project v99_x", "just list-models --check"])
def test_allows_other_recipes_in_worktree(command):
    assert _check(_bash(command), worktree=True) is None


# ── other tools / robustness ───────────────────────────────────────────────

def test_ignores_unrelated_tools():
    assert _check({"tool_name": "Edit", "tool_input": {"file_path": "fp_notes.md"}}) is None


def test_script_exits_2_with_reason_on_block():
    proc = subprocess.run([sys.executable, str(GUARD_PATH)], input=json.dumps(_sql("select * from fp_notes")),
                          capture_output=True, text=True)
    assert proc.returncode == 2
    assert "fantasy-pulse" in proc.stderr


@pytest.mark.parametrize("stdin", ["", "not json", json.dumps(_sql("select 1"))])
def test_script_fails_open(stdin):
    proc = subprocess.run([sys.executable, str(GUARD_PATH)], input=stdin, capture_output=True, text=True)
    assert proc.returncode == 0
