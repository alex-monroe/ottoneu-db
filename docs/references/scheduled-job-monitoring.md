# Scheduled Job Monitoring

Production data arrives through scheduled GitHub Actions workflows. A failed run
turns red in the Actions tab and nothing else happens, and nobody watches the
Actions tab: the player-card scrape failed on eight consecutive days (2026-10-02
to 10-09, see [Rate limiting](roster-csv-reconciliation.md#rate-limiting-the-card-scrape-http-429))
before it was noticed. Two mechanisms now push a problem in front of a person.

- **Alerting:** [.github/workflows/alert-scheduled-failure.yml](../../.github/workflows/alert-scheduled-failure.yml)
- **Freshness:** [scripts/check_data_freshness.py](../../scripts/check_data_freshness.py) ·
  `just check-freshness` ·
  [.github/workflows/check-data-freshness.yml](../../.github/workflows/check-data-freshness.yml)
- **Tests:** `scripts/tests/test_scheduled_alerts.py`

## 1. A failed scheduled run opens an issue

`alert-scheduled-failure.yml` is triggered by `workflow_run` when any listed
workflow completes.

| Scheduled run ends in | What happens |
|---|---|
| `failure`, `timed_out`, `startup_failure` | Opens the issue **"Scheduled workflow failing: \<name\>"** (label `scheduled-failure`) with the run link. If it is already open, adds a "still failing" comment — at most one per 24h, so the half-hourly matchup pull cannot flood it. |
| `success` | Closes that workflow's open issue with a "Recovered" comment. |
| `cancelled`, `skipped` | Ignored — neither a failure nor proof of recovery. |

Manually dispatched runs are ignored in both directions: whoever started one is
watching it, and a manual success does not prove the schedule works.

GitHub notifies repository watchers of new issues, which is the actual alert. The
league's Discord channel is deliberately not used — it is for league members, not
operations noise.

**Adding a scheduled workflow:** add its `name:` to `on.workflow_run.workflows`.
`workflow_run` matches by name, and a workflow missing from the list fails
silently — which is the bug this exists to prevent — so
`test_every_scheduled_workflow_is_alerted_on` fails `just test-python` until the
list is complete, and also when it names a workflow that no longer exists.

Limits worth knowing: `workflow_run` only fires for the copy of the alert workflow
on `main`, and it cannot see a run that never started.

## 2. A daily freshness check that ignores the jobs and looks at the result

A failure alert misses three shapes of outage: a workflow that was disabled
(GitHub disables schedules after 60 days without repository activity), a schedule
GitHub skipped, and a run that exits 0 having done nothing. `just check-freshness`
checks outcomes instead, and exits 1 if either check fails — which, running under
`check-data-freshness.yml` (daily 15:23 UTC), makes mechanism 1 open an issue.

**Pending inferences (database).** `reconcile_roster` files an *inferred*
transaction for every move, and the card scrape replaces it with the real row
within a day. The check counts inferred rows more than `PENDING_GRACE_DAYS` (3)
old inside the 14-day supersede window and fails above `MAX_PENDING_INFERENCES`
(5). A few are legitimately permanent (a cut the card never shows), hence the
allowance; the healthy log before the October outage had none, the outage had 7 by
day three.

**Workflow recency (GitHub API, CI only).** Each workflow in
`WORKFLOW_MAX_AGE_DAYS` must have a *successful* run within its limit (2 days for
daily jobs, 9 for weekly). Only workflows whose cron fires all year are listed;
`pull-player-stats` and `offseason-data-refresh` are seasonal and legitimately
idle for months. Locally the check is skipped unless `GITHUB_TOKEN` and
`GITHUB_REPOSITORY` are set.

## Not covered

- **Degraded success.** A scrape that fetches every card and parses zero
  transactions (Ottoneu changed the HTML) still passes both mechanisms until
  inferences pile up.
- **`league_prices` freshness.** Nothing bumps `league_prices.updated_at`, so
  there is no timestamp to check; the roster pull is covered by workflow recency
  only.
- **The monitor itself.** If `check-data-freshness.yml` is disabled, nothing
  reports it.
