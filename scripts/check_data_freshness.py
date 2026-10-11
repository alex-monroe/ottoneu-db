"""Fail when scheduled data has gone stale — independently of the jobs that load it.

A red workflow run only helps if someone sees it, and a job that never starts (a
disabled workflow, a schedule GitHub skipped) or that exits 0 having done nothing
is not red at all. The player-card scrape failed for eight straight days in
October 2026 before anyone noticed; this check looks at the *result* instead of
the job, so any of those failure shapes ends the same way: a nonzero exit, which
``alert-scheduled-failure.yml`` turns into a GitHub issue.

Two checks:

* **Pending inferences** (database). ``reconcile_roster`` files an inferred
  transaction for every move it notices, and the card scrape replaces it with the
  real row within a day. A pile of inferences older than a few days means the card
  scrape is not doing its job, whatever its exit code says.
* **Workflow recency** (GitHub API; only when ``GITHUB_TOKEN`` and
  ``GITHUB_REPOSITORY`` are set, i.e. in CI). Each always-on scheduled workflow
  must have *succeeded* within its limit.

Usage::

    python -m scripts.check_data_freshness        # exit 1 if anything is stale
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

from scripts.config import LEAGUE_ID, get_supabase_client
from scripts.transaction_dedupe import SUPERSEDE_WINDOW_DAYS, fetch_transactions, is_inferred

# An inference this old should already have been superseded by its card row: the
# card scrape runs daily, so three days is two missed runs plus slack.
PENDING_GRACE_DAYS = 3
# Some inferences are legitimately permanent (a cut the card never shows), so a few
# old ones are normal. The October 2026 outage had 7 by day three and 23 by day
# eight; the healthy log before it had none.
MAX_PENDING_INFERENCES = 5

# Workflow file → maximum days since its last SUCCESSFUL run. Only workflows whose
# cron fires all year belong here; a seasonal cron (pull-player-stats,
# offseason-data-refresh) is legitimately idle for months.
# scripts/tests/test_scheduled_alerts.py checks every file exists and is scheduled.
WORKFLOW_MAX_AGE_DAYS = {
    "pull-roster-csv.yml": 2,
    "scrape-player-cards.yml": 2,
    "pull-matchups.yml": 2,
    "pull-weekly-projections.yml": 2,
    "scrape-arbitration-progress.yml": 2,
    "scrape-league-calendar.yml": 9,
    "scrape-draft-sharks.yml": 9,
}

_GITHUB_API = "https://api.github.com"


def pending_inferences(rows: list[dict], today: date,
                       grace_days: int = PENDING_GRACE_DAYS) -> list[dict]:
    """Inferred rows old enough that the card scrape should have replaced them."""
    cutoff = (today - timedelta(days=grace_days)).isoformat()
    return [r for r in rows
            if is_inferred(r) and (r.get("transaction_date") or "9999") <= cutoff]


def check_pending_inferences(rows: list[dict], today: date,
                             max_pending: int = MAX_PENDING_INFERENCES) -> str | None:
    """A problem description, or None if the transaction log is keeping up."""
    pending = pending_inferences(rows, today)
    if len(pending) <= max_pending:
        return None
    oldest = min(r["transaction_date"] for r in pending)
    return (f"{len(pending)} inferred transactions are more than {PENDING_GRACE_DAYS} days old "
            f"and still not superseded by a card row (oldest {oldest}; up to {max_pending} is "
            "normal). The player-card scrape is not landing real history — check the "
            "'Scrape Player Cards' workflow, then run `just scrape-player-cards --apply`.")


def stale_workflows(last_success: dict[str, datetime | None], now: datetime,
                    limits: dict[str, int] | None = None) -> list[str]:
    """One problem description per workflow whose last success is too old."""
    problems = []
    for workflow, max_days in (limits or WORKFLOW_MAX_AGE_DAYS).items():
        when = last_success.get(workflow)
        if when is None:
            problems.append(f"{workflow}: no successful run found (limit {max_days}d).")
        elif now - when > timedelta(days=max_days):
            age = (now - when).days
            problems.append(f"{workflow}: last succeeded {age}d ago on {when:%Y-%m-%d} "
                            f"(limit {max_days}d) — failing, disabled, or not being scheduled.")
    return problems


def fetch_last_success(repo: str, token: str, workflows: list[str]) -> dict[str, datetime | None]:
    """Most recent successful run of each workflow file, via the GitHub API."""
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    out: dict[str, datetime | None] = {}
    for workflow in workflows:
        resp = requests.get(
            f"{_GITHUB_API}/repos/{repo}/actions/workflows/{workflow}/runs",
            headers=headers, params={"status": "success", "per_page": 1}, timeout=30)
        resp.raise_for_status()
        runs = resp.json().get("workflow_runs") or []
        out[workflow] = (datetime.fromisoformat(runs[0]["created_at"].replace("Z", "+00:00"))
                         if runs else None)
    return out


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Fail if scheduled data has gone stale.")
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    args = parser.parse_args(argv)

    today = date.today()
    problems: list[str] = []

    since = (today - timedelta(days=SUPERSEDE_WINDOW_DAYS)).isoformat()
    rows = fetch_transactions(get_supabase_client(), args.league_id, since=since)
    problem = check_pending_inferences(rows, today)
    print(f"pending inferences: {len(pending_inferences(rows, today))} "
          f"(limit {MAX_PENDING_INFERENCES})")
    if problem:
        problems.append(problem)

    repo, token = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_TOKEN")
    if repo and token:
        last = fetch_last_success(repo, token, list(WORKFLOW_MAX_AGE_DAYS))
        for workflow, when in last.items():
            print(f"last success {workflow}: {when:%Y-%m-%d %H:%M}Z" if when
                  else f"last success {workflow}: never")
        problems.extend(stale_workflows(last, datetime.now(timezone.utc)))
    else:
        print("workflow recency: skipped (GITHUB_TOKEN / GITHUB_REPOSITORY not set)")

    if not problems:
        print("\nAll freshness checks passed.")
        return 0
    print(f"\n{len(problems)} freshness problem(s):", file=sys.stderr)
    for p in problems:
        print(f"  - {p}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
