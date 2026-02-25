"""
Structural test: validate that scripts/config.py and web/lib/config.ts stay in sync.

This test mechanically enforces that shared constants have the same values in both
the Python backend and TypeScript frontend. If this test fails, update the file
indicated in the error message to match the other.
"""

import ast
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent  # project root
PY_CONFIG = ROOT / "scripts" / "config.py"
TS_CONFIG = ROOT / "web" / "lib" / "config.ts"


def _parse_python_constants() -> dict:
    """Extract top-level constant assignments from config.py using AST."""
    source = PY_CONFIG.read_text()
    tree = ast.parse(source)
    constants = {}
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name):
                try:
                    constants[target.id] = ast.literal_eval(node.value)
                except (ValueError, TypeError):
                    pass  # skip non-literal assignments (e.g., function calls)
    return constants


def _parse_ts_constants() -> dict:
    """Extract exported constant values from config.ts using regex."""
    source = TS_CONFIG.read_text()
    constants = {}

    # Match: export const NAME = <value>;
    # Handles numbers, strings, and arrays
    for match in re.finditer(
        r'export\s+const\s+(\w+)(?:\s*:\s*[^=]+)?\s*=\s*(.+?);', source
    ):
        name, raw_value = match.group(1), match.group(2).strip()

        # Numbers
        if re.fullmatch(r'-?\d+(?:\.\d+)?', raw_value):
            val = int(raw_value) if '.' not in raw_value else float(raw_value)
            constants[name] = val
        # Strings (single or double quoted)
        elif re.fullmatch(r'["\'](.+?)["\']', raw_value):
            constants[name] = re.fullmatch(r'["\'](.+?)["\']', raw_value).group(1)
        # Arrays of numbers
        elif raw_value.startswith('[') and raw_value.endswith(']'):
            inner = raw_value[1:-1]
            try:
                constants[name] = [int(x.strip()) for x in inner.split(',') if x.strip()]
            except ValueError:
                pass

    # Match: export const NAME: Record<...> = { key: value, ... };
    for match in re.finditer(
        r'export\s+const\s+(\w+)\s*:\s*Record<[^>]+>\s*=\s*\{([^}]+)\}',
        source,
        re.DOTALL,
    ):
        name = match.group(1)
        body = match.group(2)
        d = {}
        for kv in re.finditer(r'(\w+)\s*:\s*(-?\d+(?:\.\d+)?)', body):
            k, v = kv.group(1), kv.group(2)
            d[k] = int(v) if '.' not in v else float(v)
        if d:
            constants[name] = d

    return constants


# Shared constants that MUST match between Python and TypeScript.
# Maps (python_name, ts_name) for each constant.
SYNCED_CONSTANTS = [
    ("LEAGUE_ID", "LEAGUE_ID"),
    ("SEASON", "SEASON"),
    ("MY_TEAM", "MY_TEAM"),
    ("HISTORICAL_SEASONS", "HISTORICAL_SEASONS"),
    ("NUM_TEAMS", "NUM_TEAMS"),
    ("CAP_PER_TEAM", "CAP_PER_TEAM"),
    ("MIN_GAMES", "MIN_GAMES"),
    ("REPLACEMENT_LEVEL", "REPLACEMENT_LEVEL"),
    ("SALARY_REPLACEMENT_PERCENTILE", "SALARY_REPLACEMENT_PERCENTILE"),
    ("MIN_SALARY_PLAYERS", "MIN_SALARY_PLAYERS"),
    ("ARB_BUDGET_PER_TEAM", "ARB_BUDGET_PER_TEAM"),
    ("ARB_MIN_PER_TEAM", "ARB_MIN_PER_TEAM"),
    ("ARB_MAX_PER_TEAM", "ARB_MAX_PER_TEAM"),
    ("ARB_MAX_PER_PLAYER_PER_TEAM", "ARB_MAX_PER_PLAYER_PER_TEAM"),
    ("ARB_MAX_PER_PLAYER_LEAGUE", "ARB_MAX_PER_PLAYER_LEAGUE"),
]


@pytest.fixture(scope="module")
def py_constants():
    return _parse_python_constants()


@pytest.fixture(scope="module")
def ts_constants():
    return _parse_ts_constants()


@pytest.mark.parametrize("py_name,ts_name", SYNCED_CONSTANTS)
def test_config_value_matches(py_constants, ts_constants, py_name, ts_name):
    """Each shared constant must have the same value in config.py and config.ts."""
    assert py_name in py_constants, (
        f"{py_name} not found in {PY_CONFIG.relative_to(ROOT)}. "
        f"Add it to config.py or remove it from the sync list in test_config_sync.py."
    )
    assert ts_name in ts_constants, (
        f"{ts_name} not found in {TS_CONFIG.relative_to(ROOT)}. "
        f"Add it to config.ts or remove it from the sync list in test_config_sync.py."
    )

    py_val = py_constants[py_name]
    ts_val = ts_constants[ts_name]

    assert py_val == ts_val, (
        f"Config mismatch: {py_name} = {py_val!r} in scripts/config.py "
        f"but {ts_name} = {ts_val!r} in web/lib/config.ts. "
        f"Update one file to match the other."
    )
