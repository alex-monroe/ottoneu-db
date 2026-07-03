"""CLI for exploring other public Ottoneu football leagues.

Usage (via `just league-explorer <args>`):

    discover   Find league IDs from player-card trade links in a seed league
    scrape     Scrape league settings, standings history, trophies, finances,
               and roster snapshots into the local SQLite DB
    report     Canned cross-league summaries (formats, champions, how winners
               allocate salary by position)
    query      Ad-hoc SQL against the local DB (for agents and scripts)

The DB lives at data/league_explorer/league_explorer.db; raw pages are cached
under data/league_explorer/cache/ so re-runs are cheap and offline-friendly.
"""

from __future__ import annotations

import argparse
import csv
import sys
from datetime import date
from pathlib import Path

from scripts.config import LEAGUE_ID
from scripts.league_explorer import parsers, store
from scripts.league_explorer.fetcher import Fetcher, FetchError

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = PROJECT_ROOT / store.DEFAULT_DB_PATH
DEFAULT_CACHE = PROJECT_ROOT / "data/league_explorer/cache"

# Cache lifetimes (hours). Completed-season standings are immutable (None).
SNAPSHOT_MAX_AGE = 12          # rosters, finances, current standings
SETTINGS_MAX_AGE = 24 * 7      # league settings rarely change
TEAM_PAGE_MAX_AGE = 24 * 30    # owner + trophies change ~once a season
PLAYER_CARD_MAX_AGE = 24 * 7   # discovery links accrete slowly


def _fetcher(args) -> Fetcher:
    return Fetcher(cache_dir=DEFAULT_CACHE, delay_seconds=args.delay,
                   refresh=getattr(args, "refresh", False))


def _print_table(headers: list[str], rows: list[tuple]) -> None:
    widths = [max(len(str(h)), *(len(str(r[i])) for r in rows)) if rows else len(str(h))
              for i, h in enumerate(headers)]
    print("  ".join(str(h).ljust(w) for h, w in zip(headers, widths)))
    print("  ".join("-" * w for w in widths))
    for r in rows:
        print("  ".join(str(v if v is not None else "").ljust(w) for v, w in zip(r, widths)))


def cmd_discover(args) -> int:
    fetcher = _fetcher(args)
    conn = store.connect(args.db)
    seed = args.seed_league

    csv_text = fetcher.get(f"/football/{seed}/csv/rosters", max_age_hours=SNAPSHOT_MAX_AGE)
    if not csv_text:
        print(f"Could not fetch rosters CSV for seed league {seed}", file=sys.stderr)
        return 1
    roster = parsers.parse_rosters_csv(csv_text)
    player_ids = list(dict.fromkeys(
        r["ottoneu_player_id"] for r in roster if r["ottoneu_player_id"]
    ))[: args.max_players]

    store.record_discovered(conn, seed, "seed")
    found: set[int] = set()
    for i, pid in enumerate(player_ids, 1):
        html = fetcher.get(f"/football/{seed}/player_card/nfl/{pid}",
                           max_age_hours=PLAYER_CARD_MAX_AGE)
        if not html:
            continue
        ids = parsers.parse_league_ids_from_player_card(html, exclude=seed)
        for lid in ids:
            store.record_discovered(conn, lid, f"player_card:{pid}")
        found |= ids
        if i % 10 == 0 or i == len(player_ids):
            print(f"  [{i}/{len(player_ids)}] player cards scanned, "
                  f"{len(found)} distinct leagues linked so far")
    conn.commit()

    total = len(store.discovered_league_ids(conn))
    print(f"Done. {len(found)} leagues linked from this run; "
          f"{total} total in discovered_leagues.")
    print("Next: just league-explorer scrape --discovered")
    return 0


def _scrape_league(fetcher: Fetcher, conn, league_id: int) -> str:
    """Scrape one league end-to-end. Returns a short status string."""
    settings_html = fetcher.get(f"/football/{league_id}/settings",
                                max_age_hours=SETTINGS_MAX_AGE)
    if settings_html is None:
        return "not found (404)"
    settings = parsers.parse_settings(settings_html)
    if settings["league_id"] != league_id:
        # Private/inaccessible leagues bounce to a page without a settings table.
        return "no public settings (private league?)"
    store.upsert_league(conn, settings)

    csv_text = fetcher.get(f"/football/{league_id}/csv/rosters",
                           max_age_hours=SNAPSHOT_MAX_AGE)
    roster_rows = parsers.parse_rosters_csv(csv_text) if csv_text else []
    store.snapshot_rosters(conn, league_id, roster_rows)

    finances_html = fetcher.get(f"/football/{league_id}/finances",
                                max_age_hours=SNAPSHOT_MAX_AGE)
    if finances_html:
        store.snapshot_finances(conn, league_id, parsers.parse_finances(finances_html))

    team_ids = sorted({r["team_id"] for r in roster_rows})
    for tid in team_ids:
        team_html = fetcher.get(f"/football/{league_id}/team/{tid}",
                                max_age_hours=TEAM_PAGE_MAX_AGE)
        if not team_html:
            continue
        team = parsers.parse_team_page(team_html)
        store.upsert_team(conn, league_id, tid, team["name"], team["owner"])
        store.replace_trophies(conn, league_id, tid, team["trophies"])

    first_season = settings["established_year"] or date.today().year
    seasons_stored = 0
    for season in range(first_season, date.today().year + 1):
        immutable = season < date.today().year
        html = fetcher.get(f"/football/{league_id}/standings/{season}",
                           max_age_hours=None if immutable else SNAPSHOT_MAX_AGE)
        if not html:
            continue
        rows = parsers.parse_standings(html)
        # An unplayed season renders all-zero records; don't store it.
        rows = [r for r in rows if (r["wins"] or r["losses"] or r["ties"]
                                    or (r["points_for"] or 0) > 0)]
        if rows:
            store.replace_standings(conn, league_id, season, rows)
            seasons_stored += 1

    conn.commit()
    return (f"ok — {len(roster_rows)} roster slots, {len(team_ids)} teams, "
            f"{seasons_stored} seasons of standings")


def cmd_scrape(args) -> int:
    fetcher = _fetcher(args)
    conn = store.connect(args.db)

    if args.league_ids:
        league_ids = [int(x) for x in args.league_ids.split(",") if x.strip()]
    elif args.discovered:
        league_ids = store.discovered_league_ids(conn)
    else:
        print("Provide --league-ids 33,74,... or --discovered", file=sys.stderr)
        return 1
    if args.max_leagues:
        league_ids = league_ids[: args.max_leagues]

    print(f"Scraping {len(league_ids)} league(s)...")
    failures = 0
    for i, lid in enumerate(league_ids, 1):
        try:
            status = _scrape_league(fetcher, conn, lid)
        except FetchError as e:
            status = f"FAILED: {e}"
            failures += 1
        print(f"  [{i}/{len(league_ids)}] league {lid}: {status}")
    print(f"Done ({fetcher.requests_made} requests, {fetcher.cache_hits} cache hits). "
          f"DB: {args.db}")
    return 1 if failures == len(league_ids) and league_ids else 0


def cmd_report(args) -> int:
    conn = store.connect(args.db)

    print("## Leagues scraped\n")
    rows = conn.execute(
        """SELECT l.league_id, l.name, l.tier, l.points_system, l.roster_settings,
                  l.num_teams, l.established_year,
                  (SELECT t.name FROM trophies tr JOIN teams t
                     ON t.league_id = tr.league_id AND t.team_id = tr.team_id
                    WHERE tr.league_id = l.league_id AND tr.place = 'champion'
                    ORDER BY tr.season DESC LIMIT 1) AS latest_champion
             FROM leagues l ORDER BY l.league_id"""
    ).fetchall()
    _print_table(
        ["id", "name", "tier", "points", "rosters", "teams", "est", "latest champ"],
        [tuple(r) for r in rows],
    )

    print("\n## Format mix\n")
    rows = conn.execute(
        """SELECT points_system, roster_settings, COUNT(*) AS leagues
             FROM leagues GROUP BY 1, 2 ORDER BY leagues DESC"""
    ).fetchall()
    _print_table(["points", "rosters", "leagues"], [tuple(r) for r in rows])

    print("\n## Champions by season\n")
    rows = conn.execute(
        """SELECT tr.season, tr.league_id, lg.name AS league, t.name AS team, t.owner
             FROM trophies tr
             JOIN teams t ON t.league_id = tr.league_id AND t.team_id = tr.team_id
             JOIN leagues lg ON lg.league_id = tr.league_id
            WHERE tr.place = 'champion'
            ORDER BY tr.season DESC, tr.league_id LIMIT ?""",
        (args.limit,),
    ).fetchall()
    _print_table(["season", "league_id", "league", "team", "owner"],
                 [tuple(r) for r in rows])

    print("\n## Current roster salary by position: reigning champions vs everyone\n")
    rows = conn.execute(
        """WITH latest AS (
               SELECT league_id, MAX(snapshot_date) AS snapshot_date
                 FROM roster_slots GROUP BY league_id
           ),
           slots AS (
               SELECT rs.*, CASE WHEN instr(rs.positions, '/') > 0
                                 THEN substr(rs.positions, 1, instr(rs.positions, '/') - 1)
                                 ELSE rs.positions END AS pos,
                      EXISTS (
                          SELECT 1 FROM trophies tr
                           WHERE tr.league_id = rs.league_id
                             AND tr.team_id = rs.team_id
                             AND tr.place = 'champion'
                             AND tr.season = (SELECT MAX(season) FROM trophies
                                               WHERE league_id = rs.league_id
                                                 AND place = 'champion')
                      ) AS is_champ
                 FROM roster_slots rs
                 JOIN latest USING (league_id, snapshot_date)
           )
           SELECT pos,
                  ROUND(AVG(CASE WHEN is_champ THEN salary END), 1) AS champ_avg,
                  ROUND(SUM(CASE WHEN is_champ THEN salary ELSE 0 END) * 100.0 /
                        NULLIF(SUM(SUM(CASE WHEN is_champ THEN salary ELSE 0 END)) OVER (), 0), 1)
                      AS champ_spend_pct,
                  ROUND(AVG(salary), 1) AS all_avg,
                  ROUND(SUM(salary) * 100.0 /
                        NULLIF(SUM(SUM(salary)) OVER (), 0), 1) AS all_spend_pct
             FROM slots
            WHERE pos IN ('QB', 'RB', 'WR', 'TE', 'K')
            GROUP BY pos
            ORDER BY all_spend_pct DESC"""
    ).fetchall()
    _print_table(["pos", "champ avg $", "champ spend %", "all avg $", "all spend %"],
                 [tuple(r) for r in rows])
    print("\n(Champion = winner of each league's most recent completed season; "
          "salaries are from the latest roster snapshot.)")
    return 0


def cmd_query(args) -> int:
    conn = store.connect(args.db)
    cur = conn.execute(args.sql)
    headers = [d[0] for d in cur.description] if cur.description else []
    rows = cur.fetchall()
    if args.csv:
        writer = csv.writer(sys.stdout)
        writer.writerow(headers)
        writer.writerows([tuple(r) for r in rows])
    else:
        _print_table(headers, [tuple(r) for r in rows])
        print(f"\n({len(rows)} rows)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="league-explorer",
        description="Explore public Ottoneu football leagues into a local SQLite DB.",
    )
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--db", default=str(DEFAULT_DB), help="SQLite DB path")
    common.add_argument("--delay", type=float, default=1.0,
                        help="Seconds between HTTP requests (default 1.0)")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("discover", parents=[common],
                       help="Find league IDs via player-card trade links")
    p.add_argument("--seed-league", type=int, default=LEAGUE_ID,
                   help="League whose player cards to scan (default: our league)")
    p.add_argument("--max-players", type=int, default=75,
                   help="How many rostered players' cards to scan (default 75)")
    p.set_defaults(func=cmd_discover)

    p = sub.add_parser("scrape", parents=[common],
                       help="Scrape leagues into the local DB")
    p.add_argument("--league-ids", help="Comma-separated Ottoneu league IDs")
    p.add_argument("--discovered", action="store_true",
                   help="Scrape every league in discovered_leagues")
    p.add_argument("--max-leagues", type=int, default=0,
                   help="Cap the number of leagues scraped this run")
    p.add_argument("--refresh", action="store_true",
                   help="Refetch mutable pages even if cached copies are fresh")
    p.set_defaults(func=cmd_scrape)

    p = sub.add_parser("report", parents=[common],
                       help="Cross-league summary report")
    p.add_argument("--limit", type=int, default=40,
                   help="Max champion rows to list (default 40)")
    p.set_defaults(func=cmd_report)

    p = sub.add_parser("query", parents=[common],
                       help="Run ad-hoc SQL against the local DB")
    p.add_argument("sql", help="SQL statement to execute")
    p.add_argument("--csv", action="store_true", help="Emit CSV instead of a table")
    p.set_defaults(func=cmd_query)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
