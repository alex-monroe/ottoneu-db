"""Ottoneu data scraper — backward-compatible wrapper.

Enqueues a full batch of scraper jobs, then runs the worker to completion.
This preserves the original `python scripts/ottoneu_scraper.py` interface.

For more control, use:
    python scripts/enqueue.py batch   # enqueue jobs
    python scripts/worker.py          # process jobs
"""

import asyncio
import json
import os
import sys
import uuid

from dotenv import load_dotenv
from supabase import create_client

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.tasks import PULL_NFL_STATS, SCRAPE_ROSTER
from scripts.worker import ScraperWorker

load_dotenv()

LEAGUE_ID = 309
POSITIONS = ["QB", "RB", "WR", "TE", "K"]


def enqueue_batch(season=2025):
    """Create a full batch of scraper jobs and return the batch ID."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")
        return None

    supabase = create_client(url, key)
    batch_id = str(uuid.uuid4())

    # 1. NFL stats job
    nfl_job = {
        "task_type": PULL_NFL_STATS,
        "params": json.dumps({"season": season}),
        "priority": 10,
        "batch_id": batch_id,
    }
    result = supabase.table("scraper_jobs").insert(nfl_job).execute()
    nfl_job_id = result.data[0]["id"]
    print(f"Enqueued pull_nfl_stats (id: {nfl_job_id[:8]}...)")

    # 2. Roster scrape jobs (depend on NFL stats)
    for pos in POSITIONS:
        roster_job = {
            "task_type": SCRAPE_ROSTER,
            "params": json.dumps({
                "position": pos,
                "season": season,
                "league_id": LEAGUE_ID,
            }),
            "priority": 5,
            "batch_id": batch_id,
            "depends_on": nfl_job_id,
        }
        result = supabase.table("scraper_jobs").insert(roster_job).execute()
        job_id = result.data[0]["id"]
        print(f"Enqueued scrape_roster({pos}) (id: {job_id[:8]}...)")

    print(f"\nBatch {batch_id[:8]}... created with 6 jobs.")
    return batch_id


async def scrape_ottoneu_data(target_season=2025):
    """Enqueue a full batch and run the worker to completion."""
    batch_id = enqueue_batch(target_season)
    if not batch_id:
        return

    worker = ScraperWorker()
    await worker.start(poll=False)


if __name__ == "__main__":
    asyncio.run(scrape_ottoneu_data())
