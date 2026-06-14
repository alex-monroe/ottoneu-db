"""Scrape OverTheCap contract history into player_contracts (spike #651, source #3).

OverTheCap's per-position contract-history pages
(``overthecap.com/contract-history/<position>``) render a full historical table
of every contract a player signed — Player, Team, Year Signed, Years, Value,
APY, Guaranteed, and **APY as % of Cap At Signing** (already cap-inflation
normalized, so comparable across years). Going back to the 1990s and current
through the latest offseason.

The nflverse contracts mirror is stale (last published 2022-04, no 2023+ rows),
so OTC is the primary source (host allowlisted in ``.devcontainer``). Because
each row is dated by ``year_signed``, a leakage-free per-season panel is
reconstructable: a deal with ``year_signed == N`` was signed in N's offseason
(March–April), before that season's games.

Players are matched to our DB by ``(normalized name, position)`` — the same
scheme as ``scrape_draft_sharks.py`` / ``backfill_draft_capital.py``.

Usage:
    venv/bin/python scripts/scrape_otc_contracts.py
    venv/bin/python scripts/scrape_otc_contracts.py --since 2018
    venv/bin/python scripts/scrape_otc_contracts.py --dry-run
"""

from __future__ import annotations

import argparse
from io import StringIO

import pandas as pd
import requests

from scripts.config import fetch_all_rows, get_supabase_client
from scripts.name_utils import normalize_player_name

# OTC position-page slug -> our position code. Skill positions only (the
# projection system covers QB/RB/WR/TE/K; OTC has no skill-relevant kicker
# contract page worth the name-match tax).
POSITION_SLUGS = {
    "quarterback": "QB",
    "running-back": "RB",
    "wide-receiver": "WR",
    "tight-end": "TE",
}
BASE_URL = "https://overthecap.com/contract-history"
DEFAULT_SINCE_SEASON = 2018
USER_AGENT = "Mozilla/5.0 (compatible; ottoneu-db/1.0)"


def _money(val) -> int | None:
    """'$55,000,000' -> 55000000; NaN/'' -> None."""
    if pd.isna(val):
        return None
    s = str(val).replace("$", "").replace(",", "").strip()
    if not s or s in {"-", "N/A"}:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def _pct(val) -> float | None:
    """'19.7%' -> 19.7; NaN -> None."""
    if pd.isna(val):
        return None
    s = str(val).replace("%", "").strip()
    if not s or s == "-":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def scrape_position(slug: str, since: int) -> list[dict]:
    """Fetch one OTC contract-history page and return cleaned contract rows."""
    pos = POSITION_SLUGS[slug]
    url = f"{BASE_URL}/{slug}"
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
    resp.raise_for_status()
    table = pd.read_html(StringIO(resp.text))[0]

    rows: list[dict] = []
    for d in table.to_dict("records"):
        year = d.get("Year Signed")
        if pd.isna(year) or int(year) < since:
            continue
        name = d.get("Player")
        if pd.isna(name) or not str(name).strip():
            continue
        years_val = d.get("Years")
        rows.append(
            {
                "name": str(name).strip(),
                "position": pos,
                "year_signed": int(year),
                "years": (None if pd.isna(years_val) else float(years_val)),
                "value": _money(d.get("Value")),
                "apy": _money(d.get("APY")),
                "guaranteed": _money(d.get("Guaranteed")),
                "apy_cap_pct": _pct(d.get("APY as % Of Cap At Signing")),
            }
        )
    print(f"  {slug}: {len(rows)} contracts (year_signed >= {since})")
    return rows


def build_player_lookup(supabase) -> dict[tuple[str, str], str]:
    """(normalized_name, position) -> player_id (mirrors scrape_draft_sharks)."""
    db_rows = fetch_all_rows(supabase, "players", "id, name, position")
    lookup: dict[tuple[str, str], str] = {}
    for r in db_rows:
        if not r.get("name") or not r.get("position"):
            continue
        lookup.setdefault((normalize_player_name(r["name"]), r["position"]), r["id"])
    return lookup


def match_rows(
    scraped: list[dict], lookup: dict[tuple[str, str], str]
) -> tuple[list[dict], list[dict]]:
    """Resolve player_id; collapse to one row per (player, year_signed) keeping
    the richest deal (max value). Returns (matched_payload, unmatched)."""
    best: dict[tuple[str, int], dict] = {}
    unmatched: list[dict] = []
    for r in scraped:
        pid = lookup.get((normalize_player_name(r["name"]), r["position"]))
        if not pid:
            unmatched.append(r)
            continue
        key = (pid, r["year_signed"])
        payload = {
            "player_id": pid,
            "position": r["position"],
            "year_signed": r["year_signed"],
            "years": r["years"],
            "value": r["value"],
            "apy": r["apy"],
            "guaranteed": r["guaranteed"],
            "apy_cap_pct": r["apy_cap_pct"],
        }
        prev = best.get(key)
        if prev is None or (payload["value"] or 0) > (prev["value"] or 0):
            best[key] = payload
    return list(best.values()), unmatched


def upsert_contracts(supabase, rows: list[dict]) -> None:
    if not rows:
        print("  No rows to upsert.")
        return
    batch_size = 200
    total = (len(rows) + batch_size - 1) // batch_size
    for i in range(0, len(rows), batch_size):
        supabase.table("player_contracts").upsert(
            rows[i : i + batch_size], on_conflict="player_id,year_signed"
        ).execute()
        print(f"  Batch {i // batch_size + 1} / {total}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape OverTheCap contract history into player_contracts."
    )
    parser.add_argument(
        "--since", type=int, default=DEFAULT_SINCE_SEASON,
        help=f"Earliest year_signed to ingest (default: {DEFAULT_SINCE_SEASON})",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Scrape + match without writing"
    )
    args = parser.parse_args()

    print(f"OTC Contracts Scrape (since={args.since}, dry_run={args.dry_run})")

    print("\nScraping OverTheCap contract-history pages...")
    scraped: list[dict] = []
    for slug in POSITION_SLUGS:
        scraped.extend(scrape_position(slug, args.since))
    print(f"  {len(scraped)} total contracts scraped")

    supabase = get_supabase_client()
    lookup = build_player_lookup(supabase)
    print(f"\n{len(lookup)} (name, position) keys in players table")

    matched, unmatched = match_rows(scraped, lookup)
    print(f"\nMatched {len(matched)} (player, year) contracts; {len(unmatched)} unmatched")

    by_year = {}
    for m in matched:
        by_year[m["year_signed"]] = by_year.get(m["year_signed"], 0) + 1
    print("Matched contracts by year_signed:")
    for y in sorted(by_year):
        print(f"  {y}: {by_year[y]}")

    if unmatched:
        print(f"\nSample unmatched (first 12 of {len(unmatched)}):")
        for u in unmatched[:12]:
            print(f"  {u['name']} ({u['position']}, {u['year_signed']})")

    if args.dry_run:
        print("\n[DRY RUN] No writes.")
        return

    print("\nUpserting to player_contracts...")
    upsert_contracts(supabase, matched)
    print("Done.")


if __name__ == "__main__":
    main()
