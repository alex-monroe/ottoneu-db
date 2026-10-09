#!/usr/bin/env python3
"""PostToolUse check on the file Claude just edited — runs in the background.

Registered with `asyncRewake`: Claude keeps working while this runs, and is only
woken (with this script's stderr) when the check fails. Catching a lint or
syntax error at edit time is cheaper than finding it at `just preflight`.

- web/**/*.{ts,tsx,js,jsx,mjs}: ESLint on that one file (skipped when
  web/node_modules is missing — `just worktree-setup`).
- *.py: a compile check with the project venv's interpreter (the system
  python3 may be too old to parse 3.12 syntax; skipped if no venv is found).

Exit 2 = problems found (wakes Claude). Anything else exits 0, silently.
Stdlib only; must stay compatible with Python 3.9 (macOS system python3).
"""
import json
import os
import subprocess
import sys

WEB_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", ".mjs")


def _main_checkout(project_dir):
    try:
        common = subprocess.run(
            ["git", "-C", project_dir, "rev-parse", "--path-format=absolute", "--git-common-dir"],
            capture_output=True, text=True, timeout=5,
        ).stdout.strip()
        return os.path.dirname(common) if common else project_dir
    except (OSError, subprocess.SubprocessError):
        return project_dir


def _run(cmd, cwd):
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=120)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def check_file(path, project_dir):
    """Return a problem report for `path`, or None if it is clean / not checked."""
    rel = os.path.relpath(path, project_dir)
    if rel.startswith(".."):
        return None
    web_dir = os.path.join(project_dir, "web")
    if rel.startswith("web" + os.sep) and path.endswith(WEB_EXTENSIONS):
        if not os.path.isdir(os.path.join(web_dir, "node_modules")):
            return None
        code, out = _run(["npx", "eslint", "--no-warn-ignored", os.path.relpath(path, web_dir)], web_dir)
        return "ESLint errors in {}:\n{}".format(rel, out) if code == 1 else None
    if path.endswith(".py") and not rel.startswith(".claude" + os.sep):
        for root in (project_dir, _main_checkout(project_dir)):
            python = os.path.join(root, "venv", "bin", "python")
            if os.path.exists(python):
                code, out = _run([python, "-m", "py_compile", path], project_dir)
                return "Python syntax error in {}:\n{}".format(rel, out) if code else None
    return None


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return
    path = (payload.get("tool_input") or {}).get("file_path") or ""
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or "."
    if not path or not os.path.isfile(path):
        return
    report = check_file(os.path.abspath(path), os.path.abspath(project_dir))
    if report:
        sys.stderr.write(report[:4000] + "\n")
        sys.exit(2)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        pass
