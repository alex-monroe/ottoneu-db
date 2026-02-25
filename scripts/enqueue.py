"""CLI to add jobs to the scraper_jobs queue."""

import argparse
import json
import os
import sys
import uuid

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.tasks import PULL_NFL_STATS, PULL_PLAYER_STATS, SCRAPE_ROSTER, SCRAPE_PLAYER_CARD
from scripts.config import (
    POSITIONS, COLLEGE_POSITIONS, SEASON as DEFAULT_SEASON,
    LEAGUE_ID as DEFAULT_LEAGUE_ID, HISTORICAL_SEASONS,
    get_supabase_client as get_supabase,
)

load_dotenv()


def enqueue_batch(args):
    """Enqueue the full pipeline: 1 pull_nfl_stats + 5 scrape_roster with dependency chain."""
    supabase = get_supabase()
    batch_id = str(uuid.uuid4())
    season = args.season
    league_id = args.league_id

    # 1. NFL stats job (no dependency)
    nfl_job = {
        "task_type": PULL_NFL_STATS,
        "params": json.dumps({"season": season}),
        "priority": 10,
        "batch_id": batch_id,
    }
    result = supabase.table("scraper_jobs").insert(nfl_job).execute()
    nfl_job_id = result.data[0]["id"]
    print(f"Enqueued pull_nfl_stats (id: {nfl_job_id[:8]}...)")

    # 2. Player stats job for current season (independent, runs in parallel with NFL stats)
    player_stats_job = {
        "task_type": PULL_PLAYER_STATS,
        "params": json.dumps({"seasons": [season]}),
        "priority": 10,
        "batch_id": batch_id,
    }
    result = supabase.table("scraper_jobs").insert(player_stats_job).execute()
    ps_job_id = result.data[0]["id"]
    print(f"Enqueued pull_player_stats({season}) (id: {ps_job_id[:8]}...)")

    # 3. Roster scrape jobs (depend on NFL stats)
    for pos in POSITIONS:
        roster_job = {
            "task_type": SCRAPE_ROSTER,
            "params": json.dumps({
                "position": pos,
                "season": season,
                "league_id": league_id,
            }),
            "priority": 5,
            "batch_id": batch_id,
            "depends_on": nfl_job_id,
        }
        result = supabase.table("scraper_jobs").insert(roster_job).execute()
        job_id = result.data[0]["id"]
        print(f"Enqueued scrape_roster({pos}) (id: {job_id[:8]}...)")

    # 4. College roster scrape jobs (depend on NFL stats, lower priority)
    for pos in COLLEGE_POSITIONS:
        college_job = {
            "task_type": SCRAPE_ROSTER,
            "params": json.dumps({
                "position": pos,
                "season": season,
                "league_id": league_id,
                "level": "college",
            }),
            "priority": 3,
            "batch_id": batch_id,
            "depends_on": nfl_job_id,
        }
        result = supabase.table("scraper_jobs").insert(college_job).execute()
        job_id = result.data[0]["id"]
        print(f"Enqueued scrape_roster({pos}, college) (id: {job_id[:8]}...)")

    total_jobs = 2 + len(POSITIONS) + len(COLLEGE_POSITIONS)
    print(f"\nBatch {batch_id[:8]}... created with {total_jobs} jobs.")
    print("Run: python scripts/worker.py")


def enqueue_roster(args):
    """Enqueue a single position scrape."""
    supabase = get_supabase()
    level = getattr(args, "level", "pro")
    job = {
        "task_type": SCRAPE_ROSTER,
        "params": json.dumps({
            "position": args.position,
            "season": args.season,
            "league_id": args.league_id,
            "level": level,
        }),
        "priority": 5,
    }
    result = supabase.table("scraper_jobs").insert(job).execute()
    job_id = result.data[0]["id"]
    level_label = "college" if level == "college" else "NFL"
    print(f"Enqueued scrape_roster({args.position}, {level_label}) (id: {job_id[:8]}...)")
    print("Note: NFL stats won't be available unless pull_nfl_stats ran first.")


def enqueue_player(args):
    """Enqueue a single player card scrape."""
    supabase = get_supabase()
    job = {
        "task_type": SCRAPE_PLAYER_CARD,
        "params": json.dumps({
            "ottoneu_id": args.ottoneu_id,
            "player_name": args.name,
            "player_uuid": args.player_uuid,
            "href": f"/football/{args.league_id}/player_card/nfl/{args.ottoneu_id}",
            "season": args.season,
            "league_id": args.league_id,
        }),
        "priority": 0,
    }
    result = supabase.table("scraper_jobs").insert(job).execute()
    job_id = result.data[0]["id"]
    print(f"Enqueued scrape_player_card({args.name}) (id: {job_id[:8]}...)")


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
    print("Run: python scripts/worker.py")


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
        params = job["params"] if isinstance(job["params"], dict) else json.loads(job["params"])
        # Add position suffix for roster jobs
        if task_type == SCRAPE_ROSTER and "position" in params:
            level_suffix = ",col" if params.get("level") == "college" else ""
            task_type += f"({params['position']}{level_suffix})"
        elif task_type == SCRAPE_PLAYER_CARD and "player_name" in params:
            name = params["player_name"]
            if len(name) > 12:
                name = name[:12] + ".."
            task_type += f"({name})"

        status = job["status"]
        attempts = f"{job['attempts']}/{job['max_attempts']}"
        error = (job.get("last_error") or "")[:30]
        print(f"{job_id:<10} {task_type:<22} {status:<11} {attempts:<10} {error}")


def main():
    parser = argparse.ArgumentParser(description="Enqueue scraper jobs")
    parser.add_argument("--season", type=int, default=DEFAULT_SEASON)
    parser.add_argument("--league-id", type=int, default=DEFAULT_LEAGUE_ID)

    subparsers = parser.add_subparsers(dest="command", required=True)

    # batch
    subparsers.add_parser("batch", help="Enqueue full pipeline (NFL stats + all positions)")

    # roster
    roster_parser = subparsers.add_parser("roster", help="Enqueue single position scrape")
    roster_parser.add_argument("--position", required=True, choices=POSITIONS)
    roster_parser.add_argument("--level", default="pro", choices=["pro", "college", "both"],
                               help="Player level to scrape (default: pro)")

    # player
    player_parser = subparsers.add_parser("player", help="Enqueue single player card scrape")
    player_parser.add_argument("--ottoneu-id", type=int, required=True)
    player_parser.add_argument("--name", required=True)
    player_parser.add_argument("--player-uuid", required=True, help="UUID from players table")

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

    commands = {
        "batch": enqueue_batch,
        "roster": enqueue_roster,
        "player": enqueue_player,
        "nfl-stats": enqueue_nfl_stats,
        "player-stats": enqueue_player_stats,
        "status": show_status,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
