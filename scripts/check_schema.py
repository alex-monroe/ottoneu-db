#!/usr/bin/env python3
"""On-demand DB schema drift check — `just check-schema`.

The post-migration workflow has three manual steps (apply migration →
hand-edit `web/types/supabase.ts` → update `docs/generated/db-schema.md`), and
skipping step 2 surfaces later as a confusing TypeScript error. This check
introspects the live database read-only and diffs it against the committed
types and docs, reporting each drift with the migration step that was skipped.

It is deliberately **on-demand only** (no cron): schema only changes when we
change it, so a scheduled run would spend API budget checking a constant. Run
it as the final step of the migration workflow (see CLAUDE.md).

Introspection uses the PostgREST OpenAPI spec served at `{SUPABASE_URL}/rest/v1/`
— a single cheap read-only GET that lists every exposed table and its columns,
so no `information_schema` access or RPC is needed.

`fp_*` tables belong to the shared fantasy-pulse app and are ignored in every
direction (DB, types, docs).

Usage:
    venv/bin/python scripts/check_schema.py     # or: just check-schema

Exit code: 0 when types + docs match the live DB, 1 on any drift (or fetch error).
"""

import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Set

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TYPES_PATH = PROJECT_ROOT / "web" / "types" / "supabase.ts"
DOCS_PATH = PROJECT_ROOT / "docs" / "generated" / "db-schema.md"

FP_PREFIX = "fp_"

# ANSI colors
RED = "\033[91m"
GREEN = "\033[92m"
BOLD = "\033[1m"
RESET = "\033[0m"


def _is_fp(name: str) -> bool:
    return name.startswith(FP_PREFIX)


# ---------------------------------------------------------------------------
# Pure parsers (offline, unit-tested) — no network.
# ---------------------------------------------------------------------------

def parse_openapi(spec: dict) -> Dict[str, Set[str]]:
    """{table -> column names} from a PostgREST OpenAPI/Swagger spec."""
    defs = spec.get("definitions")
    if defs is None:
        defs = spec.get("components", {}).get("schemas", {})
    out: Dict[str, Set[str]] = {}
    for name, body in (defs or {}).items():
        if _is_fp(name):
            continue
        props = (body or {}).get("properties", {}) or {}
        out[name] = set(props.keys())
    return out


def _match_brace(text: str, open_idx: int) -> int:
    """Index of the `}` matching the `{` at open_idx, or -1."""
    depth = 0
    for i in range(open_idx, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    return -1


def _extract_row_columns(table_body: str) -> Set[str]:
    """Column names from the `Row: { ... }` block of a table definition."""
    ridx = table_body.find("Row:")
    if ridx == -1:
        return set()
    open_idx = table_body.find("{", ridx)
    if open_idx == -1:
        return set()
    close_idx = _match_brace(table_body, open_idx)
    row = table_body[open_idx + 1 : close_idx]
    cols: Set[str] = set()
    for line in row.splitlines():
        m = re.match(r"\s*([A-Za-z_]\w*)\??\s*:", line)
        if m:
            cols.add(m.group(1))
    return cols


def parse_types_ts(text: str) -> Dict[str, Set[str]]:
    """{table -> Row column names} from web/types/supabase.ts `public.Tables`."""
    pub = text.find("public:")
    if pub == -1:
        return {}
    tables_kw = text.find("Tables:", pub)
    if tables_kw == -1:
        return {}
    open_idx = text.find("{", tables_kw)
    close_idx = _match_brace(text, open_idx)
    body = text[open_idx + 1 : close_idx]

    out: Dict[str, Set[str]] = {}
    depth = 0
    j = 0
    n = len(body)
    while j < n:
        c = body[j]
        if c == "{":
            depth += 1
            j += 1
            continue
        if c == "}":
            depth -= 1
            j += 1
            continue
        if depth == 0:
            m = re.match(r"([A-Za-z_]\w*):\s*\{", body[j:])
            if m:
                name = m.group(1)
                tbl_open = body.find("{", j)
                tbl_close = _match_brace(body, tbl_open)
                tbl_body = body[tbl_open + 1 : tbl_close]
                if not _is_fp(name):
                    out[name] = _extract_row_columns(tbl_body)
                j = tbl_close + 1
                continue
        j += 1
    return out


def parse_docs_md(text: str) -> Set[str]:
    """Table names from the `| \\`name\\` | ... |` rows of db-schema.md."""
    names: Set[str] = set()
    for m in re.finditer(r"^\|\s*`([a-z_][a-z0-9_]*)`\s*\|", text, re.M):
        name = m.group(1)
        if not _is_fp(name):
            names.add(name)
    return names


# ---------------------------------------------------------------------------
# Diff
# ---------------------------------------------------------------------------

def diff_schema(
    db: Dict[str, Set[str]],
    types: Dict[str, Set[str]],
    docs: Set[str],
) -> List[str]:
    """Return a list of drift messages (each with an actionable fix). Empty = clean."""
    issues: List[str] = []
    db_tables = set(db)
    type_tables = set(types)

    for t in sorted(db_tables - type_tables):
        issues.append(
            f"Table `{t}` exists in the DB but is missing from web/types/supabase.ts.\n"
            f"  FIX (migration step 2): hand-add its Row/Insert/Update block to "
            f"web/types/supabase.ts (or regenerate types), else `tsc` fails when "
            f"querying it."
        )
    for t in sorted(type_tables - db_tables):
        issues.append(
            f"Table `{t}` is in web/types/supabase.ts but not in the live DB.\n"
            f"  FIX: the type is stale — remove it, or apply the migration that "
            f"creates the table."
        )
    for t in sorted(db_tables - docs):
        issues.append(
            f"Table `{t}` exists in the DB but is missing from docs/generated/db-schema.md.\n"
            f"  FIX (migration step 3): add a row to the table list and increment "
            f"the table count."
        )

    # Column-level drift on tables present in both DB and types.
    for t in sorted(db_tables & type_tables):
        db_cols, ts_cols = db[t], types[t]
        missing = db_cols - ts_cols
        extra = ts_cols - db_cols
        if missing:
            issues.append(
                f"Table `{t}`: column(s) {sorted(missing)} exist in the DB but are "
                f"missing from its Row type in web/types/supabase.ts.\n"
                f"  FIX (migration step 2): add the column(s) to the Row/Insert/Update blocks."
            )
        if extra:
            issues.append(
                f"Table `{t}`: column(s) {sorted(extra)} are in the Row type but not "
                f"in the live DB.\n"
                f"  FIX: stale type — remove the column(s) or apply the migration that adds them."
            )
    return issues


# ---------------------------------------------------------------------------
# Network + entrypoint
# ---------------------------------------------------------------------------

def fetch_db_schema(url: str = None, key: str = None) -> Dict[str, Set[str]]:
    """Introspect the live DB via the PostgREST OpenAPI spec (read-only GET)."""
    if url is None or key is None:
        from dotenv import load_dotenv

        load_dotenv(PROJECT_ROOT / ".env")
    url = url or os.getenv("SUPABASE_URL")
    key = key or os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise SystemExit(
            "Error: SUPABASE_URL and SUPABASE_KEY must be set in .env "
            "(see docs/references/environment-variables.md)."
        )
    resp = requests.get(
        f"{url.rstrip('/')}/rest/v1/",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=20,
    )
    resp.raise_for_status()
    return parse_openapi(resp.json())


def main() -> None:
    print(f"{BOLD}check-schema{RESET} — DB vs web/types/supabase.ts + docs/generated/db-schema.md\n")
    try:
        db = fetch_db_schema()
    except Exception as exc:  # pragma: no cover - network failure path
        print(f"{RED}Failed to introspect the live DB:{RESET} {exc!r}")
        sys.exit(1)

    types = parse_types_ts(TYPES_PATH.read_text())
    docs = parse_docs_md(DOCS_PATH.read_text())

    issues = diff_schema(db, types, docs)

    print(f"Live DB: {len(db)} tables · types: {len(types)} · docs: {len(docs)} "
          f"(fp_* excluded)\n")
    if not issues:
        print(f"{GREEN}No schema drift — types and docs match the live DB.{RESET}")
        return
    for issue in issues:
        print(f"{RED}[DRIFT]{RESET} {issue}\n")
    print(f"{RED}{len(issues)} schema drift issue(s) found.{RESET}")
    sys.exit(1)


if __name__ == "__main__":
    main()
