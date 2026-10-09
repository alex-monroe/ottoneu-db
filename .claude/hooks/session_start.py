#!/usr/bin/env python3
"""SessionStart hook: refresh origin/main and prepare a fresh worktree.

Replaces a hook that ran `cd <main checkout> && git checkout main && git pull`
from every session — which switched the main checkout's branch out from under
whoever was using it, and did nothing for the worktree the session runs in.

- `git fetch origin main` only: branch from `origin/main`, never switch a
  shared checkout.
- In a linked worktree with no web/node_modules, start `just worktree-setup`
  in the background (log: .cache/worktree-setup.log) and say so — this stdout
  is added to Claude's context.

Never fails the session. Stdlib only; Python 3.9 compatible (macOS system python3).
"""
import os
import subprocess


def main():
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    try:
        subprocess.run(
            ["git", "-C", project_dir, "fetch", "-q", "origin", "main"],
            capture_output=True, timeout=20,
        )
    except (OSError, subprocess.SubprocessError):
        pass

    try:
        git_dir = subprocess.run(
            ["git", "-C", project_dir, "rev-parse", "--absolute-git-dir"],
            capture_output=True, text=True, timeout=5,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return
    web = os.path.join(project_dir, "web")
    if "/worktrees/" not in git_dir or os.path.isdir(os.path.join(web, "node_modules")):
        return
    if not os.path.exists(os.path.join(web, "package.json")):
        return

    log_dir = os.path.join(project_dir, ".cache")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, "worktree-setup.log")
    with open(log_path, "w") as log:
        subprocess.Popen(
            ["just", "worktree-setup"], cwd=project_dir,
            stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
        )
    print(
        "Fresh worktree: installing web/node_modules in the background "
        "(`just worktree-setup`, log .cache/worktree-setup.log). Web lint, "
        "typecheck and jest need it to finish; Python recipes work now."
    )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
