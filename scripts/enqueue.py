"""CLI to add jobs to the scraper_jobs queue."""

import argparse
import json
import uuid

from dotenv import load_dotenv

from scripts.tasks import PULL_NFL_STATS, PULL_PLAYER_STATS
from scripts.config import LEAGUE_ID as DEFAULT_LEAGUE_ID, HISTORICAL_SEASONS, get_supabase_client as get_supabase
from scripts.season import league_season

load_dotenv()


def enqueue_batch(args):
    """Enqueue the nflverse batch: pull_nfl_stats + pull_player_stats for the season.

    (Ottoneu roster/player-card scraping moved to plain-HTTP tools outside the queue:
    scripts/reconcile_roster.py and scripts/scrape_player_cards.py.)
    """
    supabase = get_supabase()
    batch_id = str(uuid.uuid4())
    season = args.season

    nfl_job = {
        "task_type": PULL_NFL_STATS,
        "params": json.dumps({"season": season}),
        "priority": 10,
        "batch_id": batch_id,
    }
    result = supabase.table("scraper_jobs").insert(nfl_job).execute()
    nfl_job_id = result.data[0]["id"]
    print(f"Enqueued pull_nfl_stats (id: {nfl_job_id[:8]}...)")

    player_stats_job = {
        "task_type": PULL_PLAYER_STATS,
        "params": json.dumps({"seasons": [season]}),
        "priority": 10,
        "batch_id": batch_id,
    }
    result = supabase.table("scraper_jobs").insert(player_stats_job).execute()
    ps_job_id = result.data[0]["id"]
    print(f"Enqueued pull_player_stats({season}) (id: {ps_job_id[:8]}...)")

    print(f"\nBatch {batch_id[:8]}... created with 2 jobs.")
    print(f"Run: python scripts/worker.py")


def enqueue_nfl_stats(args):
    """Enqueue NFL stats pull only."""
    supabase = get_supabase()
    job = {
        "task_type": PULL_NFL_STATS,
        "params": json.dumps({"season": args.season}),
        "priority": 10,
    }
    result = supabase.table("scraper_jobs").insert(job).execute()
    job_id = result.data[0]["id"]
    print(f"Enqueued pull_nfl_stats (id: {job_id[:8]}...)")


def enqueue_player_stats(args):
    """Enqueue player stats pull for specified seasons."""
    supabase = get_supabase()
    seasons = args.seasons if args.seasons else HISTORICAL_SEASONS
    job = {
        "task_type": PULL_PLAYER_STATS,
        "params": json.dumps({"seasons": seasons}),
        "priority": 10,
    }
    result = supabase.table("scraper_jobs").insert(job).execute()
    job_id = result.data[0]["id"]
    print(f"Enqueued pull_player_stats({seasons}) (id: {job_id[:8]}...)")
    print(f"Run: python scripts/worker.py")


def show_status(args):
    """Show recent job statuses."""
    supabase = get_supabase()
    limit = args.limit

    result = (
        supabase.table("scraper_jobs")
        .select("id, task_type, status, params, attempts, max_attempts, last_error, created_at, completed_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    jobs = result.data
    if not jobs:
        print("No jobs found.")
        return

    # Summary counts
    statuses = {}
    for job in jobs:
        s = job["status"]
        statuses[s] = statuses.get(s, 0) + 1

    print(f"Recent {len(jobs)} jobs: {', '.join(f'{v} {k}' for k, v in statuses.items())}\n")

    # Detail table
    print(f"{'ID':<10} {'Type':<22} {'Status':<11} {'Attempts':<10} {'Error'}")
    print("-" * 80)
    for job in jobs:
        job_id = job["id"][:8]
        task_type = job["task_type"]
        status = job["status"]
        attempts = f"{job['attempts']}/{job['max_attempts']}"
        error = (job.get("last_error") or "")[:30]
        print(f"{job_id:<10} {task_type:<22} {status:<11} {attempts:<10} {error}")


def main():
    parser = argparse.ArgumentParser(description="Enqueue scraper jobs")
    parser.add_argument(
        "--season", type=int, default=None,
        help="Season to tag enqueued jobs with (default: resolved league season)",
    )
    parser.add_argument("--league-id", type=int, default=DEFAULT_LEAGUE_ID)

    subparsers = parser.add_subparsers(dest="command", required=True)

    # batch
    subparsers.add_parser("batch", help="Enqueue the nflverse batch (NFL stats + player stats)")

    # nfl-stats
    subparsers.add_parser("nfl-stats", help="Enqueue NFL stats pull only")

    # player-stats
    player_stats_parser = subparsers.add_parser(
        "player-stats", help="Enqueue historical player stats pull"
    )
    player_stats_parser.add_argument(
        "--seasons", type=int, nargs="+",
        help=f"Seasons to pull (default: {HISTORICAL_SEASONS})",
    )

    # status
    status_parser = subparsers.add_parser("status", help="Show recent job statuses")
    status_parser.add_argument("--limit", type=int, default=20)

    args = parser.parse_args()
    if args.season is None:
        args.season = league_season()

    commands = {
        "batch": enqueue_batch,
        "nfl-stats": enqueue_nfl_stats,
        "player-stats": enqueue_player_stats,
        "status": show_status,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
