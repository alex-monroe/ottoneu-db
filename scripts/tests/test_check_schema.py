"""Offline tests for the schema-drift checker (scripts/check_schema.py).

All parsing/diff logic is exercised without a network call.
"""

import importlib

cs = importlib.import_module("scripts.check_schema")


# ---------------------------------------------------------------------------
# parse_openapi
# ---------------------------------------------------------------------------

def test_parse_openapi_extracts_tables_and_columns():
    spec = {
        "definitions": {
            "players": {"properties": {"id": {}, "name": {}, "position": {}}},
            "nfl_stats": {"properties": {"player_id": {}, "season": {}}},
        }
    }
    out = cs.parse_openapi(spec)
    assert out == {
        "players": {"id", "name", "position"},
        "nfl_stats": {"player_id", "season"},
    }


def test_parse_openapi_supports_openapi3_components():
    spec = {"components": {"schemas": {"players": {"properties": {"id": {}}}}}}
    assert cs.parse_openapi(spec) == {"players": {"id"}}


def test_parse_openapi_excludes_fp_tables():
    spec = {
        "definitions": {
            "players": {"properties": {"id": {}}},
            "fp_notes": {"properties": {"id": {}, "body": {}}},
            "fp_leagues": {"properties": {"id": {}}},
        }
    }
    out = cs.parse_openapi(spec)
    assert "players" in out
    assert "fp_notes" not in out and "fp_leagues" not in out


# ---------------------------------------------------------------------------
# parse_types_ts
# ---------------------------------------------------------------------------

TYPES_FIXTURE = """
export type Database = {
  public: {
    Tables: {
      players: {
        Row: {
          id: string
          name: string
          position: string | null
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
        }
        Relationships: []
      }
      nfl_stats: {
        Row: {
          player_id: string
          season: number
        }
        Insert: { player_id: string }
        Update: { player_id?: string }
        Relationships: [
          {
            foreignKeyName: "nfl_stats_player_id_fkey"
            columns: ["player_id"]
          }
        ]
      }
      fp_notes: {
        Row: {
          id: string
          body: string
        }
      }
    }
    Views: {}
    Functions: {}
  }
}
"""


def test_parse_types_ts_extracts_tables_and_row_columns():
    out = cs.parse_types_ts(TYPES_FIXTURE)
    assert out["players"] == {"id", "name", "position"}
    assert out["nfl_stats"] == {"player_id", "season"}


def test_parse_types_ts_excludes_fp_tables():
    out = cs.parse_types_ts(TYPES_FIXTURE)
    assert "fp_notes" not in out


def test_parse_types_ts_does_not_capture_views_or_relationships_as_tables():
    out = cs.parse_types_ts(TYPES_FIXTURE)
    assert set(out) == {"players", "nfl_stats"}


# ---------------------------------------------------------------------------
# parse_docs_md
# ---------------------------------------------------------------------------

DOCS_FIXTURE = """
## Tables

| Table | Purpose | Unique Constraint |
|-------|---------|-------------------|
| `users` | accounts | `email` |
| `players` | metadata | `ottoneu_id` |
| `nfl_stats` | stats | `(player_id, season)` |

**Current fantasy-pulse tables (do not modify):** `fp_notes`, `fp_leagues`.
"""


def test_parse_docs_md_extracts_table_rows_only():
    out = cs.parse_docs_md(DOCS_FIXTURE)
    assert out == {"users", "players", "nfl_stats"}


def test_parse_docs_md_excludes_fp_prose_mentions():
    out = cs.parse_docs_md(DOCS_FIXTURE)
    assert "fp_notes" not in out and "fp_leagues" not in out


# ---------------------------------------------------------------------------
# diff_schema
# ---------------------------------------------------------------------------

def test_diff_schema_clean_when_aligned():
    db = {"players": {"id", "name"}, "nfl_stats": {"player_id"}}
    types = {"players": {"id", "name"}, "nfl_stats": {"player_id"}}
    docs = {"players", "nfl_stats"}
    assert cs.diff_schema(db, types, docs) == []


def test_diff_schema_table_in_db_missing_from_types():
    db = {"players": {"id"}, "new_table": {"id"}}
    types = {"players": {"id"}}
    docs = {"players", "new_table"}
    issues = cs.diff_schema(db, types, docs)
    assert any("new_table" in i and "supabase.ts" in i for i in issues)


def test_diff_schema_table_in_types_not_in_db():
    db = {"players": {"id"}}
    types = {"players": {"id"}, "ghost": {"id"}}
    docs = {"players"}
    issues = cs.diff_schema(db, types, docs)
    assert any("ghost" in i and "not in the live DB" in i for i in issues)


def test_diff_schema_table_missing_from_docs():
    db = {"players": {"id"}, "new_table": {"id"}}
    types = {"players": {"id"}, "new_table": {"id"}}
    docs = {"players"}
    issues = cs.diff_schema(db, types, docs)
    assert any("new_table" in i and "db-schema.md" in i for i in issues)


def test_diff_schema_column_drift_both_directions():
    db = {"players": {"id", "name", "birth_date"}}
    types = {"players": {"id", "name", "stale_col"}}
    docs = {"players"}
    issues = cs.diff_schema(db, types, docs)
    # birth_date is in DB but not types; stale_col is in types but not DB
    assert any("birth_date" in i for i in issues)
    assert any("stale_col" in i for i in issues)
