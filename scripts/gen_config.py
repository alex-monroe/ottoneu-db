#!/usr/bin/env python3
"""Generate the language-specific constant declarations from config.json.

`config.json` is the single source of truth for league constants. Rather than
hand-adding each key in three places (config.json + scripts/config.py +
web/lib/config.ts) and relying on an after-the-fact sync test, this generator
emits the Python and TypeScript declarations into a clearly-marked block in each
file. Hand-written logic (e.g. `get_supabase_client()`, `isCollegePlayer()`,
simulation constants) lives outside the markers and is preserved.

Workflow: edit config.json → `just gen-config` → commit. The architecture tests
verify freshness (regenerate in-memory, diff against the checked-in block) and
fail with "run just gen-config" if stale.

Usage:
    python scripts/gen_config.py            # rewrite the generated blocks in place
    python scripts/gen_config.py --check    # exit 1 if either block is stale
"""

import json
import sys
from pathlib import Path
from typing import Dict

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_JSON = PROJECT_ROOT / "config.json"
CONFIG_PY = PROJECT_ROOT / "scripts" / "config.py"
CONFIG_TS = PROJECT_ROOT / "web" / "lib" / "config.ts"

PY_BEGIN = "# --- BEGIN GENERATED CONFIG (do not edit; run `just gen-config`) ---"
PY_END = "# --- END GENERATED CONFIG ---"
TS_BEGIN = "// --- BEGIN GENERATED CONFIG (do not edit; run `just gen-config`) ---"
TS_END = "// --- END GENERATED CONFIG ---"

# Per-key rendering overrides for keys whose runtime shape/type differs from a
# plain pass-through. Keys not listed use the default:
#   Python:  NAME = _config["NAME"]
#   TS:      export const NAME = config.NAME;
PY_OVERRIDES: Dict[str, str] = {
    # Convert to a set for O(1) membership lookups (college-player detection).
    "NFL_TEAM_CODES": 'NFL_TEAM_CODES = set(_config["NFL_TEAM_CODES"])',
}
TS_OVERRIDES: Dict[str, str] = {
    "NFL_TEAM_CODES": "export const NFL_TEAM_CODES = new Set(config.NFL_TEAM_CODES);",
    "POSITIONS": (
        'export const POSITIONS = config.POSITIONS as unknown as readonly '
        '["QB", "RB", "WR", "TE", "K"];'
    ),
    "COLLEGE_POSITIONS": "export const COLLEGE_POSITIONS: readonly string[] = config.COLLEGE_POSITIONS;",
    "REPLACEMENT_LEVEL": "export const REPLACEMENT_LEVEL: Record<string, number> = config.REPLACEMENT_LEVEL;",
}


def load_config() -> dict:
    return json.loads(CONFIG_JSON.read_text())


def render_python_section(config: dict) -> str:
    """Python declarations for every config.json key, in file order."""
    lines = [PY_BEGIN]
    for key in config:
        lines.append(PY_OVERRIDES.get(key, f'{key} = _config["{key}"]'))
    lines.append(PY_END)
    return "\n".join(lines)


def render_typescript_section(config: dict) -> str:
    """TypeScript declarations for every config.json key, in file order."""
    lines = [TS_BEGIN]
    for key in config:
        lines.append(TS_OVERRIDES.get(key, f"export const {key} = config.{key};"))
    lines.append(TS_END)
    return "\n".join(lines)


def splice(text: str, begin: str, end: str, section: str) -> str:
    """Replace the region between `begin` and `end` markers (inclusive) with `section`."""
    b = text.find(begin)
    e = text.find(end)
    if b == -1 or e == -1 or e < b:
        raise ValueError(
            f"Could not find generated-block markers ({begin!r} / {end!r}). "
            "The target file must contain both markers."
        )
    e_end = e + len(end)
    return text[:b] + section + text[e_end:]


def regenerate(write: bool) -> bool:
    """Splice fresh sections into both files. Returns True if everything is fresh.

    With write=False, reports staleness without modifying files.
    """
    config = load_config()
    fresh = True
    for path, begin, end, section in (
        (CONFIG_PY, PY_BEGIN, PY_END, render_python_section(config)),
        (CONFIG_TS, TS_BEGIN, TS_END, render_typescript_section(config)),
    ):
        current = path.read_text()
        updated = splice(current, begin, end, section)
        if updated != current:
            fresh = False
            if write:
                path.write_text(updated)
    return fresh


def main() -> None:
    check_only = "--check" in sys.argv
    fresh = regenerate(write=not check_only)
    if check_only:
        if fresh:
            print("config.py and config.ts generated blocks are up to date.")
        else:
            print("STALE: generated config blocks differ from config.json — run `just gen-config`.")
            sys.exit(1)
    else:
        print("Regenerated config.py and config.ts from config.json.")


if __name__ == "__main__":
    main()
