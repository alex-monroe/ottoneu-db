"""Scrape Draft Sharks Half-PPR Superflex auction values into draft_sharks_values.

Draft Sharks publishes auction values for a $200 salary cap; this league uses a
$400 cap, so every dollar value is multiplied by 2 before storage. Two columns
are captured per player:

  * ds_auction_value     — Draft Sharks' own model-recommended bid
  * market_auction_value — Draft Sharks' consensus "auction market value"

The rankings table is rendered client-side and lazy-loads rows as you scroll, so
we drive it with Playwright (already a dependency, see scripts/worker.py). Each
position page (.../auction-values/<pos>/half-ppr-superflex) actually renders the
full cross-position board; we read each row's position from its rank label
(e.g. "RB1", "QB12") and keep only rows matching the page we requested.

Players are matched to our DB by (normalized name, position) using the same
lookup as scripts/backfill_draft_capital.py. Unmatched names are reported so
aliases can be added to scripts/name_utils.NAME_ALIASES.

Usage:
    venv/bin/python scripts/scrape_draft_sharks.py
    venv/bin/python scripts/scrape_draft_sharks.py --season 2026
    venv/bin/python scripts/scrape_draft_sharks.py --positions rb wr --dry-run
"""

from __future__ import annotations

import argparse
import asyncio

from playwright.async_api import async_playwright

from scripts.config import fetch_all_rows, get_supabase_client
from scripts.season import projection_season
from scripts.name_utils import normalize_player_name

POSITIONS = ["qb", "rb", "wr", "te"]

URL_TEMPLATE = "https://www.draftsharks.com/auction-values/{pos}/half-ppr-superflex"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# JS run in the page to pull every loaded player row from the rankings table.
# Returns [{name, pos, ds, market}] where ds/market are the raw site dollar ints.
_EXTRACT_JS = r"""
() => {
  const t = document.querySelector('#rankingsTable');
  if (!t) return [];
  const rows = [...t.querySelectorAll('tr.player-row')];
  return rows.map(r => {
    const nameCell = r.querySelector('td.player-name');
    const fullText = nameCell ? nameCell.innerText : '';
    const name = fullText.split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
    const m = fullText.replace(/\s+/g, ' ').match(/\b([A-Z]{1,3})\d+\b/);
    const pos = m ? m[1] : '';
    const dsCell = r.querySelector('td[data-attribute="dsAuctionValue"]');
    const mktCell = r.querySelector('td[data-attribute="auctionMarketValue"]');
    const parseDollar = (el) => {
      if (!el) return null;
      const raw = (el.getAttribute('data-value') || el.innerText || '').replace(/[^0-9.]/g, '');
      return raw === '' ? null : parseFloat(raw);
    };
    return { name, pos, ds: parseDollar(dsCell), market: parseDollar(mktCell) };
  });
}
"""


async def _load_all_rows(page) -> int:
    """Scroll to the bottom repeatedly until the lazy-loaded row count stabilizes."""
    await page.wait_for_selector("#rankingsTable tr.player-row", timeout=30_000)
    last = -1
    stable = 0
    for _ in range(40):
        count = await page.eval_on_selector_all(
            "#rankingsTable tr.player-row", "els => els.length"
        )
        if count == last:
            stable += 1
            if stable >= 3:
                break
        else:
            stable = 0
            last = count
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(1_200)
    return last


async def scrape_position(context, pos: str) -> list[dict]:
    """Scrape one position page and return rows whose rank label matches `pos`."""
    url = URL_TEMPLATE.format(pos=pos)
    page = await context.new_page()
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
        total = await _load_all_rows(page)
        raw = await page.evaluate(_EXTRACT_JS)
    finally:
        await page.close()

    pos_upper = pos.upper()
    rows: list[dict] = []
    seen: set[str] = set()
    for r in raw:
        if r.get("pos") != pos_upper:
            continue
        name = (r.get("name") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        rows.append(
            {
                "name": name,
                "position": pos_upper,
                # Site values assume a $200 cap; this league is $400 -> x2.
                "ds_auction_value": r["ds"] * 2 if r.get("ds") is not None else None,
                "market_auction_value": r["market"] * 2 if r.get("market") is not None else None,
            }
        )
    print(f"  {pos_upper}: {len(rows)} rows kept (of {total} loaded)")
    return rows


async def scrape_all(positions: list[str]) -> list[dict]:
    rows: list[dict] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(user_agent=USER_AGENT)
        try:
            for pos in positions:
                rows.extend(await scrape_position(context, pos))
        finally:
            await browser.close()
    return rows


def build_player_lookup(supabase) -> dict[tuple[str, str], str]:
    """Return (normalized_name, position) -> player_id, mirroring backfill_draft_capital."""
    db_rows = fetch_all_rows(supabase, "players", "id, name, position")
    lookup: dict[tuple[str, str], str] = {}
    for r in db_rows:
        if not r.get("name") or not r.get("position"):
            continue
        lookup.setdefault((normalize_player_name(r["name"]), r["position"]), r["id"])
    return lookup


def match_rows(
    scraped: list[dict], lookup: dict[tuple[str, str], str], season: int
) -> tuple[list[dict], list[dict]]:
    matched: list[dict] = []
    unmatched: list[dict] = []
    for r in scraped:
        player_id = lookup.get((normalize_player_name(r["name"]), r["position"]))
        if player_id:
            matched.append(
                {
                    "player_id": player_id,
                    "season": season,
                    "ds_auction_value": r["ds_auction_value"],
                    "market_auction_value": r["market_auction_value"],
                }
            )
        else:
            unmatched.append(r)
    return matched, unmatched


def upsert_values(supabase, rows: list[dict]) -> None:
    if not rows:
        print("  No rows to upsert.")
        return
    batch_size = 200
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        supabase.table("draft_sharks_values").upsert(
            batch, on_conflict="player_id,season"
        ).execute()
    print(f"  Upserted {len(rows)} rows.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape Draft Sharks Half-PPR Superflex auction values."
    )
    # Draft Sharks publishes auction values for the *upcoming* season, which the
    # season-cycle resolver reports as the projection season (the year the web
    # app reads). Resolved lazily after parsing so an explicit --season skips it.
    parser.add_argument(
        "--season", type=int, default=None,
        help="Season to tag the values with (default: resolved projection season)",
    )
    parser.add_argument(
        "--positions", nargs="+", default=POSITIONS,
        choices=POSITIONS,
        help="Positions to scrape (default: qb rb wr te)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Scrape and match without writing to the database",
    )
    args = parser.parse_args()
    season = args.season if args.season is not None else projection_season()

    print(
        f"Draft Sharks scrape (season={season}, "
        f"positions={args.positions}, dry_run={args.dry_run})"
    )

    print("\nScraping Draft Sharks...")
    scraped = asyncio.run(scrape_all(args.positions))
    print(f"  {len(scraped)} total player rows scraped")

    supabase = get_supabase_client()
    print("\nBuilding player lookup from DB...")
    lookup = build_player_lookup(supabase)
    print(f"  {len(lookup)} (name, position) keys")

    matched, unmatched = match_rows(scraped, lookup, season)
    print(f"\nMatched: {len(matched)}")
    print(f"Unmatched: {len(unmatched)}")
    for u in unmatched[:25]:
        print(f"    UNMATCHED {u['name']} ({u['position']}) "
              f"ds={u['ds_auction_value']} mkt={u['market_auction_value']}")

    if args.dry_run:
        print("\nDry run — no DB writes.")
        return

    print("\nUpserting matched values...")
    upsert_values(supabase, matched)
    print("\nDone.")


if __name__ == "__main__":
    main()
