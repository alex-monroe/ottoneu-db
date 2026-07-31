"""Worker process: polls the scraper_jobs queue and dispatches the nflverse tasks.

The Ottoneu browser scraping (roster search page + player cards) was replaced by
plain-HTTP tools — `scripts/reconcile_roster.py` (roster/salary from the CSV export)
and `scripts/scrape_player_cards.py` (transactions from player cards) — so this
worker no longer launches a browser. It still runs the browser-free nflverse pulls
(`pull_nfl_stats`, `pull_player_stats`) off the queue.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time

from supabase import Client

from scripts.tasks import PULL_NFL_STATS, PULL_PLAYER_STATS, TaskResult
from scripts.tasks import pull_nfl_stats, pull_player_stats
from scripts.config import get_supabase_client



class ScraperWorker:
    """Polls the scraper_jobs table and executes tasks."""

    def __init__(self):
        self.supabase: Client = get_supabase_client()
        # Count of jobs that exhausted their retries and were marked 'failed'.
        # Used to give the process a non-zero exit so CI surfaces silent failures.
        self.failed_jobs = 0

    async def start(self, poll: bool = False, interval: int = 30):
        """Run the worker loop.

        Args:
            poll: If True, keep polling for new jobs. If False, process all pending and exit.
            interval: Seconds between poll cycles (only used when poll=True).
        """
        print("Worker starting...")

        while True:
            job = self._claim_next_job()
            if not job:
                if poll:
                    print(f"No pending jobs. Polling again in {interval}s...")
                    time.sleep(interval)
                    continue
                else:
                    print("No more pending jobs. Worker done.")
                    break

            await self._execute_job(job)

    def _claim_next_job(self) -> dict | None:
        """Find and claim the next eligible job.

        Eligible = status 'pending', attempts < max_attempts,
        dependency (if any) is completed.
        """
        # Get up to 10 pending jobs ordered by priority desc, created_at asc
        result = (
            self.supabase.table("scraper_jobs")
            .select("*")
            .eq("status", "pending")
            .order("priority", desc=True)
            .order("created_at")
            .limit(10)
            .execute()
        )

        jobs = result.data if hasattr(result, "data") else result[1]
        if not jobs:
            return None

        for job in jobs:
            if job["attempts"] >= job["max_attempts"]:
                continue

            # Check dependency
            if job["depends_on"]:
                dep = (
                    self.supabase.table("scraper_jobs")
                    .select("status")
                    .eq("id", job["depends_on"])
                    .single()
                    .execute()
                )
                dep_data = dep.data if hasattr(dep, "data") else dep[1]
                if not dep_data or dep_data["status"] != "completed":
                    continue

            # Atomic claim — only succeeds if the row is still 'pending'. If
            # another worker claimed it first the update affects zero rows and
            # we move on to the next candidate.
            claim_result = (
                self.supabase.table("scraper_jobs")
                .update({
                    "status": "running",
                    "started_at": "now()",
                    "attempts": job["attempts"] + 1,
                })
                .eq("id", job["id"])
                .eq("status", "pending")
                .execute()
            )
            claimed_rows = claim_result.data if hasattr(claim_result, "data") else claim_result[1]
            if not claimed_rows:
                continue

            job["attempts"] += 1
            job["status"] = "running"
            print(f"\nClaimed job {job['id'][:8]}... [{job['task_type']}] (attempt {job['attempts']}/{job['max_attempts']})")
            return job

        return None

    async def _execute_job(self, job: dict):
        """Dispatch a job to the appropriate task handler."""
        task_type = job["task_type"]
        params = job["params"] if isinstance(job["params"], dict) else json.loads(job["params"])

        try:
            result = await self._dispatch(task_type, params)

            if result.success:
                self.supabase.table("scraper_jobs").update({
                    "status": "completed",
                    "completed_at": "now()",
                }).eq("id", job["id"]).execute()
                print(f"Job {job['id'][:8]}... completed successfully.")

                # Enqueue child jobs
                if result.child_jobs:
                    self._enqueue_child_jobs(result.child_jobs, job)
            else:
                self._handle_failure(job, result.error)

        except Exception as e:
            self._handle_failure(job, str(e))

    async def _dispatch(self, task_type: str, params: dict) -> TaskResult:
        """Route to the correct task module."""
        if task_type == PULL_NFL_STATS:
            return pull_nfl_stats.run(params)

        elif task_type == PULL_PLAYER_STATS:
            return pull_player_stats.run(params, self.supabase)

        else:
            return TaskResult(success=False, error=f"Unknown task type: {task_type}")

    def _handle_failure(self, job: dict, error: str):
        """Mark a job as failed or set back to pending for retry."""
        print(f"Job {job['id'][:8]}... failed: {error}")

        if job["attempts"] < job["max_attempts"]:
            self.supabase.table("scraper_jobs").update({
                "status": "pending",
                "last_error": error,
            }).eq("id", job["id"]).execute()
            print(f"  Will retry (attempt {job['attempts']}/{job['max_attempts']})")
        else:
            self.supabase.table("scraper_jobs").update({
                "status": "failed",
                "last_error": error,
                "completed_at": "now()",
            }).eq("id", job["id"]).execute()
            self.failed_jobs += 1
            print(f"  Max attempts reached. Marked as failed.")

    def _enqueue_child_jobs(self, child_jobs: list[dict], parent_job: dict):
        """Insert child jobs into the queue."""
        batch_id = parent_job.get("batch_id")

        for child in child_jobs:
            if child is None:
                continue
            job_data = {
                "task_type": child["task_type"],
                "params": json.dumps(child["params"]),
                "priority": child.get("priority", -1),
                "batch_id": batch_id,
                "depends_on": parent_job["id"],
            }
            self.supabase.table("scraper_jobs").insert(job_data).execute()

        print(f"  Enqueued {len([c for c in child_jobs if c])} child jobs.")


async def main():
    parser = argparse.ArgumentParser(description="Scraper worker process")
    parser.add_argument(
        "--poll", action="store_true",
        help="Keep polling for new jobs (default: exit when queue is empty)",
    )
    parser.add_argument(
        "--interval", type=int, default=30,
        help="Seconds between poll cycles (default: 30)",
    )
    args = parser.parse_args()

    worker = ScraperWorker()
    await worker.start(poll=args.poll, interval=args.interval)

    # Exit non-zero if any job exhausted its retries, so CI (which runs the
    # worker as the final step) fails loudly instead of going green on a job
    # that never actually wrote its data.
    if worker.failed_jobs:
        print(f"{worker.failed_jobs} job(s) failed after exhausting retries.")
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
