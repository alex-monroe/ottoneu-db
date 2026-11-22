"""Infer the players on waivers from the public roster CSV, with no login.

Usage:
    just infer-fa-waivers                # poll once, write fa_market waiver rows
    just infer-fa-waivers --dry-run      # print what it would write; save nothing

Ottoneu's `/waivers` page is login-gated, and the FanGraphs login sits behind a
Cloudflare challenge from the droplet's datacenter IP. But a waiver is fully
determined by the public `/football/{league}/csv/rosters` export
(`reconcile_roster.parse_roster_csv`):

  * A player who was on a roster at the last poll and is on none now was cut.
    He sits on waivers for WAIVER_CLAIM_HOURS (24), and a claim pays the salary
    he was cut at, which is his salary in the last poll.
  * He leaves waivers when he shows up on a roster again (claimed, or picked up
    once the window closes) or when the window ends.

So the droplet polls the CSV every ten minutes (deploy/droplet/fa-waivers.sh)
and diffs it against the previous poll, kept in a small JSON snapshot
(SNAPSHOT_PATH; gitignored `.cache/`).

## The cut time is a bound, not a reading

A cut happened somewhere between the previous poll and this one. The row uses the
**previous** poll's time, the earliest it could have been, so the board's claim
deadline is never later than the real one; at worst it is one poll interval early.
`fa_market.cut_at_local` stores that time on Ottoneu's site clock, like the old
waivers-page scrape did, and `ends_at` is `scrape_fa_market.claim_deadline` of it.

## Guards

  * A snapshot older than STALE_SNAPSHOT_MINUTES (the droplet was down, or the
    off-season gate kept the job idle) cannot date a cut, so the run only
    re-baselines it.
  * A CSV below `reconcile_roster`'s row/team floor is a broken fetch: the run
    fails and keeps the old snapshot, rather than reading everyone as cut.
  * More than MAX_CUTS_PER_POLL cuts in one poll is not a normal ten minutes (a
    season rollover, a league reset): the run re-baselines and infers nothing.

Writes only `fa_market` rows with `kind='waiver'`, incrementally: inserts new
cuts, deletes rows whose player is rostered again or whose window has closed.
`kind='auction'` rows belong to `scrape_fa_market.py`. Revalidates /free-agents
when anything changed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from scripts.config import LEAGUE_ID, get_supabase_client
from scripts.nfl_week import LEAGUE_TZ
from scripts.reconcile_roster import MIN_ROSTER_ROWS, MIN_TEAMS, RosterRow, fetch_roster_csv, parse_roster_csv
from scripts.scrape_fa_market import TABLE, MarketRow, claim_deadline, resolve_player_ids, to_db_rows

REPO_ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT_PATH = REPO_ROOT / ".cache" / "fa-waivers" / "roster-snapshot.json"
STALE_SNAPSHOT_MINUTES = 60
MAX_CUTS_PER_POLL = 12
KIND = "waiver"


def player_key(is_college: bool, ottoneu_id: int) -> str:
    return f"{'college' if is_college else 'nfl'}:{ottoneu_id}"


# ─── Snapshot (pure + file I/O) ──────────────────────────────────────────────


def snapshot_of(rows: list[RosterRow], fetched_at: datetime) -> dict:
    """The JSON-able snapshot of one poll: when, and every rostered player by key."""
    return {
        "fetched_at": fetched_at.isoformat(),
        "players": {player_key(r.is_college, r.ottoneu_id): asdict(r) for r in rows},
    }


def load_snapshot(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def save_snapshot(path: Path, snapshot: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(snapshot), encoding="utf-8")
    tmp.replace(path)  # atomic: a crash never leaves half a snapshot


# ─── Inference (pure) ────────────────────────────────────────────────────────


def usable_baseline(prev: dict | None, now: datetime,
                    stale_minutes: int = STALE_SNAPSHOT_MINUTES) -> tuple[bool, str]:
    """Whether `prev` can date this poll's cuts, with a reason for the log."""
    if not prev:
        return False, "no previous snapshot"
    age = now - datetime.fromisoformat(prev["fetched_at"])
    if age > timedelta(minutes=stale_minutes):
        return False, f"previous snapshot is {int(age.total_seconds() // 60)} min old"
    return True, "ok"


def detect_cuts(prev: dict, current_keys: set[str]) -> list[MarketRow]:
    """Waiver rows for everyone rostered at `prev` and on no roster now.

    The cut time is `prev`'s poll time, the earliest it could have been (see the
    module docstring); the salary is his salary at `prev`.
    """
    cut_utc = datetime.fromisoformat(prev["fetched_at"])
    cut_local = cut_utc.astimezone(LEAGUE_TZ).replace(tzinfo=None, microsecond=0)
    rows = []
    for key, p in sorted(prev["players"].items()):
        if key in current_keys:
            continue
        rows.append(MarketRow(
            kind=KIND,
            ottoneu_id=p["ottoneu_id"],
            is_college=p["is_college"],
            player_name=p["name"],
            nfl_team=p["nfl_team"],
            position=p["position"] or None,
            injury_status=None,
            ends_at=claim_deadline(cut_local).isoformat(),
            salary=p["price"],
            cut_at_local=cut_local.isoformat(),
        ))
    return rows


def rows_to_remove(stored: list[dict], current_keys: set[str], now: datetime) -> list[str]:
    """Stored waiver rows that are over: rostered again, or the window has closed."""
    return sorted(
        r["player_key"] for r in stored
        if r["player_key"] in current_keys or datetime.fromisoformat(r["ends_at"]) <= now
    )


# ─── DB + site ───────────────────────────────────────────────────────────────


def fetch_stored(supabase, league_id: int) -> list[dict]:
    return (
        supabase.table(TABLE)
        .select("player_key, ends_at")
        .eq("league_id", league_id)
        .eq("kind", KIND)
        .limit(999)  # pagination-safe: a day's cuts, a handful of rows
        .execute()
        .data
        or []
    )


def revalidate_free_agents() -> None:
    """Drop /free-agents' cached page (it otherwise refreshes hourly). Never fails the run."""
    secret, site = os.environ.get("REVALIDATE_SECRET"), os.environ.get("SITE_URL")
    if not secret or not site:
        return
    try:
        requests.post(f"{site}/api/revalidate", json={"paths": ["/free-agents"]}, timeout=15,
                      headers={"Authorization": f"Bearer {secret}"}).raise_for_status()
    except requests.RequestException as e:
        print(f"Revalidate failed (the page refreshes on its own within the hour): {e}")


# ─── Entry point ─────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="Print; write nothing, save no snapshot.")
    parser.add_argument("--csv-file", help="Parse a saved roster CSV instead of fetching.")
    parser.add_argument("--snapshot", type=Path, default=SNAPSHOT_PATH, help="Snapshot file path.")
    args = parser.parse_args(argv)

    now = datetime.now(timezone.utc).replace(microsecond=0)
    text = open(args.csv_file, encoding="utf-8").read() if args.csv_file else fetch_roster_csv(LEAGUE_ID)
    rows = parse_roster_csv(text)
    if len(rows) < MIN_ROSTER_ROWS or len({r.team for r in rows}) < MIN_TEAMS:
        print(f"Error: roster CSV has {len(rows)} rows — below the safety floor; keeping the old snapshot.")
        return 1
    current = snapshot_of(rows, now)
    current_keys = set(current["players"])

    prev = load_snapshot(args.snapshot)
    ok, why = usable_baseline(prev, now)
    cuts = detect_cuts(prev, current_keys) if ok else []
    if not ok:
        print(f"Re-baselining ({why}); no cuts inferred this poll.")
    elif len(cuts) > MAX_CUTS_PER_POLL:
        print(f"Warning: {len(cuts)} players left rosters in one poll (> {MAX_CUTS_PER_POLL}) — "
              "not a normal poll; re-baselining and inferring nothing.")
        cuts = []

    print(f"{len(rows)} rostered players; {len(cuts)} new cut(s).")
    for c in cuts:
        print(f"  cut     {c.player_name:28} {c.position or '?':3} salary ${c.salary:<4} "
              f"claimable until {c.ends_at}")

    if args.dry_run:
        print("Dry run: nothing written, snapshot not saved.")
        return 0

    supabase = get_supabase_client()
    stale = rows_to_remove(fetch_stored(supabase, LEAGUE_ID), current_keys, now)
    if cuts:
        db_rows = [{**r, "first_seen_at": r["scraped_at"]}
                   for r in to_db_rows(cuts, LEAGUE_ID, resolve_player_ids(supabase, cuts), now.isoformat())]
        supabase.table(TABLE).upsert(db_rows, on_conflict="league_id,kind,player_key").execute()
    if stale:
        (supabase.table(TABLE).delete().eq("league_id", LEAGUE_ID).eq("kind", KIND)
         .in_("player_key", stale).execute())
    print(f"Wrote {len(cuts)} waiver row(s); removed {len(stale)} ({', '.join(stale) or 'none'}).")
    save_snapshot(args.snapshot, current)
    if cuts or stale:
        revalidate_free_agents()
    return 0


if __name__ == "__main__":
    sys.exit(main())
