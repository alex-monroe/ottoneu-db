"""Tests for the Google Antigravity harness: the hook adapter and the policy sync.

The adapter (.agents/hooks/guard.py) reuses the Claude Code guard's rules, so
these tests cover the translation, not the rules again — see
test_harness_guards.py for those. Both directions, as there: must-block and
must-allow.
"""

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.antigravity_setup import build_rules, merge_rules, pin_supabase

REPO_ROOT = Path(__file__).resolve().parents[2]
ADAPTER_PATH = REPO_ROOT / ".agents" / "hooks" / "guard.py"
_spec = importlib.util.spec_from_file_location("agy_guard", ADAPTER_PATH)
agy_guard = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(agy_guard)


def _run(command, cwd=None):
    args = {"CommandLine": command}
    if cwd:
        args["Cwd"] = cwd
    return {"toolCall": {"name": "run_command", "args": args}, "workspacePaths": ["/repo"]}


def _mcp(tool, arguments, name="mcp_tool"):
    return {"toolCall": {"name": name, "args": {"ServerName": "supabase", "ToolName": tool,
                                                 "Arguments": arguments}}}


def _decide(payload, branch="feature/x", worktree=False):
    return agy_guard.decide(payload, branch_of=lambda _d: branch, is_worktree=lambda _d: worktree)


# ── Hook adapter ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("command", ["git push origin main", "git push origin HEAD:main"])
def test_denies_push_to_main(command):
    assert _decide(_run(command))["decision"] == "deny"


def test_denies_commit_on_main_using_the_commands_cwd():
    seen = []
    decision = agy_guard.decide(_run("git commit -m x", cwd="/elsewhere"),
                                branch_of=lambda d: seen.append(d) or "main", is_worktree=lambda _d: False)
    assert decision["decision"] == "deny" and seen == ["/elsewhere"]


def test_denies_prod_recipes_in_a_worktree_only():
    assert _decide(_run("just promote"), worktree=True)["decision"] == "deny"
    assert _decide(_run("just promote"), worktree=False) is None


@pytest.mark.parametrize("command", [
    "just preflight",
    "git push -u origin HEAD",
    # Claude's sandbox-only `gh` rule must not leak into Antigravity.
    'gh pr create --title x --body "$(cat body.md)"',
    "cd web && gh pr view 1 | jq .title",
])
def test_has_no_opinion_on_ordinary_commands(command):
    assert _decide(_run(command), worktree=True) is None


@pytest.mark.parametrize("arguments", [
    {"query": "select * from fp_notes"},
    '{"query": "update FP_LEAGUES set x = 1"}',  # arguments as a JSON string
])
def test_denies_sql_on_fp_tables(arguments):
    decision = _decide(_mcp("execute_sql", arguments))
    assert decision["decision"] == "deny" and "fp_" in decision["reason"].lower()


def test_denies_fp_sql_when_the_tool_is_named_in_the_step_name():
    payload = {"toolCall": {"name": "mcp_supabase_execute_sql", "args": {"query": "drop table fp_teams"}}}
    assert _decide(payload)["decision"] == "deny"


def test_allows_ordinary_sql():
    assert _decide(_mcp("execute_sql", {"query": "select count(*) from players"})) is None


def test_migrations_always_prompt_and_fp_migrations_are_denied():
    assert _decide(_mcp("apply_migration", {"name": "x", "query": "create table t (id int)"}))["decision"] == "force_ask"
    assert _decide(_mcp("apply_migration", {"name": "x", "query": "alter table fp_teams add y int"}))["decision"] == "deny"


def test_ignores_other_mcp_tools_even_when_their_text_mentions_sql():
    body = "We should stop calling execute_sql against fp_notes from this repo, as the guard says."
    payload = {"toolCall": {"name": "mcp_tool", "args": {"ServerName": "github-mcp-server",
                                                         "ToolName": "add_issue_comment",
                                                         "Arguments": {"body": body}}}}
    assert _decide(payload) is None
    assert _decide(_mcp("list_tables", {"schemas": ["public"]})) is None


def test_script_prints_a_deny_decision():
    proc = subprocess.run([sys.executable, str(ADAPTER_PATH)], input=json.dumps(_run("git push origin main")),
                          capture_output=True, text=True)
    assert proc.returncode == 0 and json.loads(proc.stdout)["decision"] == "deny"


@pytest.mark.parametrize("stdin", ["", "not json", "{}", json.dumps(_run("ls"))])
def test_script_stays_silent_otherwise(stdin):
    proc = subprocess.run([sys.executable, str(ADAPTER_PATH)], input=stdin, capture_output=True, text=True)
    assert proc.returncode == 0 and proc.stdout == ""


def test_hooks_json_runs_the_adapter_for_commands_and_mcp_calls():
    import re
    hooks = json.loads((REPO_ROOT / ".agents" / "hooks.json").read_text())
    (group,) = hooks["repo-guard"]["PreToolUse"]
    for tool in ("run_command", "mcp_tool", "mcp_supabase_execute_sql", "apply_migration"):
        assert re.fullmatch(group["matcher"], tool), tool
    assert not re.fullmatch(group["matcher"], "view_file")
    # The command runs from .agents/, the directory holding hooks.json.
    assert (REPO_ROOT / ".agents" / group["hooks"][0]["command"].split()[-1]).exists()


def test_skills_json_points_at_the_one_skills_directory():
    entries = json.loads((REPO_ROOT / ".agents" / "skills.json").read_text())["entries"]
    assert [e["path"] for e in entries] == [".claude/skills"]
    assert not (REPO_ROOT / ".agents" / "skills").exists(), "skills live in .claude/skills only"


# ── Policy sync ────────────────────────────────────────────────────────────

CLAUDE = {
    "permissions": {
        "allow": ["Bash(just *)", "Bash(ls *)", "Bash(gh pr *)", "WebFetch(domain:community.ottoneu.com)",
                  "mcp__supabase__execute_sql", "WebSearch"],
        "ask": ["Bash(gh pr merge *)", "mcp__supabase__apply_migration"],
        "deny": ["Bash(git push --force *)", "Bash(git push -f *)", "Bash(sudo *)"],
    },
    "sandbox": {
        "network": {"allowedDomains": ["github.com", "*.githubusercontent.com"]},
        "filesystem": {"allowWrite": ["~/.npm"]},
    },
}


@pytest.fixture
def rules():
    return build_rules(CLAUDE, Path("/main"), Path("/home/u"))


def test_network_and_filesystem_rules(rules):
    assert {"read_url(github.com)", "read_url(githubusercontent.com)", "read_url(community.ottoneu.com)",
            "write_file(/home/u/.npm)", "write_file(/main/.git)", "read_file(/main)"} <= set(rules["allow"])
    assert "write_file(/main/.git/hooks)" in rules["deny"]


def test_only_network_commands_are_let_out_of_the_sandbox(rules):
    assert {"unsandboxed(just)", "unsandboxed(git push)", "unsandboxed(gh pr)", "command(gh pr)"} <= set(rules["allow"])
    assert not any("ls" in r for r in rules["allow"]), "sandboxed commands need no rule"


def test_ask_and_deny_carry_over(rules):
    assert rules["ask"] == ["command(gh pr merge)", "unsandboxed(gh pr merge)", "mcp(supabase/apply_migration)"]
    assert "command(sudo)" in rules["deny"] and "mcp(supabase/execute_sql)" in rules["allow"]


@pytest.mark.parametrize("command,denied", [
    ("git push --force origin x", True),
    ("git push origin x -f", True),
    ("git push -u origin HEAD", False),
    ("git push origin fix-force", False),
])
def test_force_push_pattern(rules, command, denied):
    import re
    (pattern,) = [r[len("command(regex:"):-1] for r in rules["deny"] if r.startswith("command(regex:")]
    assert bool(re.fullmatch(pattern, command)) is denied


def test_merge_drops_blanket_mcp_grants_and_keeps_manual_ones(rules):
    existing = {"allow": ["mcp(supabase/*)", "mcp(*)", "command(just doctor)", "command(gh pr merge)"]}
    merged = merge_rules(existing, rules)
    assert "command(just doctor)" in merged["allow"]
    assert not {"mcp(supabase/*)", "mcp(*)", "command(gh pr merge)"} & set(merged["allow"])
    assert merge_rules(merged, rules) == merged, "idempotent"


def test_pin_supabase_moves_the_token_out_of_args():
    config = {"mcpServers": {"supabase": {"command": "npx", "args": ["-y", "pkg", "--access-token", "secret"]},
                             "other": {"command": "x"}}}
    pinned = pin_supabase(config, "ref123")
    assert pinned["mcpServers"]["supabase"] == {
        "command": "npx", "args": ["-y", "pkg", "--project-ref=ref123"], "env": {"SUPABASE_ACCESS_TOKEN": "secret"}}
    assert pinned["mcpServers"]["other"] == {"command": "x"}
    assert pin_supabase(pinned, "ref123") == pinned, "idempotent"
    assert "secret" in config["mcpServers"]["supabase"]["args"], "input is not mutated"
