"""Tests for deploy/supabase/strip_fp_types.py (used by `just gen-types`)."""

import importlib.util
from pathlib import Path

import pytest

PATH = Path(__file__).resolve().parents[2] / "deploy" / "supabase" / "strip_fp_types.py"
_spec = importlib.util.spec_from_file_location("strip_fp_types", PATH)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)

GENERATED = """export type Database = {
  public: {
    Tables: {
      fp_notes: {
        Row: {
          id: string
        }
        Relationships: []
      }
      players: {
        Row: {
          id: string
        }
        Relationships: []
      }
    }
    Functions: {
      dispatch_live_worm: { Args: never; Returns: undefined }
      fp_mcp_oauth_issue: { Args: { p: string }; Returns: Json }
      fp_mcp_oauth_list: {
        Args: never
        Returns: {
          id: string
        }[]
      }
    }
  }
}
"""


def test_strips_fp_tables_and_functions_and_keeps_the_rest():
    out = mod.strip(GENERATED)
    assert "fp_" not in out
    assert "players: {" in out and "dispatch_live_worm" in out
    assert out.count("Relationships: []") == 1
    assert out.rstrip().endswith("}")


def test_main_drops_cli_status_lines(tmp_path, capsys):
    f = tmp_path / "raw.ts"
    f.write_text("Connecting to localhost 5432\n" + GENERATED)
    import sys
    argv, sys.argv = sys.argv, ["strip", str(f)]
    try:
        mod.main()
    finally:
        sys.argv = argv
    out = capsys.readouterr().out
    assert out.startswith("export type Database")


def test_main_refuses_input_without_types(tmp_path):
    f = tmp_path / "raw.ts"
    f.write_text("failed to connect\n")
    import sys
    argv, sys.argv = sys.argv, ["strip", str(f)]
    try:
        with pytest.raises(SystemExit):
            mod.main()
    finally:
        sys.argv = argv
