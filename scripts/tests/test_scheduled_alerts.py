"""Tests for scheduled-job monitoring: the freshness check and the alert wiring."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from scripts import check_data_freshness as cdf
from scripts.transaction_dedupe import INFERRED_MARKER

WORKFLOWS = Path(__file__).resolve().parents[2] / ".github" / "workflows"
ALERT_WORKFLOW = "alert-scheduled-failure.yml"
TODAY = date(2026, 10, 10)


def _inferred(day: str) -> dict:
    return {"transaction_date": day, "raw_description": f"cut | {INFERRED_MARKER} {day}"}


def _card(day: str) -> dict:
    return {"transaction_date": day, "raw_description": "Oct 2, 2026 9:26 PM | Team | add | $3"}


# --- pending inferences ---------------------------------------------------

def test_pending_counts_only_old_inferred_rows():
    rows = [_inferred("2026-10-02"), _inferred("2026-10-07"),  # exactly at the grace cutoff
            _inferred("2026-10-08"), _inferred("2026-10-10"),  # too recent to judge
            _card("2026-10-01")]                               # real history, never pending
    assert [r["transaction_date"] for r in cdf.pending_inferences(rows, TODAY)] == [
        "2026-10-02", "2026-10-07"]


def test_a_few_permanent_inferences_are_tolerated():
    rows = [_inferred("2026-10-01")] * cdf.MAX_PENDING_INFERENCES
    assert cdf.check_pending_inferences(rows, TODAY) is None


def test_a_backlog_is_reported_with_the_oldest_date():
    # The October 2026 outage on day three: 7 inferences filed on the first day.
    rows = [_inferred("2026-10-02")] * 7 + [_inferred("2026-10-05")] + [_inferred("2026-10-09")] * 4
    problem = cdf.check_pending_inferences(rows, date(2026, 10, 5))
    assert problem and problem.startswith("7 inferred") and "oldest 2026-10-02" in problem


# --- workflow recency ------------------------------------------------------

def test_stale_workflows_flags_old_and_never_run():
    now = datetime(2026, 10, 10, 15, tzinfo=timezone.utc)
    last = {"fresh.yml": now - timedelta(hours=30),
            "stale.yml": now - timedelta(days=9),
            "never.yml": None}
    problems = cdf.stale_workflows(last, now, {"fresh.yml": 2, "stale.yml": 2, "never.yml": 2})
    assert len(problems) == 2
    assert problems[0].startswith("stale.yml: last succeeded 9d ago on 2026-10-01")
    assert problems[1].startswith("never.yml: no successful run")


def test_fetch_last_success_parses_the_api(monkeypatch):
    class Resp:
        def __init__(self, runs):
            self._runs = runs

        def raise_for_status(self):
            pass

        def json(self):
            return {"workflow_runs": self._runs}

    def fake_get(url, headers=None, params=None, timeout=None):
        assert params == {"status": "success", "per_page": 1}
        assert headers["Authorization"] == "Bearer t"
        return Resp([] if "b.yml" in url else [{"created_at": "2026-10-01T13:49:35Z"}])

    monkeypatch.setattr(cdf.requests, "get", fake_get)
    out = cdf.fetch_last_success("o/r", "t", ["a.yml", "b.yml"])
    assert out == {"a.yml": datetime(2026, 10, 1, 13, 49, 35, tzinfo=timezone.utc), "b.yml": None}


# --- wiring: the lists cannot drift from the workflows they describe ------------

def _scheduled() -> dict[str, str]:
    """Workflow file → its ``name:``, for every workflow with a schedule trigger."""
    out = {}
    for path in sorted(WORKFLOWS.glob("*.yml")):
        text = path.read_text()
        if re.search(r"^  schedule:", text, re.M):
            out[path.name] = re.search(r"^name: (.+)$", text, re.M).group(1).strip().strip('"')
    return out


def test_every_scheduled_workflow_is_alerted_on():
    alert = (WORKFLOWS / ALERT_WORKFLOW).read_text()
    watched = set(re.findall(r'^      - "(.+)"$', alert, re.M))
    missing = set(_scheduled().values()) - watched
    assert not missing, (
        f"Scheduled workflow(s) {sorted(missing)} are not listed under "
        f"on.workflow_run.workflows in .github/workflows/{ALERT_WORKFLOW}, so their "
        "failures would go unnoticed. Add the workflow's `name:` there."
    )
    unknown = watched - set(_scheduled().values())
    assert not unknown, (
        f"{ALERT_WORKFLOW} watches {sorted(unknown)}, which match no scheduled workflow's "
        "`name:` (renamed or removed?). workflow_run matches by name — fix the list."
    )


def test_recency_limits_name_real_scheduled_workflows():
    unknown = set(cdf.WORKFLOW_MAX_AGE_DAYS) - set(_scheduled())
    assert not unknown, (
        f"WORKFLOW_MAX_AGE_DAYS in scripts/check_data_freshness.py names {sorted(unknown)}, "
        "which are not scheduled workflow files in .github/workflows/."
    )
