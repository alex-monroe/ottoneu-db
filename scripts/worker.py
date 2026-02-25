"""Worker process: polls the scraper_jobs queue, dispatches tasks, manages browser lifecycle."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
import uuid

import pandas as pd
from dotenv import load_dotenv
from playwright.async_api import async_playwright
from supabase import Client

# Add project root to path so scripts.tasks imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.tasks import (
    BROWSER_TASKS,
    PULL_NFL_STATS,
    PULL_PLAYER_STATS,
    SCRAPE_PLAYER_CARD,
    SCRAPE_ROSTER,
    TaskResult,
)
from scripts.tasks import pull_nfl_stats, pull_player_stats, scrape_roster, scrape_player_card
from scripts.config import get_supabase_client

load_dotenv()


class ScraperWorker:
    """Polls the scraper_jobs table and executes tasks."""

    def __init__(self):
        self.supabase: Client = get_supabase_client()
        self.playwright = None
        self.browser = None
        self.browser_context = None
        self.nfl_stats_cache: dict[int, pd.DataFrame] = {}

    async def start(self, poll: bool = False, interval: int = 30):
        """Run the worker loop.

        Args:
            poll: If True, keep polling for new jobs. If False, process all pending and exit.
            interval: Seconds between poll cycles (only used when poll=True).
        """
        print("Worker starting...")

        try:
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

        finally:
            await self._close_browser()

    def _claim_next_job(self) -> dict | None:
        """Find and claim the next eligible job.

        Eligible = status 'pending', attempts < max_attempts,
        dependency (if any) is completed.
        """
        # Get all pending jobs ordered by priority desc, created_at asc
        result = (
            self.supabase.table("scraper_jobs")
            .select("*")
            .eq("status", "pending")
            .order("priority", desc=True)
            .order("created_at")
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

            # Claim it
            self.supabase.table("scraper_jobs").update({
                "status": "running",
                "started_at": "now()",
                "attempts": job["attempts"] + 1,
            }).eq("id", job["id"]).execute()

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
            if task_type in BROWSER_TASKS:
                await self._ensure_browser()

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
            result = pull_nfl_stats.run(params)
            if result.success and "stats" in result.data:
                season = result.data.get("season", 2025)
                self.nfl_stats_cache[season] = result.data["stats"]
            return result

        elif task_type == PULL_PLAYER_STATS:
            return pull_player_stats.run(params, self.supabase)

        elif task_type == SCRAPE_ROSTER:
            season = params.get("season", 2025)
            nfl_stats = self.nfl_stats_cache.get(season, pd.DataFrame())
            return await scrape_roster.run(
                params, self.browser_context, self.supabase, nfl_stats
            )

        elif task_type == SCRAPE_PLAYER_CARD:
            return await scrape_player_card.run(
                params, self.browser_context, self.supabase
            )

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

    async def _ensure_browser(self):
        """Lazy-initialize the Playwright browser and context."""
        if self.browser_context:
            return

        print("Launching browser...")
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=True)
        self.browser_context = await self.browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )

    async def _close_browser(self):
        """Shut down the browser if it was started."""
        if self.browser:
            print("Closing browser...")
            await self.browser.close()
            self.browser = None
            self.browser_context = None
        if self.playwright:
            await self.playwright.stop()
            self.playwright = None


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


if __name__ == "__main__":
    asyncio.run(main())
