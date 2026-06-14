#!/usr/bin/env python3
"""Environment self-diagnosis — `just doctor`.

A fast (<1s), offline check for the recurring environment traps documented in
CLAUDE.md and docs/TESTING.md, each of which otherwise costs a debugging
session when hit:

1. Stale editable install — `pip install -e .` run from a `.claude/worktrees/`
   path pins the `scripts` package to a dead worktree; edits silently no-op.
2. Broken venv / `import scripts.config` failure.
3. Missing `.env` or required keys (names checked, never values).
4. `web/node_modules` older than `web/package-lock.json` (stale deps).
5. Stale `.cache/holdout` — must be cleared after a stats backfill or
   holdout-eval results are silently wrong (warn-only heuristic).

Each check prints PASS / WARN / FAIL with an actionable fix, in the
teaching-message style of the architecture tests.

Exit code: nonzero if any HARD failure (broken venv, stale/missing editable
mapping); zero when only soft warnings (cache age, stale node_modules).

Usage:
    venv/bin/python scripts/doctor.py     # or: just doctor
"""

import glob
import os
import re
import sys
from pathlib import Path
from typing import List, Optional, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# ANSI colors
RED = "\033[91m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
BOLD = "\033[1m"
RESET = "\033[0m"

# Status levels
PASS = "PASS"
WARN = "WARN"
FAIL = "FAIL"  # hard failure → nonzero exit

# Result tuple: (status, title, detail, fix)
Result = Tuple[str, str, str, Optional[str]]


def check_venv_import() -> Result:
    """venv/bin/python exists and `import scripts.config` resolves."""
    title = "venv + scripts package import"
    # We are (ideally) running under venv/bin/python already.
    in_venv = "venv" in Path(sys.executable).parts
    try:
        import scripts.config  # noqa: F401

        detail = f"running under {sys.executable}; import scripts.config OK"
        if not in_venv:
            return (
                WARN,
                title,
                f"import works but interpreter ({sys.executable}) is not the "
                f"repo venv",
                "Run via `just doctor` (uses venv/bin/python).",
            )
        return (PASS, title, detail, None)
    except Exception as exc:  # pragma: no cover - exercised manually
        return (
            FAIL,
            title,
            f"import scripts.config failed: {exc!r}",
            "venv/bin/pip install -e .   (and ensure venv/ exists: just install)",
        )


def _find_editable_mapping() -> Tuple[Optional[Path], Optional[str]]:
    """Return (mapped_scripts_path, source_description) from the editable install.

    Setuptools may install either a `__editable___*_finder.py` (with a MAPPING
    dict) or a simple `__editable__*.pth` pointing at the project root.
    """
    site_globs = [
        str(PROJECT_ROOT / "venv" / "lib" / "*" / "site-packages"),
    ]
    site_dirs: List[str] = []
    for g in site_globs:
        site_dirs.extend(glob.glob(g))

    for site in site_dirs:
        # 1. finder file with a MAPPING dict
        for finder in glob.glob(os.path.join(site, "__editable__*finder.py")):
            text = Path(finder).read_text()
            m = re.search(r"MAPPING\s*[:=].*?\{([^}]*)\}", text, re.DOTALL)
            if m:
                pair = re.search(r"['\"]scripts['\"]\s*:\s*['\"]([^'\"]+)['\"]", m.group(1))
                if pair:
                    return Path(pair.group(1)), os.path.basename(finder)
        # 2. simple .pth pointing at the repo root
        for pth in glob.glob(os.path.join(site, "__editable__*.pth")):
            for line in Path(pth).read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("import"):
                    return Path(line) / "scripts", os.path.basename(pth)
    return None, None


def check_editable_mapping() -> Result:
    """The editable install must map `scripts` to THIS repo, not a worktree."""
    title = "editable install mapping"
    mapped, source = _find_editable_mapping()
    expected = PROJECT_ROOT / "scripts"
    if mapped is None:
        return (
            FAIL,
            title,
            "no editable install found for the `scripts` package",
            "venv/bin/pip install -e .",
        )
    try:
        same = mapped.resolve() == expected.resolve()
    except OSError:
        same = False
    if same:
        return (PASS, title, f"{source} → {mapped}", None)
    return (
        FAIL,
        title,
        f"{source} maps `scripts` to {mapped}, not {expected}. "
        f"Edits to scripts/ will silently no-op (stale worktree pin).",
        "venv/bin/pip install -e .   (run from the project root, not a worktree)",
    )


# Keys that, if absent, will break the core data/projection pipeline.
REQUIRED_ENV_KEYS = ("SUPABASE_URL", "SUPABASE_KEY")
# Keys used by specific scrapers — nice to have, warn only.
OPTIONAL_ENV_KEYS = ("FANGRAPHS_USERNAME", "FANGRAPHS_PASSWORD")


def check_env_file() -> Result:
    """`.env` exists and declares the required keys (names only, never values)."""
    title = ".env required keys"
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return (
            FAIL,
            title,
            ".env is missing",
            "Create .env per docs/references/environment-variables.md",
        )
    present = set()
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        present.add(line.split("=", 1)[0].strip())
    missing_required = [k for k in REQUIRED_ENV_KEYS if k not in present]
    missing_optional = [k for k in OPTIONAL_ENV_KEYS if k not in present]
    if missing_required:
        return (
            FAIL,
            title,
            f"missing required key(s): {', '.join(missing_required)}",
            "Add them to .env (see docs/references/environment-variables.md).",
        )
    if missing_optional:
        return (
            WARN,
            title,
            f"required keys present; optional scraper key(s) absent: "
            f"{', '.join(missing_optional)}",
            "Add them only if running the arbitration-progress scraper.",
        )
    return (PASS, title, "all required keys present", None)


def check_node_modules() -> Result:
    """web/node_modules should be at least as new as web/package-lock.json."""
    title = "web/node_modules freshness"
    nm = PROJECT_ROOT / "web" / "node_modules"
    lock = PROJECT_ROOT / "web" / "package-lock.json"
    if not lock.exists():
        return (WARN, title, "web/package-lock.json not found", None)
    if not nm.exists():
        return (
            WARN,
            title,
            "web/node_modules is missing",
            "cd web && npm install",
        )
    if nm.stat().st_mtime < lock.stat().st_mtime:
        return (
            WARN,
            title,
            "node_modules is older than package-lock.json (deps may be stale)",
            "cd web && npm install",
        )
    return (PASS, title, "node_modules newer than lockfile", None)


def check_holdout_cache() -> Result:
    """Heuristic, warn-only: remind that .cache/holdout is invalidated by backfills."""
    title = ".cache/holdout (eval cache)"
    cache = PROJECT_ROOT / ".cache" / "holdout"
    if not cache.exists():
        return (PASS, title, "no cache present (nothing to go stale)", None)
    entries = list(cache.glob("*.json"))
    if not entries:
        return (PASS, title, "cache dir empty", None)
    newest = max(e.stat().st_mtime for e in entries)
    import time

    age_h = (time.time() - newest) / 3600.0
    return (
        WARN,
        title,
        f"{len(entries)} cached fold(s), newest {age_h:.0f}h old. "
        f"Cache is keyed by config, NOT by DB contents — a stats backfill "
        f"silently invalidates it.",
        "rm -rf .cache/holdout   (after any stats backfill, before holdout-eval)",
    )


CHECKS = [
    check_venv_import,
    check_editable_mapping,
    check_env_file,
    check_node_modules,
    check_holdout_cache,
]


def run_checks() -> List[Result]:
    return [fn() for fn in CHECKS]


def main() -> None:
    print(f"{BOLD}ottoneu-db doctor{RESET} — environment self-diagnosis\n")
    results = run_checks()
    hard_failures = 0
    warnings = 0
    for status, title, detail, fix in results:
        if status == PASS:
            badge = f"{GREEN}[PASS]{RESET}"
        elif status == WARN:
            badge = f"{YELLOW}[WARN]{RESET}"
            warnings += 1
        else:
            badge = f"{RED}[FAIL]{RESET}"
            hard_failures += 1
        print(f"{badge} {title}")
        print(f"       {detail}")
        if fix and status != PASS:
            print(f"       {BOLD}fix:{RESET} {fix}")
    print()
    if hard_failures:
        print(
            f"{RED}{hard_failures} hard failure(s){RESET}, "
            f"{warnings} warning(s). Fix the failures above."
        )
        sys.exit(1)
    if warnings:
        print(f"{YELLOW}All hard checks passed, {warnings} warning(s).{RESET}")
    else:
        print(f"{GREEN}All checks passed.{RESET}")


if __name__ == "__main__":
    main()
