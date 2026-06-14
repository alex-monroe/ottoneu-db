"""Tests for the worktree-shared holdout cache dir resolution + key invalidation (GH #629)."""

import importlib
import subprocess
from pathlib import Path
from types import SimpleNamespace

hc = importlib.import_module("scripts.feature_projections.holdout_cache")


# ---------------------------------------------------------------------------
# Cache-dir resolution order
# ---------------------------------------------------------------------------

def test_env_override_wins(monkeypatch):
    monkeypatch.setenv("OTTONEU_HOLDOUT_CACHE", "/tmp/explicit_cache")
    assert hc._resolve_cache_dir() == Path("/tmp/explicit_cache")


def test_env_override_expands_user(monkeypatch):
    monkeypatch.setenv("OTTONEU_HOLDOUT_CACHE", "~/holdout")
    assert hc._resolve_cache_dir() == Path("~/holdout").expanduser()


def test_resolves_to_main_repo_via_git_common_dir(monkeypatch):
    monkeypatch.delenv("OTTONEU_HOLDOUT_CACHE", raising=False)

    def fake_run(*args, **kwargs):
        # Worktree case: common dir is the main repo's absolute .git.
        return SimpleNamespace(returncode=0, stdout="/abs/main/.git\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert hc._resolve_cache_dir(repo_root="/abs/worktrees/wt1") == Path(
        "/abs/main/.cache/holdout"
    )


def test_relative_common_dir_resolved_against_repo_root(monkeypatch, tmp_path):
    monkeypatch.delenv("OTTONEU_HOLDOUT_CACHE", raising=False)

    def fake_run(*args, **kwargs):
        # Main-checkout case: git returns a relative ".git".
        return SimpleNamespace(returncode=0, stdout=".git\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    got = hc._resolve_cache_dir(repo_root=str(tmp_path))
    assert got == tmp_path.resolve() / ".cache" / "holdout"


def test_falls_back_to_local_when_git_fails(monkeypatch):
    monkeypatch.delenv("OTTONEU_HOLDOUT_CACHE", raising=False)

    def boom(*args, **kwargs):
        raise OSError("git not found")

    monkeypatch.setattr(subprocess, "run", boom)
    assert hc._resolve_cache_dir(repo_root="/some/root") == Path(
        "/some/root/.cache/holdout"
    )


def test_falls_back_when_git_returns_nonzero(monkeypatch):
    monkeypatch.delenv("OTTONEU_HOLDOUT_CACHE", raising=False)

    def fake_run(*args, **kwargs):
        return SimpleNamespace(returncode=128, stdout="", stderr="not a git repo")

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert hc._resolve_cache_dir(repo_root="/some/root") == Path(
        "/some/root/.cache/holdout"
    )


# ---------------------------------------------------------------------------
# Key invalidation: feature/model code changes must change the fingerprint,
# so a worktree editing code cannot reuse (or poison) the shared cache.
# ---------------------------------------------------------------------------

def test_feature_code_version_changes_when_code_changes(monkeypatch, tmp_path):
    f = tmp_path / "feat.py"
    f.write_text("x = 1\n")
    monkeypatch.setattr(hc, "_FEATURE_DIR", tmp_path)
    monkeypatch.setattr(hc, "_CODE_FILES", [])

    monkeypatch.setattr(hc, "_feature_code_version_cache", None)
    v1 = hc.feature_code_version()

    f.write_text("x = 2  # edited\n")
    monkeypatch.setattr(hc, "_feature_code_version_cache", None)  # bypass memoization
    v2 = hc.feature_code_version()

    assert v1 != v2
