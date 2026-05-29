"""Pytest configuration for the scripts test suite.

Import resolution (``import scripts.*``) is handled by ``pythonpath = ["."]``
in ``[tool.pytest.ini_options]`` (pyproject.toml), which places the repo root
on ``sys.path`` during collection. No manual ``sys.path`` manipulation is
needed here. This module intentionally contains no path hacks.
"""
