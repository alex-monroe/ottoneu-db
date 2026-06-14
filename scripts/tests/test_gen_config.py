"""Unit tests for the config codegen (scripts/gen_config.py)."""

import importlib

gc = importlib.import_module("scripts.gen_config")


def test_render_python_default_and_override():
    cfg = {"LEAGUE_ID": 309, "NFL_TEAM_CODES": ["KC", "SF"]}
    section = gc.render_python_section(cfg)
    assert section.startswith(gc.PY_BEGIN)
    assert section.endswith(gc.PY_END)
    assert 'LEAGUE_ID = _config["LEAGUE_ID"]' in section
    # override: set() wrap
    assert 'NFL_TEAM_CODES = set(_config["NFL_TEAM_CODES"])' in section


def test_render_typescript_default_and_overrides():
    cfg = {"LEAGUE_ID": 309, "POSITIONS": [], "NFL_TEAM_CODES": []}
    section = gc.render_typescript_section(cfg)
    assert section.startswith(gc.TS_BEGIN)
    assert section.endswith(gc.TS_END)
    assert "export const LEAGUE_ID = config.LEAGUE_ID;" in section
    assert "new Set(config.NFL_TEAM_CODES)" in section
    assert "POSITIONS as unknown as readonly" in section


def test_render_preserves_config_key_order():
    cfg = {"B": 1, "A": 2, "C": 3}
    section = gc.render_python_section(cfg)
    body = [ln for ln in section.splitlines() if "_config" in ln]
    assert body == ['B = _config["B"]', 'A = _config["A"]', 'C = _config["C"]']


def test_splice_replaces_only_the_marked_region():
    text = (
        "header\n"
        "// --- BEGIN GENERATED CONFIG (do not edit; run `just gen-config`) ---\n"
        "old\n"
        "// --- END GENERATED CONFIG ---\n"
        "footer\n"
    )
    new = gc.render_typescript_section({"X": 1})
    out = gc.splice(text, gc.TS_BEGIN, gc.TS_END, new)
    assert out.startswith("header\n")
    assert out.endswith("footer\n")
    assert "old" not in out
    assert "export const X = config.X;" in out


def test_splice_missing_markers_raises():
    import pytest

    with pytest.raises(ValueError):
        gc.splice("no markers here", gc.TS_BEGIN, gc.TS_END, "x")


def test_repo_blocks_are_fresh():
    """The committed config.py / config.ts blocks must match the generator."""
    assert gc.regenerate(write=False), "run `just gen-config`"
