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
- **Tests:** `scripts/tests/test_scheduled_alerts.py` · `scripts/tests/test_arb_scrape_gate.py`

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

**Seasonal workflows must not fail out of season.** A job whose cron fires all
year but only has work in one phase should skip cleanly, so a red run always
means something broke. `scrape-arbitration-progress.yml` is the model: a small
`gate` job runs `python -m scripts.arb_scrape_gate`, which asks the
`league_calendar` resolver (`scripts/season.py`) whether arbitration is open
(`arb_start` through `arb_end`, plus one catch-up day) and writes `due=true|false`.
The `scrape` job has `if: needs.gate.outputs.due == 'true'`, so out of season it
is *skipped* and the run concludes `success`. If the calendar read fails, the
gate falls back to the resolver's month-based phases rather than failing.
Manual dispatch passes `--force`. `scrape-fa-market.yml` has the same shape, gated on the `in_season` phase by `scripts/fa_market_gate.py`. Keep every step that uses a local action
(`uses: ./...`) in a job whose `actions/checkout` step is unconditional —
#765 was a `Revalidate site` step running after a skipped Checkout;
`test_local_actions_run_after_an_ungated_checkout` enforces it.

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

## 3. A Claude Code routine triages each new issue

An issue tells someone a job broke but not why. The **"Scheduled-failure
triage"** routine (a cloud Claude Code agent, `trig_015auF3aqhdVQkN7Hm84pDTs`,
managed at [claude.ai/code/routines](https://claude.ai/code/routines)) reads the
failed run's log and the code it points at, then:

- comments on the issue with the failing step, the error, the file and line, and
  one of three classifications: **code** bug, **transient/external** (429s,
  outages), or **environment** (expired secret or cookie, residential-IP
  requirement). The comment carries a hidden `<!-- claude-triage -->` marker, and
  the issue gets the `claude-triaged` label so later runs skip it;
- opens a fix PR (`claude/fix-scheduled-*` branch, body `Refs #<issue>`) only
  for a code bug, or for a transient failure that has repeated three or more runs
  in a row and has a clear retry fix. It never merges, closes the issue, re-runs
  workflows, or writes production data, and it has no Supabase secrets or claude.ai
  connectors attached.

**How it starts.** Routine GitHub triggers cover pull requests and releases, not
issues. So when `alert-scheduled-failure.yml` opens a *new* issue it POSTs to the
routine's `/fire` endpoint with the issue URL. That step needs the
`CLAUDE_TRIAGE_ROUTINE_TOKEN` repository secret (generate it on the routine's
page under **API trigger**). Without the secret the step is skipped, and a failed
fire only logs a warning. The routine also runs a **daily sweep at 16:00 UTC**,
after the 15:23 freshness check, which catches anything a fire missed. "Still
failing" comments do not fire it. The sweep re-triages an issue only when the
newer failure looks different.

Runs count against the owner's Claude subscription usage. Check what a run did
by opening it from the routine's page: a green run status only means the session
exited cleanly.

## Not covered

- **Degraded success.** A scrape that fetches every card and parses zero
  transactions (Ottoneu changed the HTML) still passes both mechanisms until
  inferences pile up.
- **`league_prices` freshness.** Nothing bumps `league_prices.updated_at`, so
  there is no timestamp to check; the roster pull is covered by workflow recency
  only.
- **The monitor itself.** If `check-data-freshness.yml` is disabled, nothing
  reports it.
