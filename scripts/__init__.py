"""Ottoneu DB scripts package.

Marks ``scripts/`` as an importable Python package so modules can be
imported via the canonical ``scripts.<module>`` path (e.g.
``from scripts.config import get_supabase_client``) without per-file
``sys.path`` manipulation.

Import resolution is provided by:
- ``pythonpath = ["."]`` in ``[tool.pytest.ini_options]`` (test runs), and
- ``pip install -e .`` editable install (direct script execution),
  which puts the repo root on ``sys.path`` from any working directory.
"""
