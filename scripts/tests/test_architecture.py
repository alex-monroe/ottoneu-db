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

class TestConfigCodegen:
    """The generated config blocks must be freshly generated from config.json.

    WHY: config.json is the single source of truth for league constants.
    `scripts/gen_config.py` emits the Python and TypeScript constant
    declarations into a marked block in `scripts/config.py` and
    `web/lib/config.ts`, so adding a key is a one-file edit (config.json) plus
    `just gen-config` — no manual three-way sync. This test fails if the
    checked-in blocks drift from config.json.

    FIX: run `just gen-config` and commit scripts/config.py + web/lib/config.ts.
    """

    def test_generated_blocks_are_fresh(self):
        from scripts import gen_config

        assert gen_config.regenerate(write=False), (
            "Generated config blocks are stale relative to config.json.\n"
            "FIX: run `just gen-config` and commit scripts/config.py + web/lib/config.ts."
        )


class TestConfigSync:
    """config.json, scripts/config.py, and web/lib/config.ts must stay in sync.

    WHY: This project uses a shared config.json as the single source of truth
    for league constants. The constant declarations in config.py / config.ts are
    GENERATED from it (see TestConfigCodegen + `just gen-config`); these
    invariants additionally guard that every key is consumed and that no
    dangling key is referenced.

    FIX: edit config.json, then run `just gen-config` — do not hand-edit the
    generated blocks.
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
        # Keys used only by the TypeScript frontend (not needed in Python).
        # Season + salary-snapshot dates are no longer static config — they are
        # resolved from league_calendar (scripts/season.py, web/lib/season.ts).
        frontend_only: set[str] = set()
        missing = json_keys - py_keys - frontend_only
        assert not missing, (
            f"config.json keys not consumed in scripts/config.py: {missing}\n"
            "FIX: Add `CONSTANT = _config[\"KEY\"]` to scripts/config.py for each missing key.\n"
            "If the key is intentionally frontend-only, add it to the FRONTEND_ONLY set in this test."
        )

    def test_typescript_consumes_all_json_keys(self):
        json_keys = self._get_json_keys()
        ts_keys = self._get_ts_config_keys()
        # Some keys may be Python-only (e.g., used only for scraping). Currently empty —
        # every config.json key must be exported by web/lib/config.ts.
        python_only: set[str] = set()
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
            "Example: `from scripts.config import LEAGUE_ID, MY_TEAM`\n"
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
# Rule 8: Supabase pagination — no raw .execute() on large tables
# ===========================================================================

# Tables that routinely exceed PostgREST's 1000-row default cap. A plain
# `.execute()` against any of these silently truncates to the first 1000 rows.
# This bug has recurred repeatedly (promote.py, analysis_utils, backtest.py,
# the /depth-charts season selector) — see the "Supabase pagination" section
# of CLAUDE.md. Keep this list in sync with the TypeScript equivalent in
# web/__tests__/lib/architecture.test.ts (LARGE_TABLES).
LARGE_TABLES = ["player_stats", "nfl_stats", "depth_charts", "model_projections"]


class TestSupabasePagination:
    """Reads against large tables must paginate past the 1000-row cap.

    WHY: PostgREST returns at most 1000 rows from a plain `.execute()`. A single
    recent season of `player_stats` already exceeds that, and a single model+season
    of `model_projections` can too. Silent truncation randomly drops player-season
    rows, corrupting weighted-PPG bases, team aggregates, backtests and the UI.

    FIX: Read through the paginated helper instead of a bare `.table(...).execute()`:
        from scripts.config import fetch_all_rows
        rows = fetch_all_rows(supabase, "player_stats", "player_id, ppg",
                              filters=[("eq", "season", season)])
    (or `_fetch_seasons_paginated` / `fetch_multi_season_stats` in analysis_utils.)

    A query is accepted without pagination only when it is provably bounded:
      - a write (`.upsert(`/`.insert(`/`.update(`/`.delete(`)
      - already paginated (`.range(`)
      - `.single()` / `.maybe_single()` (returns at most one row)
      - a head-only count (`count=...`)
      - `.limit(n)` with n < 1000
      - explicitly annotated with a `# pagination-safe: <reason>` comment.
    """

    _TABLE_RE = re.compile(
        r"""\.table\(\s*["'](""" + "|".join(LARGE_TABLES) + r""")["']\s*\)"""
    )
    _LIMIT_RE = re.compile(r"\.limit\(\s*(\d+)")
    _WRITES = (".upsert(", ".insert(", ".update(", ".delete(")

    @classmethod
    def _statement_is_safe(cls, stmt: str, preceding: str) -> bool:
        if any(w in stmt for w in cls._WRITES):
            return True
        if ".range(" in stmt:
            return True
        if ".single(" in stmt or ".maybe_single(" in stmt:
            return True
        if "count=" in stmt:
            return True
        if any(int(n) < 1000 for n in cls._LIMIT_RE.findall(stmt)):
            return True
        if "pagination-safe" in stmt or "pagination-safe" in preceding:
            return True
        return False

    @classmethod
    def _large_table_statements(cls, source: str):
        """Yield (lineno, table, statement_text, preceding_line) for each
        `.table("<large>")...execute()` chain in `source`."""
        lines = source.splitlines()
        n = len(lines)
        i = 0
        while i < n:
            match = cls._TABLE_RE.search(lines[i])
            if not match:
                i += 1
                continue
            # Gather the chained statement up to and including `.execute(`.
            j = i
            while ".execute(" not in lines[j] and j + 1 < n and j < i + 20:
                j += 1
            stmt = "\n".join(lines[i:j + 1])
            # Look a few lines back for a `# pagination-safe` annotation — the
            # `.table(` call is sometimes a continuation line of a chain that
            # starts (and is annotated) a line or two earlier.
            preceding = "\n".join(lines[max(0, i - 3):i])
            yield (i + 1, match.group(1), stmt, preceding)
            i = j + 1

    def test_no_unpaginated_reads_on_large_tables(self):
        violations = []
        for pyfile in _python_files(SCRIPTS_DIR):
            if "/tests/" in str(pyfile) or "\\tests\\" in str(pyfile):
                continue
            source = pyfile.read_text()
            for lineno, table, stmt, preceding in self._large_table_statements(source):
                if not self._statement_is_safe(stmt, preceding):
                    rel = pyfile.relative_to(PROJECT_ROOT)
                    first_line = stmt.splitlines()[0].strip()
                    violations.append(f"  {rel}:{lineno} ({table}): {first_line}")

        assert not violations, (
            "Unpaginated `.execute()` read against a large table found.\n"
            "These tables exceed PostgREST's 1000-row cap, so a plain `.execute()`\n"
            "silently truncates the result and corrupts downstream analysis.\n"
            "FIX: Read through `fetch_all_rows(supabase, table, select, filters=[...])`\n"
            "from scripts.config (or `_fetch_seasons_paginated` in analysis_utils).\n"
            "If the query is provably bounded (e.g. `.eq()` on a key with `.maybe_single()`,\n"
            "or an `.in_()` over a tiny id list), add a `# pagination-safe: <reason>` comment.\n"
            f"Large tables: {', '.join(LARGE_TABLES)}\n"
            "Violations:\n" + "\n".join(violations)
        )

    def test_detection_recognizes_offender_and_safe_patterns(self):
        """Guard against the scanner silently passing due to a broken regex."""
        offender = (
            'res = (\n'
            '    supabase.table("player_stats")\n'
            '    .select("player_id, ppg")\n'
            '    .eq("season", season)\n'
            '    .execute()\n'
            ')'
        )
        stmts = list(self._large_table_statements(offender))
        assert len(stmts) == 1 and stmts[0][1] == "player_stats"
        assert not self._statement_is_safe(stmts[0][2], stmts[0][3])

        safe_variants = [
            'supabase.table("player_stats").select("*").range(0, 999).execute()',
            'supabase.table("model_projections").upsert(rows).execute()',
            'supabase.table("player_stats").select("c", count="exact").execute()',
            'supabase.table("player_stats").select("*").limit(5).execute()',
            'supabase.table("player_stats").select("*").eq("id", x).maybe_single().execute()',
        ]
        for src in safe_variants:
            stmts = list(self._large_table_statements(src))
            assert len(stmts) == 1, src
            assert self._statement_is_safe(stmts[0][2], stmts[0][3]), src
