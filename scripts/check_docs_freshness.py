#!/usr/bin/env python3
"""Documentation freshness checker — the "garbage collection" agent.

Inspired by harness engineering: periodically scan for stale or inconsistent
documentation that could mislead AI agents or humans.

This script checks:
1. File paths referenced in README.md, AGENTS.md and CLAUDE.md actually exist
2. Every `just <recipe>` named in a doc actually exists in the Justfile
3. CLAUDE.md stays a thin pointer at AGENTS.md rather than drifting into a copy
4. No orphan docs exist that aren't referenced anywhere
5. Key files mentioned in CODE_ORGANIZATION.md still exist at the stated paths

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

# Docs whose markdown links are validated against the filesystem. README.md is the
# human entry point and AGENTS.md the agent entry point; both rotted in the past
# precisely because nothing checked them (see docs/ONBOARDING.md).
LINK_CHECKED_DOCS = ["README.md", "AGENTS.md", "CLAUDE.md"]

# Docs scanned for `just <recipe>` mentions. Recipes get renamed and removed; a doc
# telling a newcomer to run a recipe that no longer exists is worse than no doc.
RECIPE_CHECKED_DOCS = [
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "docs/ONBOARDING.md",
    "docs/COMMANDS.md",
    "docs/TESTING.md",
    "docs/SUBSYSTEMS.md",
]

# CLAUDE.md is deliberately a pointer at AGENTS.md (the two were ~95% duplicated and
# had already drifted apart by seven subsystems). Anything longer means someone
# started copying content back in.
CLAUDE_MD_MAX_LINES = 60


def _markdown_link_targets(content: str) -> list[str]:
    """Local file paths linked from a markdown document, anchors stripped."""
    targets = []
    for match in re.finditer(r"\[.*?\]\(([^)]+)\)", content):
        target = match.group(1)
        if target.startswith(("http://", "https://", "#", "mailto:")):
            continue
        targets.append(target)
    return targets


def check_entry_point_links() -> list[str]:
    """Verify that every local path linked from an entry-point doc exists."""
    issues = []
    for doc in LINK_CHECKED_DOCS:
        doc_path = PROJECT_ROOT / doc
        if not doc_path.exists():
            issues.append(f"{doc} is missing entirely!")
            continue

        for target in _markdown_link_targets(doc_path.read_text()):
            if not (PROJECT_ROOT / target.split("#")[0]).exists():
                issues.append(
                    f"{doc} references '{target}' but the file does not exist.\n"
                    f"  FIX: Either create {target} or update the link in {doc}."
                )
    return issues


def _justfile_recipes() -> set[str]:
    """Recipe names declared in the Justfile.

    Parsed directly rather than shelling out to `just --summary` so this check stays
    offline and works even when the build runner isn't installed.
    """
    justfile = PROJECT_ROOT / "Justfile"
    if not justfile.exists():
        return set()

    # A recipe line starts at column 0: `name`, `name *args:`, `name arg="default":`.
    # Parameter defaults can contain `=`, so only `:` terminates the signature; the
    # negative lookahead then skips variable assignments (`python := "venv/bin/..."`).
    recipe_pattern = re.compile(r"^([a-z][a-z0-9-]*)(?:\s+[^:\n]*)?:(?!=)", re.MULTILINE)
    return set(recipe_pattern.findall(justfile.read_text()))


def _code_spans(content: str) -> list[str]:
    """Inline-code spans and fenced code blocks from a markdown document.

    Recipe mentions are only checked inside code, because prose legitimately uses
    "just" as an adverb ("just above the query", "just learn what...").
    """
    spans = re.findall(r"```.*?```", content, re.DOTALL)
    without_fences = re.sub(r"```.*?```", "", content, flags=re.DOTALL)
    spans.extend(re.findall(r"`([^`\n]+)`", without_fences))
    return spans


def check_just_recipes() -> list[str]:
    """Verify that every `just <recipe>` mentioned in a doc exists in the Justfile."""
    recipes = _justfile_recipes()
    if not recipes:
        return ["Could not parse any recipes out of the Justfile — is it missing?"]

    issues = []
    mention_pattern = re.compile(r"\bjust\s+([a-z][a-z0-9-]*)")

    for doc in RECIPE_CHECKED_DOCS:
        doc_path = PROJECT_ROOT / doc
        if not doc_path.exists():
            continue

        seen = set()
        for span in _code_spans(doc_path.read_text()):
            for match in mention_pattern.finditer(span):
                name = match.group(1)
                if name in recipes or name in seen:
                    continue
                seen.add(name)
                issues.append(
                    f"{doc} tells the reader to run `just {name}`, "
                    f"but no such recipe exists in the Justfile.\n"
                    f"  FIX: Update {doc}, or add the recipe. `just --list` shows what exists."
                )
    return issues


def check_claude_md_is_pointer() -> list[str]:
    """Verify CLAUDE.md still delegates to AGENTS.md instead of duplicating it."""
    claude_md = PROJECT_ROOT / "CLAUDE.md"
    if not claude_md.exists():
        return ["CLAUDE.md is missing entirely!"]

    content = claude_md.read_text()
    issues = []

    if "AGENTS.md" not in content:
        issues.append(
            "CLAUDE.md no longer points at AGENTS.md.\n"
            "  FIX: CLAUDE.md is a pointer — the canonical agent instructions live in\n"
            "  AGENTS.md. Add the pointer back rather than duplicating content."
        )

    line_count = len(content.splitlines())
    if line_count > CLAUDE_MD_MAX_LINES:
        issues.append(
            f"CLAUDE.md is {line_count} lines, over the {CLAUDE_MD_MAX_LINES}-line budget.\n"
            f"  FIX: CLAUDE.md should only hold Claude Code-specific notes and a pointer\n"
            f"  at AGENTS.md. Move shared guidance into AGENTS.md instead — the two files\n"
            f"  were previously near-duplicates and silently drifted apart."
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
        # Skip patterns with wildcards or names without directory separators (like sys.path or bare filenames)
        if "*" in file_path or "/" not in file_path:
            continue
        full_path = PROJECT_ROOT / file_path
        if not full_path.exists():
            issues.append(
                f"CODE_ORGANIZATION.md references `{file_path}` but the file does not exist.\n"
                f"  FIX: Update docs/CODE_ORGANIZATION.md to reflect the current file locations."
            )
    return issues


def check_orphan_docs() -> list[str]:
    """Find doc files in docs/ not referenced from an entry point."""
    issues = []
    docs_dir = PROJECT_ROOT / "docs"
    if not docs_dir.exists():
        return []

    # Gather all references from the entry points and the maps they own.
    referenced = set()
    for md_file in LINK_CHECKED_DOCS + ["docs/SUBSYSTEMS.md", "docs/ONBOARDING.md"]:
        md_path = PROJECT_ROOT / md_file
        if not md_path.exists():
            continue
        content = md_path.read_text()
        for target in _markdown_link_targets(content):
            referenced.add(target.split("#")[0])
        # Also match bare paths in code blocks
        for match in re.finditer(r"(?:^|\s)(docs/\S+\.md)", content):
            referenced.add(match.group(1))

    for md_file in docs_dir.rglob("*.md"):
        rel_path = str(md_file.relative_to(PROJECT_ROOT))
        if rel_path not in referenced:
            issues.append(
                f"'{rel_path}' exists but is not referenced from README.md, AGENTS.md,\n"
                f"  CLAUDE.md, docs/SUBSYSTEMS.md or docs/ONBOARDING.md.\n"
                f"  FIX: Either add a link to this file from one of those, or delete it\n"
                f"  if it's no longer needed."
            )

    return issues


def main():
    strict = "--strict" in sys.argv
    all_issues = []

    print("Checking documentation freshness...\n")

    checks = [
        ("Entry-point link targets (README/AGENTS/CLAUDE)", check_entry_point_links),
        ("just recipes named in docs", check_just_recipes),
        ("CLAUDE.md is a pointer, not a copy", check_claude_md_is_pointer),
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
