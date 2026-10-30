"""Scrape the open free-agent market: active auctions and claimable waivers.

Usage:
    just scrape-fa-market                       # fetch both pages, write the table
    just scrape-fa-market --dry-run             # fetch and print, write nothing
    just scrape-fa-market --auctions-only       # public auctions page only, no login
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

  /football/{league}/auctions/<id>
                                PUBLIC, once the auction has closed. The
                                "Completed Auctions" table on /auctions links
                                each one: who started it, when it ended, and
                                every bid, highest first. A tie for the top bid goes
                                to the team lower in the standings (`break_ties`),
                                whatever order the page lists the tied bids in.

So the scrape logs in when FANGRAPHS_USERNAME / FANGRAPHS_PASSWORD are set
(`scripts/fangraphs_login.py`) and reads both pages in one browser session.
Without credentials — or with `--auctions-only`, which the every-few-minutes
Discord job uses — it reads the public auctions page over plain HTTP and leaves
the waiver rows alone, so a missing secret degrades to half a board rather than
none.

## Times

An auction row prints a countdown, not a clock time, so its end is
`scraped_at + countdown` — an absolute instant with no time zone to guess. A
waiver row prints the cut time on Ottoneu's site clock ("October 17, 2026 9:51
AM"); it is stored verbatim as `cut_at_local` (the same convention as `trades`
and `transactions`), and the claim deadline is that wall-clock time read in the
league's time zone (`nfl_week.LEAGUE_TZ`, US Eastern) plus WAIVER_CLAIM_HOURS.

## Writes

`fa_market`, one row per player currently up for auction or on waivers. Each
kind is a snapshot of its page: upsert what is listed, then delete what is no
longer listed. A kind that was not fetched this run is left untouched; the web
filters out rows whose `ends_at` has passed, so a stale row expires on its own.
Two values outlive a single scrape (`carry_over`): `first_seen_at`, which keys
the auction's Discord post, and `market_id`, which only a logged-in scrape sees.

`fa_auction_results`, one row per completed auction that ended in the last
RESULT_LOOKBACK_DAYS and is not stored yet — one extra page load each, so a
handful a day. These feed the "auction finished" Discord post.

Two page loads (plus a login) per logged-in run every few hours, and one page
load per `--auctions-only` run — well clear of the 429s the per-player card
scrape hits (#752).
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta, timezone

from bs4 import BeautifulSoup

from scripts.config import LEAGUE_ID, WAIVER_CLAIM_HOURS, get_supabase_client
from scripts.fangraphs_login import have_credentials, login_to_fangraphs, save_debug_screenshot
from scripts.nfl_week import LEAGUE_TZ
from scripts.ottoneu_http import BASE_URL, fetch_page

TABLE = "fa_market"
RESULTS_TABLE = "fa_auction_results"
AUCTIONS_PATH = "/football/{league_id}/auctions"
AUCTION_PATH = "/football/{league_id}/auctions/{auction_id}"
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
AUCTION_HREF_RE = re.compile(r"/auctions/(\d+)/?$")
TEAM_HREF_RE = re.compile(r"/team/(\d+)")
CUT_DATE_FORMAT = "%B %d, %Y %I:%M %p"
ENDED_DATE_FORMAT = "%b %d, %Y %I:%M %p"
# Completed auctions older than this (by site-clock date) are never fetched, so a
# first run reads a few days of results rather than the whole season's.
RESULT_LOOKBACK_DAYS = 2


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


@dataclass
class CompletedAuction:
    """A row of the 'Completed Auctions' table, filled in from its auction page."""
    auction_id: int
    ottoneu_id: int
    is_college: bool
    player_name: str
    nfl_team: str | None
    position: str | None
    salary: int | None              # the price paid, from the table
    ended_at_local: str             # Ottoneu site clock, ISO, no zone
    started_by_team_name: str | None = None
    winner_team_id: int | None = None
    winner_team_name: str | None = None
    bids: list[dict] = field(default_factory=list)  # highest first

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


def parse_ended_time(text: str) -> datetime | None:
    """'Oct 21, 2026 12:52 PM' -> naive datetime on the site clock."""
    try:
        return datetime.strptime(" ".join((text or "").split()), ENDED_DATE_FORMAT)
    except ValueError:
        return None


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
    """The first <table> after the <h1> whose text is `heading`.

    The completed table's heading carries the season ("2026 Completed
    Auctions"), so a heading may also match on its last words.
    """
    for h1 in soup.find_all("h1"):
        text = " ".join(h1.get_text(" ", strip=True).split())
        if text == heading or text.endswith(f" {heading}"):
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


def parse_completed_auctions(html: str) -> list[CompletedAuction]:
    """Rows of the '<season> Completed Auctions' table, newest first as listed.

    Only what the table prints; `parse_auction_page` adds the winner and bids.
    """
    soup = BeautifulSoup(html, "html.parser")
    table = _table_after_heading(soup, "Completed Auctions")
    if table is None or table.tbody is None:
        return []
    rows = []
    for tr in table.tbody.find_all("tr"):
        tds = tr.find_all("td", recursive=False)
        if len(tds) < 3:
            continue
        ident = _player_cell(tds[0])
        ended = parse_ended_time(tds[1].get_text(" ", strip=True))
        link = tds[2].find("a", href=AUCTION_HREF_RE)
        if ident is None or ended is None or link is None:
            continue
        salary = tds[0].find("span", class_="salary")
        ident.pop("injury_status")
        rows.append(CompletedAuction(
            auction_id=int(AUCTION_HREF_RE.search(link["href"]).group(1)),
            salary=parse_money(salary.get_text()) if salary else None,
            ended_at_local=ended.isoformat(),
            **ident,
        ))
    return rows


def parse_auction_page(html: str) -> dict:
    """Who started a completed auction and every bid on it, highest first.

    Returns {'started_by_team_name', 'bids': [{'team_id', 'team_name', 'amount'}]}.
    """
    soup = BeautifulSoup(html, "html.parser")
    started_by = None
    for h3 in soup.find_all("h3"):
        text = " ".join(h3.get_text(" ", strip=True).split())
        if text.startswith("Started by "):
            started_by = text.removeprefix("Started by ").strip() or None
            break
    bids = []
    table = soup.find("table")
    if table is not None and table.tbody is not None:
        for tr in table.tbody.find_all("tr"):
            tds = tr.find_all("td", recursive=False)
            if len(tds) < 2:
                continue
            link = tds[0].find("a", href=TEAM_HREF_RE)
            amount = parse_money(tds[1].get_text())
            if link is None or amount is None:
                continue
            bids.append({
                "team_id": int(TEAM_HREF_RE.search(link["href"]).group(1)),
                "team_name": " ".join(link.get_text(" ", strip=True).split()),
                "amount": amount,
            })
    bids.sort(key=lambda b: -b["amount"])
    return {"started_by_team_name": started_by, "bids": bids}


def results_to_fetch(
    completed: list[CompletedAuction], stored_ids: set[int], today_local: date,
    lookback_days: int = RESULT_LOOKBACK_DAYS,
) -> list[CompletedAuction]:
    """Completed auctions recent enough to fetch and not already stored."""
    cutoff = (today_local - timedelta(days=lookback_days)).isoformat()
    return [c for c in completed if c.ended_at_local[:10] >= cutoff and c.auction_id not in stored_ids]


def standings_order(games: list[dict]) -> list[int]:
    """Team ids best first, from `league_matchups` rows (see `web/lib/standings.ts`).

    The league's order: wins, then points for. Only final regular-season games
    count. Uses the latest season with a decided game, so before the first game
    of a season is final the previous season's final standings stand.
    """
    decided = [
        g for g in games
        if g.get("game_type") == "regular" and g.get("status") == "final"
        and g.get("home_score") is not None and g.get("away_score") is not None
    ]
    if not decided:
        return []
    season = max(g["season"] for g in decided)
    tally: dict[int, dict] = {}
    for g in games:
        if g["season"] != season:
            continue
        for side in ("home", "away"):
            tally.setdefault(g[f"{side}_team_id"], {"wins": 0, "pf": 0.0, "name": g[f"{side}_team_name"]})
    for g in decided:
        if g["season"] != season:
            continue
        hs, as_ = float(g["home_score"]), float(g["away_score"])
        tally[g["home_team_id"]]["pf"] += hs
        tally[g["away_team_id"]]["pf"] += as_
        if hs > as_:
            tally[g["home_team_id"]]["wins"] += 1
        elif as_ > hs:
            tally[g["away_team_id"]]["wins"] += 1
    return sorted(tally, key=lambda t: (-tally[t]["wins"], -tally[t]["pf"], tally[t]["name"]))


def break_ties(bids: list[dict], standings: list[int]) -> list[dict] | None:
    """`bids` (highest first) with a tie for the top bid settled, or None if it can't be.

    Ottoneu breaks a tied auction in reverse standings order: of the teams tied
    for the top bid, the one lowest in the standings wins. The auction page lists
    tied bids in no meaningful order, so the first row is not the winner (#19:
    Eli Raridon, /auctions/66346). Returns the bids with the winner moved first,
    or None when the tied teams are not all in `standings`.
    """
    if len(bids) < 2 or bids[0]["amount"] != bids[1]["amount"]:
        return bids
    top = [b for b in bids if b["amount"] == bids[0]["amount"]]
    if any(b["team_id"] not in standings for b in top):
        return None
    top.sort(key=lambda b: -standings.index(b["team_id"]))
    return top + bids[len(top):]


def with_auction_page(c: CompletedAuction, page: dict, standings: list[int] | None = None) -> CompletedAuction:
    """`c` plus who started it, the bids, and the winner.

    The winner is the highest bid, with a tie settled by `break_ties`. A tie that
    `standings` cannot settle leaves no winner, so the result is not stored.
    """
    bids = break_ties(page["bids"], standings or [])
    if bids is None:
        bids, top = page["bids"], None
    else:
        top = bids[0] if bids else None
    return CompletedAuction(**{
        **asdict(c),
        "started_by_team_name": page["started_by_team_name"],
        "bids": bids,
        "winner_team_id": top["team_id"] if top else None,
        "winner_team_name": top["team_name"] if top else None,
    })


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


def carry_over(rows: list[dict], existing: dict[str, dict]) -> list[dict]:
    """Keep what an earlier scrape knew that this one cannot see.

    `existing` maps player_key -> the stored row's {first_seen_at, market_id}.
    A row seen before keeps its `first_seen_at` (the auction's Discord key); a
    new one is first seen now. A public scrape cannot see `market_id`, so it
    keeps the logged-in scrape's rather than blanking it.
    """
    out = []
    for r in rows:
        prev = existing.get(r["player_key"]) or {}
        out.append({
            **r,
            "first_seen_at": prev.get("first_seen_at") or r["scraped_at"],
            "market_id": r.get("market_id") or prev.get("market_id"),
        })
    return out


def result_db_rows(results: list[CompletedAuction], league_id: int, player_ids: dict[str, str],
                   scraped_at: str) -> list[dict]:
    out = []
    for c in results:
        d = asdict(c)
        d.update(
            league_id=league_id,
            player_key=c.player_key,
            player_id=player_ids.get(c.player_key),
            scraped_at=scraped_at,
        )
        out.append(d)
    return out


# ─── Fetching ────────────────────────────────────────────────────────────────


def fetch_auctions_public(league_id: int) -> str:
    return fetch_page(AUCTIONS_PATH.format(league_id=league_id), USER_AGENT)


def fetch_auction_page(league_id: int, auction_id: int) -> str:
    return fetch_page(AUCTION_PATH.format(league_id=league_id, auction_id=auction_id), USER_AGENT)


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


def resolve_player_ids(supabase, rows: list[MarketRow | CompletedAuction]) -> dict[str, str]:
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


def fetch_existing(supabase, league_id: int, kind: str) -> dict[str, dict]:
    """player_key -> {first_seen_at, market_id} for this kind's stored rows."""
    data = (
        supabase.table(TABLE)
        .select("player_key, first_seen_at, market_id")
        .eq("league_id", league_id)
        .eq("kind", kind)
        .limit(999)  # pagination-safe: a snapshot of the few dozen players on the market
        .execute()
        .data
        or []
    )
    return {r["player_key"]: r for r in data}


def fetch_standings(supabase, league_id: int) -> list[int]:
    """Team ids best first, for breaking tied auctions (`standings_order`)."""
    games = (
        supabase.table("league_matchups")
        .select("season, game_id, home_team_id, home_team_name, home_score, "
                "away_team_id, away_team_name, away_score, status, game_type")
        .eq("league_id", league_id)
        .order("season", desc=True)
        .order("game_id")
        .limit(400)  # pagination-safe: a league-season is ~90 games, so this spans two
        .execute()
        .data
        or []
    )
    return standings_order(games)


def fetch_stored_result_ids(supabase, league_id: int, auction_ids: list[int]) -> set[int]:
    if not auction_ids:
        return set()
    data = (
        supabase.table(RESULTS_TABLE)
        .select("auction_id")
        .eq("league_id", league_id)
        .in_("auction_id", auction_ids)  # pagination-safe: bounded by the ids asked about
        .execute()
        .data
        or []
    )
    return {r["auction_id"] for r in data}


def replace_kind(supabase, league_id: int, kind: str, rows: list[dict]) -> None:
    """Upsert this kind's snapshot, then drop anyone no longer listed."""
    rows = carry_over(rows, fetch_existing(supabase, league_id, kind))
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
    parser.add_argument("--auctions-only", action="store_true",
                        help="Read only the public auctions page over plain HTTP (no login, no waivers).")
    args = parser.parse_args(argv)

    now = datetime.now(timezone.utc).replace(microsecond=0)
    auctions_html: str | None = None
    waivers_html: str | None = None

    if args.auctions_file or args.waivers_file:
        if args.auctions_file:
            auctions_html = open(args.auctions_file, encoding="utf-8").read()
        if args.waivers_file:
            waivers_html = open(args.waivers_file, encoding="utf-8").read()
    elif have_credentials() and not args.auctions_only:
        auctions_html, waivers_html = asyncio.run(fetch_logged_in(LEAGUE_ID))
    else:
        if not args.auctions_only:
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

    completed = parse_completed_auctions(auctions_html) if auctions_html is not None else []

    for kind, rows in scraped.items():
        print(f"{len(rows)} {kind} row(s)")
        _print(rows)

    supabase = None if args.dry_run else get_supabase_client()
    # Results need a page load each, so only recent ones not already stored.
    stored = fetch_stored_result_ids(supabase, LEAGUE_ID, [c.auction_id for c in completed]) if supabase else set()
    due = results_to_fetch(completed, stored, now.astimezone(LEAGUE_TZ).date())
    # Ties go to the team lower in the standings; a dry run has no DB to read them
    # from, so a tied auction there prints as unresolved.
    standings = fetch_standings(supabase, LEAGUE_ID) if supabase and due else []
    results = []
    for c in due:
        try:
            result = with_auction_page(c, parse_auction_page(fetch_auction_page(LEAGUE_ID, c.auction_id)), standings)
        except Exception as e:  # noqa: BLE001 - one bad page must not sink the snapshot; next run retries
            print(f"Warning: auction {c.auction_id} ({c.player_name}) page failed: {e}")
            continue
        # Every auction has at least the nominating bid, so no bids means the page
        # did not parse. Leave it unstored and the next run tries again.
        if result.winner_team_name is None:
            why = "has a tied top bid the standings cannot break" if result.bids else "page listed no bids"
            print(f"Warning: auction {c.auction_id} ({c.player_name}) {why} — will retry.")
            continue
        results.append(result)
    for r in results:
        print(f"  result  {r.player_name:28} ${r.salary} to {r.winner_team_name} "
              f"({len(r.bids)} bid(s)), ended {r.ended_at_local}")

    if args.dry_run:
        print("Dry run: nothing written.")
        return 0

    all_rows = [r for rows in scraped.values() for r in rows]
    player_ids = resolve_player_ids(supabase, [*all_rows, *results])
    unmatched = [r.player_name for r in all_rows if r.player_key not in player_ids]
    if unmatched:
        print(f"No players row for: {', '.join(unmatched)} (stored with player_id NULL)")
    for kind, rows in scraped.items():
        replace_kind(supabase, LEAGUE_ID, kind, to_db_rows(rows, LEAGUE_ID, player_ids, now.isoformat()))
        print(f"Wrote {len(rows)} {kind} row(s) to {TABLE}.")
    if results:
        supabase.table(RESULTS_TABLE).upsert(
            result_db_rows(results, LEAGUE_ID, player_ids, now.isoformat()), on_conflict="league_id,auction_id"
        ).execute()
        print(f"Wrote {len(results)} completed auction(s) to {RESULTS_TABLE}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
