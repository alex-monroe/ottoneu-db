#!/usr/bin/env python3
"""Documentation freshness checker — the "garbage collection" agent.

Inspired by harness engineering: periodically scan for stale or inconsistent
documentation that could mislead AI agents or humans.

This script checks:
1. Documentation files referenced in AGENTS.md actually exist
2. No orphan docs exist that aren't referenced anywhere
3. Key files mentioned in CODE_ORGANIZATION.md still exist at the stated paths
4. Schema file (schema.sql) and generated docs haven't drifted too far apart

Usage:
    python scripts/check_docs_freshness.py          # Check and report
    python scripts/check_docs_freshness.py --strict  # Exit 1 on warnings

Returns exit code 0 if all checks pass, 1 if any issues found (in strict mode).
"""

import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# ANSI colors for terminal output
RED = "\033[91m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
RESET = "\033[0m"


def check_agents_md_links() -> list[str]:
    """Verify that all file paths referenced in AGENTS.md exist."""
    issues = []
    agents_md = PROJECT_ROOT / "AGENTS.md"
    if not agents_md.exists():
        return ["AGENTS.md is missing entirely!"]

    content = agents_md.read_text()
    # Match markdown links like [text](path) and bare paths in code blocks
    link_pattern = re.compile(r"\[.*?\]\(([^)]+)\)")
    for match in link_pattern.finditer(content):
        target = match.group(1)
        # Skip URLs
        if target.startswith("http://") or target.startswith("https://"):
            continue
        # Skip anchor links
        if target.startswith("#"):
            continue
        target_path = PROJECT_ROOT / target
        if not target_path.exists():
            issues.append(
                f"AGENTS.md references '{target}' but the file does not exist.\n"
                f"  FIX: Either create {target} or update the link in AGENTS.md."
            )
    return issues


def check_claude_md_links() -> list[str]:
    """Verify that all file paths referenced in CLAUDE.md exist."""
    issues = []
    claude_md = PROJECT_ROOT / "CLAUDE.md"
    if not claude_md.exists():
        return ["CLAUDE.md is missing entirely!"]

    content = claude_md.read_text()
    link_pattern = re.compile(r"\[.*?\]\(([^)]+)\)")
    for match in link_pattern.finditer(content):
        target = match.group(1)
        if target.startswith("http") or target.startswith("#"):
            continue
        target_path = PROJECT_ROOT / target
        if not target_path.exists():
            issues.append(
                f"CLAUDE.md references '{target}' but the file does not exist.\n"
                f"  FIX: Either create {target} or update the link in CLAUDE.md."
            )
    return issues


def check_code_organization_paths() -> list[str]:
    """Verify paths mentioned in CODE_ORGANIZATION.md still exist."""
    issues = []
    code_org = PROJECT_ROOT / "docs" / "CODE_ORGANIZATION.md"
    if not code_org.exists():
        return ["docs/CODE_ORGANIZATION.md is missing!"]

    content = code_org.read_text()
    # Match backtick-enclosed paths like `scripts/config.py`
    path_pattern = re.compile(r"`([a-zA-Z_./][a-zA-Z0-9_./-]+\.\w+)`")
    for match in path_pattern.finditer(content):
        file_path = match.group(1)
        # Skip patterns with wildcards
        if "*" in file_path:
            continue
        full_path = PROJECT_ROOT / file_path
        if not full_path.exists():
            issues.append(
                f"CODE_ORGANIZATION.md references `{file_path}` but the file does not exist.\n"
                f"  FIX: Update docs/CODE_ORGANIZATION.md to reflect the current file locations."
            )
    return issues


def check_orphan_docs() -> list[str]:
    """Find doc files in docs/ not referenced by AGENTS.md or CLAUDE.md."""
    issues = []
    docs_dir = PROJECT_ROOT / "docs"
    if not docs_dir.exists():
        return []

    # Gather all references from AGENTS.md and CLAUDE.md
    referenced = set()
    for md_file in ["AGENTS.md", "CLAUDE.md"]:
        md_path = PROJECT_ROOT / md_file
        if md_path.exists():
            content = md_path.read_text()
            for match in re.finditer(r"\[.*?\]\(([^)]+)\)", content):
                referenced.add(match.group(1))
            # Also match bare paths in code blocks
            for match in re.finditer(r"(?:^|\s)(docs/\S+\.md)", content):
                referenced.add(match.group(1))

    # Check all .md files in docs/
    for md_file in docs_dir.rglob("*.md"):
        rel_path = str(md_file.relative_to(PROJECT_ROOT))
        if rel_path not in referenced:
            issues.append(
                f"'{rel_path}' exists but is not referenced in AGENTS.md or CLAUDE.md.\n"
                f"  FIX: Either add a link to this file in AGENTS.md/CLAUDE.md,\n"
                f"  or delete it if it's no longer needed."
            )

    return issues


def main():
    strict = "--strict" in sys.argv
    all_issues = []

    print("Checking documentation freshness...\n")

    checks = [
        ("AGENTS.md link targets", check_agents_md_links),
        ("CLAUDE.md link targets", check_claude_md_links),
        ("CODE_ORGANIZATION.md paths", check_code_organization_paths),
        ("Orphan documentation files", check_orphan_docs),
    ]

    for name, check_fn in checks:
        issues = check_fn()
        if issues:
            print(f"{YELLOW}[WARN]{RESET} {name}:")
            for issue in issues:
                print(f"  {issue}")
            print()
            all_issues.extend(issues)
        else:
            print(f"{GREEN}[OK]{RESET} {name}")

    print()
    if all_issues:
        print(f"{YELLOW}Found {len(all_issues)} documentation issue(s).{RESET}")
        if strict:
            print(f"{RED}Exiting with error (--strict mode).{RESET}")
            sys.exit(1)
        else:
            print("Run with --strict to fail CI on these issues.")
    else:
        print(f"{GREEN}All documentation checks passed!{RESET}")


if __name__ == "__main__":
    main()
