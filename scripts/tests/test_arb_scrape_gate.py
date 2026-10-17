"""Tests for the arbitration-scrape gate and the workflow that uses it (#765)."""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import pytest

from scripts import arb_scrape_gate as gate
from scripts.season import get_season_context

WORKFLOWS = Path(__file__).resolve().parents[2] / ".github" / "workflows"
ARB_WORKFLOW = WORKFLOWS / "scrape-arbitration-progress.yml"

CALENDAR = [{
    "league_id": 309, "season": 2026, "season_start": "2026-01-03",
    "arb_start": "2026-02-15", "arb_end": "2026-03-31",
    "keeper_deadline": "2026-07-31", "regular_season_start": "2026-09-10",
}]


@pytest.fixture(autouse=True)
def _no_overrides(monkeypatch):
    monkeypatch.delenv("SEASON_OVERRIDE", raising=False)
    monkeypatch.delenv("PHASE_OVERRIDE", raising=False)


def _due(today: date) -> bool:
    ctx = get_season_context(today=today, calendar_rows=CALENDAR, league_id=309)
    return gate.arb_scrape_due(ctx, today)[0]


@pytest.mark.parametrize("today,expected", [
    (date(2026, 1, 20), False),   # season started, arbitration not yet open
    (date(2026, 2, 14), False),
    (date(2026, 2, 15), True),    # arb_start
    (date(2026, 3, 10), True),
    (date(2026, 3, 31), True),    # arb_end (the resolver's window is exclusive here)
    (date(2026, 4, 1), True),     # final catch-up day
    (date(2026, 4, 2), False),
    (date(2026, 10, 17), False),  # the October failures in #765
])
def test_due_follows_calendar_window(today, expected):
    assert _due(today) is expected


def test_without_calendar_dates_defers_to_resolver_fallback():
    for today, expected in [(date(2026, 2, 1), True), (date(2026, 10, 17), False)]:
        ctx = get_season_context(today=today, calendar_rows=[])
        assert gate.arb_scrape_due(ctx, today)[0] is expected


def test_db_failure_falls_back_instead_of_failing(monkeypatch):
    def boom(_league_id):
        raise RuntimeError("supabase down")
    monkeypatch.setattr("scripts.season._fetch_calendar", boom)
    ctx = gate._resolve_context(date(2026, 10, 17))
    assert ctx["source"] == "fallback"


def test_main_writes_output_and_exits_zero_out_of_window(tmp_path, monkeypatch, capsys):
    out = tmp_path / "out"
    monkeypatch.setenv("GITHUB_OUTPUT", str(out))
    monkeypatch.setattr("scripts.season._fetch_calendar", lambda _id: CALENDAR)
    assert gate.main([], today=date(2026, 10, 17)) == 0
    assert out.read_text() == "due=false\n"
    assert "skipping scrape" in capsys.readouterr().out


def test_force_is_always_due(tmp_path, monkeypatch):
    out = tmp_path / "out"
    monkeypatch.setenv("GITHUB_OUTPUT", str(out))
    monkeypatch.setattr("scripts.season._fetch_calendar",
                        lambda _id: pytest.fail("--force must not read the calendar"))
    assert gate.main(["--force"], today=date(2026, 10, 17)) == 0
    assert out.read_text() == "due=true\n"


# --- workflow wiring --------------------------------------------------------

def _job_block(text: str, job: str) -> str:
    match = re.search(rf"^  {job}:\n(.*?)(?=^  \w[\w-]*:\n|\Z)", text, re.S | re.M)
    assert match, f"job {job!r} not found"
    return match.group(1)


def test_arb_workflow_gates_scrape_job_on_calendar():
    text = ARB_WORKFLOW.read_text()
    assert "python -m scripts.arb_scrape_gate" in _job_block(text, "gate")
    scrape = _job_block(text, "scrape")
    assert "needs: gate" in scrape
    assert "if: needs.gate.outputs.due == 'true'" in scrape
    # No month arithmetic left in the workflow: the calendar is the source of truth.
    assert "date +%-m" not in text


def test_local_actions_run_after_an_ungated_checkout():
    """A `uses: ./...` step needs the repo on disk; #765 was a local action
    running after a conditionally-skipped Checkout."""
    for path in WORKFLOWS.glob("*.yml"):
        for job in re.split(r"^  (?=\w[\w-]*:\n)", path.read_text(), flags=re.M)[1:]:
            if "uses: ./" not in job:
                continue
            steps = re.split(r"^\s+- ", job, flags=re.M)[1:]
            checkout = next((s for s in steps if "uses: actions/checkout" in s), None)
            assert checkout, f"{path.name}: job uses a local action without a Checkout step"
            assert "if:" not in checkout, (
                f"{path.name}: Checkout is conditional, but a local action step depends on it"
            )
