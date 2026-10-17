"""Scrape the open free-agent market: active auctions and claimable waivers.

Usage:
    just scrape-fa-market                       # fetch both pages, write the table
    just scrape-fa-market --dry-run             # fetch and print, write nothing
    just scrape-fa-market --auctions-file a.html --waivers-file w.html --dry-run

Two Ottoneu pages, two different access rules (checked 2026-10-17):

  /football/{league}/auctions   PUBLIC. "Active Auctions": player, time left
                                ("1 hours 30 minutes 6 seconds"), minimum bid.
                                Logged in, each row also carries the auction id
                                (the bid box is `bid[65506]`). Bids are blind and
                                the nominating team is not shown to anyone.
  /football/{league}/waivers    LOGIN-GATED (307 to the league home anonymously).
                                "Waiver Claims": player, salary, cut date. Logged
                                in, each row carries the claim id (`claim[393882]`).
                                The cutting team is not shown.

So the scrape logs in when FANGRAPHS_USERNAME / FANGRAPHS_PASSWORD are set
(`scripts/fangraphs_login.py`) and reads both pages in one browser session.
Without credentials it still reads the public auctions page over plain HTTP and
leaves the waiver rows alone, so a missing secret degrades to half a board rather
than none.

## Times

An auction row prints a countdown, not a clock time, so its end is
`scraped_at + countdown` — an absolute instant with no time zone to guess. A
waiver row prints the cut time on Ottoneu's site clock ("October 17, 2026 9:51
AM"); it is stored verbatim as `cut_at_local` (the same convention as `trades`
and `transactions`), and the claim deadline is that wall-clock time read in the
league's time zone (`nfl_week.LEAGUE_TZ`, US Eastern) plus WAIVER_CLAIM_HOURS.

## Writes

One table, `fa_market`, one row per player currently up for auction or on
waivers. Each kind is a snapshot of its page: upsert what is listed, then delete
what is no longer listed. A kind that was not fetched this run is left untouched;
the web filters out rows whose `ends_at` has passed, so a stale row expires on
its own.

Two page loads (plus a login) per run, at a cadence of hours — well clear of the
429s the per-player card scrape hits (#752).
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone

from bs4 import BeautifulSoup

from scripts.config import LEAGUE_ID, WAIVER_CLAIM_HOURS, get_supabase_client
from scripts.fangraphs_login import have_credentials, login_to_fangraphs, save_debug_screenshot
from scripts.nfl_week import LEAGUE_TZ
from scripts.ottoneu_http import BASE_URL, fetch_page

TABLE = "fa_market"
AUCTIONS_PATH = "/football/{league_id}/auctions"
WAIVERS_PATH = "/football/{league_id}/waivers"
USER_AGENT = (
    "ottoneu-db-fa-market/1.0 "
    "(personal research tool; github.com/alex-monroe/ottoneu-db)"
)
# Playwright's login needs a browser UA (see scrape_arbitration_progress.py); the
# plain-HTTP path above must NOT use one (see ottoneu_http.py).
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

CARD_HREF_RE = re.compile(r"/player_card/(nfl|college)/(\d+)")
DURATION_RE = re.compile(r"(\d+)\s*(day|hour|minute|second)s?", re.I)
INPUT_ID_RE = re.compile(r"\[(\d+)\]")
CUT_DATE_FORMAT = "%B %d, %Y %I:%M %p"


@dataclass
class MarketRow:
    kind: str                       # 'auction' | 'waiver'
    ottoneu_id: int
    is_college: bool
    player_name: str
    nfl_team: str | None            # NFL team, or the school for a college player
    position: str | None
    injury_status: str | None
    ends_at: str                    # ISO UTC: auction end / claim window end
    market_id: int | None = None    # auction id or claim id (logged-in pages only)
    min_bid: int | None = None      # auctions
    salary: int | None = None       # waivers: the salary a claim pays
    cut_at_local: str | None = None  # waivers: Ottoneu site clock, ISO, no zone

    @property
    def player_key(self) -> str:
        return f"{'college' if self.is_college else 'nfl'}:{self.ottoneu_id}"


# ─── Parsing (pure) ──────────────────────────────────────────────────────────


def parse_duration(text: str) -> timedelta | None:
    """'1 hours 30 minutes 6 seconds' -> timedelta. None when nothing parses."""
    parts = DURATION_RE.findall(text or "")
    if not parts:
        return None
    kwargs = {"days": 0, "hours": 0, "minutes": 0, "seconds": 0}
    for amount, unit in parts:
        kwargs[unit.lower() + "s"] += int(amount)
    return timedelta(**kwargs)


def parse_money(text: str) -> int | None:
    digits = re.sub(r"[^\d]", "", text or "")
    return int(digits) if digits else None


def parse_cut_time(text: str) -> datetime | None:
    """'October 17, 2026 9:51 AM' -> naive datetime on the site clock."""
    try:
        return datetime.strptime(" ".join((text or "").split()), CUT_DATE_FORMAT)
    except ValueError:
        return None


def claim_deadline(cut_local: datetime) -> datetime:
    """The UTC instant a waiver claim window closes, from the site-clock cut time."""
    return (cut_local.replace(tzinfo=LEAGUE_TZ) + timedelta(hours=WAIVER_CLAIM_HOURS)).astimezone(
        timezone.utc
    )


def _player_cell(td) -> dict | None:
    """Identity from a player cell: card link, 'TEAM POS' span, injury span."""
    link = td.find("a", href=CARD_HREF_RE)
    if link is None:
        return None
    kind, pid = CARD_HREF_RE.search(link["href"]).groups()
    is_college = kind == "college"
    team, position = None, None
    meta = td.find("span", class_="smaller")
    if meta:
        tokens = meta.get_text(" ", strip=True).split()
        if tokens:
            position = tokens[-1]
            team = tokens[0]
    injury = td.find("span", class_="injury")
    return {
        "ottoneu_id": int(pid),
        "is_college": is_college,
        "player_name": link.get_text(strip=True),
        "nfl_team": team,
        "position": position,
        "injury_status": injury.get_text(strip=True) if injury else None,
    }


def _table_after_heading(soup: BeautifulSoup, heading: str):
    """The first <table> after the <h1> whose text is `heading`."""
    for h1 in soup.find_all("h1"):
        if h1.get_text(strip=True) == heading:
            return h1.find_next("table")
    return None


def _input_id(td) -> int | None:
    """Ottoneu's auction/claim id from the bid box or claim checkbox, if shown."""
    if td is None:
        return None
    el = td.find("input", attrs={"name": INPUT_ID_RE})
    if el is not None:
        m = INPUT_ID_RE.search(el["name"])
        return int(m.group(1)) if m else None
    m = re.match(r"bid_(\d+)$", td.get("id") or "")
    return int(m.group(1)) if m else None


def parse_auctions(html: str, now: datetime) -> list[MarketRow]:
    """Rows of the 'Active Auctions' table. `now` anchors the countdowns (UTC)."""
    soup = BeautifulSoup(html, "html.parser")
    table = _table_after_heading(soup, "Active Auctions")
    if table is None or table.tbody is None:
        return []
    rows = []
    for tr in table.tbody.find_all("tr"):
        tds = tr.find_all("td", recursive=False)
        if len(tds) < 3:
            continue
        ident = _player_cell(tds[0])
        left = parse_duration(tds[1].get_text(" ", strip=True))
        if ident is None or left is None:
            continue
        rows.append(MarketRow(
            kind="auction",
            ends_at=(now + left).isoformat(),
            market_id=_input_id(tds[3]) if len(tds) > 3 else None,
            min_bid=parse_money(tds[2].get_text()),
            **ident,
        ))
    return rows


def parse_waivers(html: str) -> list[MarketRow]:
    """Rows of the 'Waiver Claims' table (logged-in page only)."""
    soup = BeautifulSoup(html, "html.parser")
    table = _table_after_heading(soup, "Waiver Claims")
    # The heading sits in the page header; the claims table is the next one.
    if table is None or table.tbody is None:
        return []
    rows = []
    for tr in table.tbody.find_all("tr"):
        tds = tr.find_all("td", recursive=False)
        if len(tds) < 3:
            continue
        ident = _player_cell(tds[0])
        cut = parse_cut_time(tds[2].get_text(" ", strip=True))
        if ident is None or cut is None:
            continue
        rows.append(MarketRow(
            kind="waiver",
            ends_at=claim_deadline(cut).isoformat(),
            market_id=_input_id(tds[3]) if len(tds) > 3 else None,
            salary=parse_money(tds[1].get_text()),
            cut_at_local=cut.isoformat(),
            **ident,
        ))
    return rows


def to_db_rows(rows: list[MarketRow], league_id: int, player_ids: dict[str, str], scraped_at: str) -> list[dict]:
    out = []
    for r in rows:
        d = asdict(r)
        d.update(
            league_id=league_id,
            player_key=r.player_key,
            player_id=player_ids.get(r.player_key),
            scraped_at=scraped_at,
        )
        out.append(d)
    return out


# ─── Fetching ────────────────────────────────────────────────────────────────


def fetch_auctions_public(league_id: int) -> str:
    return fetch_page(AUCTIONS_PATH.format(league_id=league_id), USER_AGENT)


async def fetch_logged_in(league_id: int) -> tuple[str, str]:
    """(auctions_html, waivers_html) from one logged-in browser session."""
    from playwright.async_api import async_playwright

    waivers_url = BASE_URL + WAIVERS_PATH.format(league_id=league_id)
    auctions_url = BASE_URL + AUCTIONS_PATH.format(league_id=league_id)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await (await browser.new_context(user_agent=BROWSER_UA)).new_page()
        try:
            await login_to_fangraphs(page, waivers_url)
            if "/waivers" not in page.url:
                await page.goto(waivers_url, timeout=60000)
            if "/waivers" not in page.url:
                await save_debug_screenshot(page, "fa-market-waivers")
                raise RuntimeError(f"Waivers page redirected to {page.url} — not logged in?")
            await page.wait_for_selector("table", state="attached", timeout=30000)
            waivers_html = await page.content()
            await page.goto(auctions_url, timeout=60000)
            await page.wait_for_selector("table", state="attached", timeout=30000)
            auctions_html = await page.content()
        finally:
            await browser.close()
    return auctions_html, waivers_html


# ─── Writing ─────────────────────────────────────────────────────────────────


def resolve_player_ids(supabase, rows: list[MarketRow]) -> dict[str, str]:
    """player_key -> players.id for the handful of players on the market."""
    ids = sorted({r.ottoneu_id for r in rows})
    if not ids:
        return {}
    data = (
        supabase.table("players")
        .select("id, ottoneu_id, is_college")
        .in_("ottoneu_id", ids)
        .limit(999)  # pagination-safe: bounded by the few dozen players on the market
        .execute()
        .data
        or []
    )
    return {
        f"{'college' if r.get('is_college') else 'nfl'}:{r['ottoneu_id']}": str(r["id"])
        for r in data
    }


def replace_kind(supabase, league_id: int, kind: str, rows: list[dict]) -> None:
    """Upsert this kind's snapshot, then drop anyone no longer listed."""
    if rows:
        supabase.table(TABLE).upsert(rows, on_conflict="league_id,kind,player_key").execute()
    q = supabase.table(TABLE).delete().eq("league_id", league_id).eq("kind", kind)
    if rows:
        q = q.not_.in_("player_key", [r["player_key"] for r in rows])
    q.execute()


# ─── Entry point ─────────────────────────────────────────────────────────────


def _print(rows: list[MarketRow]) -> None:
    for r in rows:
        price = f"min ${r.min_bid}" if r.kind == "auction" else f"salary ${r.salary}"
        print(f"  {r.kind:7} {r.player_name:28} {r.position or '?':3} {price:12} ends {r.ends_at}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="Print rows; write nothing.")
    parser.add_argument("--auctions-file", help="Parse a saved auctions page instead of fetching.")
    parser.add_argument("--waivers-file", help="Parse a saved waivers page instead of fetching.")
    args = parser.parse_args(argv)

    now = datetime.now(timezone.utc).replace(microsecond=0)
    auctions_html: str | None = None
    waivers_html: str | None = None

    if args.auctions_file or args.waivers_file:
        if args.auctions_file:
            auctions_html = open(args.auctions_file, encoding="utf-8").read()
        if args.waivers_file:
            waivers_html = open(args.waivers_file, encoding="utf-8").read()
    elif have_credentials():
        auctions_html, waivers_html = asyncio.run(fetch_logged_in(LEAGUE_ID))
    else:
        print("FANGRAPHS_USERNAME/PASSWORD not set: reading public auctions only; "
              "waiver rows are left as they are.")
        auctions_html = fetch_auctions_public(LEAGUE_ID)

    scraped: dict[str, list[MarketRow]] = {}
    if auctions_html is not None:
        scraped["auction"] = parse_auctions(auctions_html, now)
        # Guard against a markup change reading as "no auctions": an empty table
        # still has its heading, a broken page does not.
        if not scraped["auction"] and "Active Auctions" not in auctions_html:
            print("Error: no 'Active Auctions' heading — page markup changed?")
            return 1
    if waivers_html is not None:
        scraped["waiver"] = parse_waivers(waivers_html)
        if not scraped["waiver"] and "Waiver Claims" not in waivers_html:
            print("Error: no 'Waiver Claims' heading — not logged in, or markup changed?")
            return 1

    for kind, rows in scraped.items():
        print(f"{len(rows)} {kind} row(s)")
        _print(rows)

    if args.dry_run:
        print("Dry run: nothing written.")
        return 0

    supabase = get_supabase_client()
    all_rows = [r for rows in scraped.values() for r in rows]
    player_ids = resolve_player_ids(supabase, all_rows)
    unmatched = [r.player_name for r in all_rows if r.player_key not in player_ids]
    if unmatched:
        print(f"No players row for: {', '.join(unmatched)} (stored with player_id NULL)")
    for kind, rows in scraped.items():
        replace_kind(supabase, LEAGUE_ID, kind, to_db_rows(rows, LEAGUE_ID, player_ids, now.isoformat()))
        print(f"Wrote {len(rows)} {kind} row(s) to {TABLE}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
