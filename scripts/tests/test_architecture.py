"""Structural tests that enforce architectural rules across the codebase.

Inspired by "harness engineering" (https://openai.com/index/harness-engineering/)
— these tests act as mechanical guardrails that catch architectural drift
automatically. Each test failure includes a remediation message explaining
*why* the rule exists and *how* to fix the violation, so both humans and
AI agents can self-correct.

See: docs/ARCHITECTURE.md for the rationale behind each rule.
"""

import json
import re
from pathlib import Path

import pytest

# Resolve project root (two levels up from this test file)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
WEB_DIR = PROJECT_ROOT / "web"
CONFIG_JSON = PROJECT_ROOT / "config.json"


# ---------------------------------------------------------------------------
# Helper: collect Python files
# ---------------------------------------------------------------------------

def _python_files(directory: Path) -> list[Path]:
    """Return all .py files under `directory`, excluding __pycache__."""
    return [
        p for p in directory.rglob("*.py")
        if "__pycache__" not in str(p)
    ]


# ===========================================================================
# Rule 1: No hardcoded league constants — use config.py
# ===========================================================================

class TestNoHardcodedConstants:
    """Scripts must import constants from config.py, not hardcode them.

    WHY: Hardcoded values silently diverge when rules change. A single source
    of truth in config.json (loaded by config.py and config.ts) keeps Python
    and TypeScript in lockstep.

    FIX: Import the constant from `scripts.config` instead of using a literal.
    Example:
        # Bad:  league_id = 309
        # Good: from scripts.config import LEAGUE_ID
    """

    ALLOWED_FILES = {
        "config.py",
        "conftest.py",
    }

    def _should_skip(self, path: Path) -> bool:
        return (
            path.name in self.ALLOWED_FILES
            or "/tests/" in str(path)
            or "\\tests\\" in str(path)
            or "__pycache__" in str(path)
        )

    def test_no_hardcoded_league_id(self):
        """No Python script should hardcode the league ID (309) outside config."""
        violations = []
        pattern = re.compile(r"(?<!\d)309(?!\d)")
        for pyfile in _python_files(SCRIPTS_DIR):
            if self._should_skip(pyfile):
                continue
            source = pyfile.read_text()
            for lineno, line in enumerate(source.splitlines(), 1):
                stripped = line.lstrip()
                if stripped.startswith("#"):
                    continue
                if pattern.search(line):
                    rel = pyfile.relative_to(PROJECT_ROOT)
                    violations.append(f"  {rel}:{lineno}: {line.strip()}")

        assert not violations, (
            "Hardcoded league ID (309) found. Import LEAGUE_ID from scripts.config instead.\n"
            "FIX: Replace the literal `309` with `from scripts.config import LEAGUE_ID`.\n"
            "Violations:\n" + "\n".join(violations)
        )


# ===========================================================================
# Rule 2: All scripts must get Supabase client through config
# ===========================================================================

class TestConfigImportPattern:
    """Scripts that use Supabase must go through scripts.config.

    WHY: Direct `create_client()` calls risk missing the shared dotenv
    loading and credential validation that `get_supabase_client()` provides.

    FIX: Replace `from supabase import create_client` with
         `from scripts.config import get_supabase_client`.
    """

    ALLOWED_FILES = {"config.py", "conftest.py"}

    def test_no_direct_supabase_create_client(self):
        violations = []
        pattern = re.compile(r"from\s+supabase\s+import\s+create_client")
        for pyfile in _python_files(SCRIPTS_DIR):
            if pyfile.name in self.ALLOWED_FILES:
                continue
            if "/tests/" in str(pyfile) or "\\tests\\" in str(pyfile):
                continue
            source = pyfile.read_text()
            for lineno, line in enumerate(source.splitlines(), 1):
                if pattern.search(line):
                    rel = pyfile.relative_to(PROJECT_ROOT)
                    violations.append(f"  {rel}:{lineno}: {line.strip()}")

        assert not violations, (
            "Direct `from supabase import create_client` found.\n"
            "FIX: Use `from scripts.config import get_supabase_client` instead.\n"
            "This ensures credentials are loaded from .env and validated.\n"
            "Violations:\n" + "\n".join(violations)
        )


# ===========================================================================
# Rule 3: Config sync — config.json keys must match Python & TypeScript
# ===========================================================================

class TestConfigSync:
    """config.json, scripts/config.py, and web/lib/config.ts must stay in sync.

    WHY: This project uses a shared config.json as the single source of truth
    for league constants. If a key is added to config.json but not consumed in
    one of the language-specific config files, the value is dead. If a key is
    consumed but doesn't exist in config.json, the application crashes at
    runtime.

    FIX: When adding a new config key, update all three files:
      1. config.json — add the key/value
      2. scripts/config.py — add `CONSTANT = _config["KEY"]`
      3. web/lib/config.ts — add `export const CONSTANT = config.KEY`
    """

    def _get_json_keys(self) -> set:
        with open(CONFIG_JSON) as f:
            return set(json.load(f).keys())

    def _get_python_config_keys(self) -> set:
        """Extract keys accessed via _config["KEY"] in config.py."""
        source = (SCRIPTS_DIR / "config.py").read_text()
        return set(re.findall(r'_config\["(\w+)"\]', source))

    def _get_ts_config_keys(self) -> set:
        """Extract keys accessed via config.KEY in config.ts (excluding import path)."""
        source = (WEB_DIR / "lib" / "config.ts").read_text()
        # Exclude matches on the import line (e.g., "config.json")
        keys = set(re.findall(r"config\.(\w+)", source))
        keys.discard("json")  # from `import config from "../../config.json"`
        return keys

    def test_python_consumes_all_json_keys(self):
        json_keys = self._get_json_keys()
        py_keys = self._get_python_config_keys()
        missing = json_keys - py_keys
        assert not missing, (
            f"config.json keys not consumed in scripts/config.py: {missing}\n"
            "FIX: Add `CONSTANT = _config[\"KEY\"]` to scripts/config.py for each missing key.\n"
            "If the key is intentionally frontend-only, add it to the FRONTEND_ONLY set in this test."
        )

    def test_typescript_consumes_all_json_keys(self):
        json_keys = self._get_json_keys()
        ts_keys = self._get_ts_config_keys()
        # Some keys may be Python-only (e.g., used only for scraping)
        python_only = {"COLLEGE_POSITIONS"}
        expected = json_keys - python_only
        missing = expected - ts_keys
        assert not missing, (
            f"config.json keys not consumed in web/lib/config.ts: {missing}\n"
            "FIX: Add `export const CONSTANT = config.KEY` to web/lib/config.ts.\n"
            "If the key is intentionally Python-only, add it to the `python_only` set in this test."
        )

    def test_python_keys_exist_in_json(self):
        json_keys = self._get_json_keys()
        py_keys = self._get_python_config_keys()
        extra = py_keys - json_keys
        assert not extra, (
            f"scripts/config.py references keys missing from config.json: {extra}\n"
            "FIX: Either add the key to config.json or remove the reference from config.py."
        )

    def test_typescript_keys_exist_in_json(self):
        json_keys = self._get_json_keys()
        ts_keys = self._get_ts_config_keys()
        extra = ts_keys - json_keys
        assert not extra, (
            f"web/lib/config.ts references keys missing from config.json: {extra}\n"
            "FIX: Either add the key to config.json or remove the reference from config.ts."
        )


# ===========================================================================
# Rule 4: Dependency direction — analysis scripts must not import from tasks
# ===========================================================================

class TestDependencyDirection:
    """Analysis scripts must not import from the task/scraping layer.

    WHY: The dependency flow is:  config -> tasks -> worker -> analysis.
    Analysis scripts consume database data, not raw scraping logic. Importing
    from tasks would create a circular dependency risk and couple analytics
    to scraping implementation details.

    FIX: If analysis needs data that tasks produce, query the database instead
    of importing task internals.
    """

    def test_analysis_does_not_import_tasks(self):
        violations = []
        pattern = re.compile(r"(?:from|import)\s+scripts\.tasks")
        for pyfile in _python_files(SCRIPTS_DIR):
            if not pyfile.name.startswith("analyze_"):
                continue
            source = pyfile.read_text()
            for lineno, line in enumerate(source.splitlines(), 1):
                if pattern.search(line):
                    rel = pyfile.relative_to(PROJECT_ROOT)
                    violations.append(f"  {rel}:{lineno}: {line.strip()}")

        assert not violations, (
            "Analysis scripts must not import from the tasks layer.\n"
            "FIX: Query the database directly (via analysis_utils) instead of importing task modules.\n"
            "The dependency flow is: config -> tasks -> worker -> analysis -> reports.\n"
            "Violations:\n" + "\n".join(violations)
        )

    def test_config_does_not_import_other_scripts(self):
        """config.py must be a leaf dependency — no imports from other modules."""
        violations = []
        pattern = re.compile(r"(?:from|import)\s+scripts\.(?!config)")
        source = (SCRIPTS_DIR / "config.py").read_text()
        for lineno, line in enumerate(source.splitlines(), 1):
            if pattern.search(line):
                violations.append(f"  scripts/config.py:{lineno}: {line.strip()}")

        assert not violations, (
            "config.py must not import from other script modules.\n"
            "FIX: config.py is the root dependency — it should only import stdlib and third-party packages.\n"
            "Other scripts import FROM config, not the other way around.\n"
            "Violations:\n" + "\n".join(violations)
        )


# ===========================================================================
# Rule 5: No wildcard imports
# ===========================================================================

class TestNoWildcardImports:
    """Python scripts must not use wildcard imports (from module import *).

    WHY: Wildcard imports make it impossible to trace where a name comes from,
    which is especially problematic for AI agents that need to understand
    dependency relationships. They also risk name collisions.

    FIX: Replace `from module import *` with explicit named imports:
         `from module import SpecificName, AnotherName`
    """

    def test_no_star_imports(self):
        violations = []
        pattern = re.compile(r"^from\s+\S+\s+import\s+\*")
        for pyfile in _python_files(SCRIPTS_DIR):
            # Skip test files — they may mention the pattern in docstrings
            if "/tests/" in str(pyfile) or "\\tests\\" in str(pyfile):
                continue
            source = pyfile.read_text()
            for lineno, line in enumerate(source.splitlines(), 1):
                stripped = line.lstrip()
                if stripped.startswith("#") or stripped.startswith('"""') or stripped.startswith("'"):
                    continue
                if pattern.match(stripped):
                    rel = pyfile.relative_to(PROJECT_ROOT)
                    violations.append(f"  {rel}:{lineno}: {line.strip()}")

        assert not violations, (
            "Wildcard imports (`from module import *`) found.\n"
            "FIX: Replace with explicit named imports so dependencies are traceable.\n"
            "Example: `from scripts.config import LEAGUE_ID, SEASON`\n"
            "Violations:\n" + "\n".join(violations)
        )


# ===========================================================================
# Rule 6: Documentation freshness — key docs must exist
# ===========================================================================

class TestDocumentationExists:
    """Critical documentation files must exist and not be empty.

    WHY: The AGENTS.md / CLAUDE.md system works as a "table of contents" that
    points to deeper docs. If those target docs are missing or empty, agents
    lose access to critical context and make worse decisions.

    FIX: Create or restore the missing documentation file. See the documentation
    map in AGENTS.md for what each file should contain.
    """

    REQUIRED_DOCS = [
        "AGENTS.md",
        "CLAUDE.md",
        "docs/ARCHITECTURE.md",
        "docs/CODE_ORGANIZATION.md",
        "docs/COMMANDS.md",
        "docs/FRONTEND.md",
        "docs/GIT_WORKFLOW.md",
        "docs/TESTING.md",
        "docs/generated/db-schema.md",
        "docs/references/ottoneu-rules.md",
        "docs/references/environment-variables.md",
    ]

    @pytest.mark.parametrize("doc_path", REQUIRED_DOCS)
    def test_required_doc_exists_and_nonempty(self, doc_path: str):
        full_path = PROJECT_ROOT / doc_path
        assert full_path.exists(), (
            f"Required documentation file is missing: {doc_path}\n"
            f"FIX: Create {doc_path} with appropriate content.\n"
            "See the documentation map in AGENTS.md for guidance on what this file should contain."
        )
        content = full_path.read_text().strip()
        assert len(content) > 10, (
            f"Documentation file is effectively empty: {doc_path}\n"
            f"FIX: Add meaningful content to {doc_path}.\n"
            "Empty docs break the agent knowledge system — each doc must have real content."
        )


# ===========================================================================
# Rule 7: Frontend layer boundaries
# ===========================================================================

class TestFrontendLayerBoundaries:
    """Shared library code (web/lib/) must not import from components.

    WHY: The frontend dependency flow is: types -> config -> lib -> components -> pages.
    Library modules are pure logic — they must be importable without React.
    If lib/ imports from components/, it creates circular dependencies and
    makes the logic untestable outside a React context.

    FIX: Move shared logic into web/lib/ and have components import from there.
    """

    def test_lib_does_not_import_components(self):
        violations = []
        lib_dir = WEB_DIR / "lib"
        if not lib_dir.exists():
            pytest.skip("web/lib/ not found")

        pattern = re.compile(r"""(?:from|import)\s+['"].*components""")
        for tsfile in lib_dir.glob("*.ts"):
            source = tsfile.read_text()
            for lineno, line in enumerate(source.splitlines(), 1):
                if pattern.search(line):
                    rel = tsfile.relative_to(PROJECT_ROOT)
                    violations.append(f"  {rel}:{lineno}: {line.strip()}")

        assert not violations, (
            "web/lib/ must not import from web/components/.\n"
            "FIX: Library modules should be pure logic (no React dependencies).\n"
            "The dependency flow is: types -> config -> lib -> components -> pages.\n"
            "Move shared logic to lib/ and have components import from there.\n"
            "Violations:\n" + "\n".join(violations)
        )


# ===========================================================================
# Rule 8: Analysis scripts must use analysis_utils helpers
# ===========================================================================

class TestAnalysisPatterns:
    """Analysis scripts must follow the established data-fetching patterns.

    WHY: analysis_utils.py provides shared helpers for fetching and merging
    data from Supabase. Bypassing these helpers leads to inconsistent data
    handling (e.g., missing column coercion, incorrect joins).

    FIX: Use `from scripts.analysis_utils import fetch_all_data, merge_data`
    instead of writing custom Supabase queries in analysis scripts.
    """

    def test_analysis_scripts_do_not_create_supabase_client_directly(self):
        violations = []
        pattern = re.compile(r"create_client\s*\(")
        for pyfile in _python_files(SCRIPTS_DIR):
            if not pyfile.name.startswith("analyze_"):
                continue
            source = pyfile.read_text()
            for lineno, line in enumerate(source.splitlines(), 1):
                if pattern.search(line):
                    rel = pyfile.relative_to(PROJECT_ROOT)
                    violations.append(f"  {rel}:{lineno}: {line.strip()}")

        assert not violations, (
            "Analysis scripts must not call `create_client()` directly.\n"
            "FIX: Use `from scripts.config import get_supabase_client` or\n"
            "     use `from scripts.analysis_utils import fetch_all_data`.\n"
            "Violations:\n" + "\n".join(violations)
        )
