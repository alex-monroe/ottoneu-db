"""Weekly (per-game) projections ingested from a third party.

Deliberately separate from scripts/feature_projections/, which is this site's own
season-long, market-free model. Weekly projections are market-aware third-party
forecasts and must never feed the seasonal model — see
scripts/tests/test_architecture.py::TestNoWeeklyProjectionsInModel.
"""
