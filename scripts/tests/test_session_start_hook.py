"""Tests for the SessionStart hook's cloud-session setup (.claude/hooks/session_start.py).

Both directions again: the install must start in a fresh cloud clone, and must
never start on a laptop or in a cloud session that already has a venv.
"""

import importlib.util
from pathlib import Path

import pytest

HOOK_PATH = Path(__file__).resolve().parents[2] / ".claude" / "hooks" / "session_start.py"
_spec = importlib.util.spec_from_file_location("session_start", HOOK_PATH)
session_start = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(session_start)


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "requirements.txt").write_text("-e .\n")
    return tmp_path


@pytest.fixture
def popen(monkeypatch):
    calls = []
    monkeypatch.setattr(session_start.subprocess, "Popen",
                        lambda cmd, **kw: calls.append((cmd, kw)))
    return calls


def test_fresh_cloud_clone_starts_the_install(repo, popen, monkeypatch):
    monkeypatch.setenv("CLAUDE_CODE_REMOTE", "true")
    message = session_start.cloud_setup(str(repo))
    assert len(popen) == 1
    cmd, kw = popen[0]
    assert cmd[:2] == ["bash", "-c"] and "requirements.txt" in cmd[2] and "npm ci" in cmd[2]
    assert kw["cwd"] == str(repo) and kw["start_new_session"] is True
    assert (repo / ".cache" / "cloud-setup.log").exists()
    assert "venv/bin/just" in message and "cloud-setup.log" in message


@pytest.mark.parametrize("remote", [None, "false", "1"])
def test_never_runs_outside_a_cloud_session(repo, popen, monkeypatch, remote):
    if remote is None:
        monkeypatch.delenv("CLAUDE_CODE_REMOTE", raising=False)
    else:
        monkeypatch.setenv("CLAUDE_CODE_REMOTE", remote)
    assert session_start.cloud_setup(str(repo)) is None
    assert popen == []


def test_skips_when_the_venv_already_exists(repo, popen, monkeypatch):
    monkeypatch.setenv("CLAUDE_CODE_REMOTE", "true")
    (repo / "venv" / "bin").mkdir(parents=True)
    (repo / "venv" / "bin" / "python").write_text("")
    assert session_start.cloud_setup(str(repo)) is None
    assert popen == []


def test_skips_a_checkout_that_is_not_this_repo(tmp_path, popen, monkeypatch):
    monkeypatch.setenv("CLAUDE_CODE_REMOTE", "true")
    assert session_start.cloud_setup(str(tmp_path)) is None
    assert popen == []
