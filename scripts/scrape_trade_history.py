"""Scrape the league's trade history into `trades` + `trade_assets`.

Usage:
    just scrape-trades                     # fetch, then write
    just scrape-trades --dry-run
    just scrape-trades --no-details        # list page only (no per-trade fetches)
    just scrape-trades --file trade_history.html --dry-run

Two public pages, no browser and no login (see scripts/ottoneu_http.py for why an
honest User-Agent is what gets through Cloudflare):

  /football/{league}/trade_history    every accepted trade: when it was accepted,
                                      both sides (players with salaries, plus any
                                      "Loan: $N"), and the status — "Processed"
                                      or "Awaiting League Approval"
  /football/{league}/view_trade/{id}  one trade: when it was *processed*, the
                                      approve/veto count, and each player's NFL
                                      team and position

## Reading a side

Each side's cell lists what **that team gives up**. "Loan: $18" under The Triple
Helix means Triple Helix lends $18 of cap to the other side — the view_trade page
says so outright ("The Triple Helix gives up … Loan $18", and its "Cap available
will change by" line nets the loan out).

## What the list does not show

The list holds accepted trades only. A pending trade that is vetoed or withdrawn
simply disappears from it, so a stored `pending` trade that is no longer listed
is marked `removed` — the page does not say which of the two happened.

The list is not paginated and only reaches back so far (September 2025 when this
was written); older trades survive only as player-card `move` rows in
`transactions`, which web/lib/trades.ts merges in.

## Request budget

The list is one request. A view_trade page is fetched only for a trade that is
new, still pending, or missing its processed time — so a daily run is usually
one or two requests, paced a second apart.
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

from scripts.config import LEAGUE_ID, fetch_all_rows, get_supabase_client
from scripts.ottoneu_http import CloudflareBlockedError, GatedPageError, fetch_page

USER_AGENT = "ottoneu-db-trades/1.0 (+https://github.com/alex-monroe/ottoneu-db)"
LIST_PATH = "/football/{league_id}/trade_history"
DETAIL_PATH = "/football/{league_id}/view_trade/{trade_id}"
REQUEST_PAUSE_SECONDS = 1.0

STATUS_PENDING = "pending"
STATUS_PROCESSED = "processed"
STATUS_REMOVED = "removed"

_TRADE_ID_RE = re.compile(r"/view_trade/(\d+)")
_TEAM_ID_RE = re.compile(r"/team/(\d+)")
_PLAYER_RE = re.compile(r"/player_card/(nfl|college)/(\d+)")
_DOLLARS_RE = re.compile(r"\$\s*(-?\d+)")
_LOAN_RE = re.compile(r"Loan:?\s*\$\s*(\d+)", re.IGNORECASE)
# "Processed on October 14, 2026 6:32 AM" on a processed trade; a pending one
# says "Will be processed on October 16, 2026 8:45 PM" instead.
_PROCESSED_RE = re.compile(r"processed on\s+(.+)", re.IGNORECASE)
_VETOED_RE = re.compile(r"(\d+)\s+vetoed", re.IGNORECASE)
_APPROVED_RE = re.compile(r"(\d+)\s+approved", re.IGNORECASE)
_BR_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)

# Ottoneu status label -> trades.status. Anything else is kept verbatim in
# status_label and treated as pending: an unknown word is far likelier to be a
# new flavour of "not done yet" than a new kind of completion.
_STATUS_BY_LABEL = {
    "processed": STATUS_PROCESSED,
    "awaiting league approval": STATUS_PENDING,
}


class TradeHistoryParseError(RuntimeError):
    """Raised when the trade history page cannot be understood at all."""


@dataclass
class TradeAsset:
    asset_type: str               # 'player' | 'loan'
    amount: int                   # salary, or loan size
    ottoneu_id: int | None = None
    is_college: bool | None = None
    player_name: str | None = None

    @property
    def asset_key(self) -> str:
        if self.asset_type == "loan":
            return "loan"
        return f"{'college' if self.is_college else 'nfl'}:{self.ottoneu_id}"


@dataclass
class TradeSide:
    team_id: int | None
    team_name: str
    gives: list[TradeAsset] = field(default_factory=list)


@dataclass
class ParsedTrade:
    trade_id: int
    accepted_at: str               # ISO, Ottoneu site clock
    status: str
    status_label: str
    offered_by: TradeSide
    offered_to: TradeSide


@dataclass
class TradeDetail:
    processed_at: str | None
    approve_votes: int | None
    veto_votes: int | None
    # asset_key -> (nfl_team, position)
    player_info: dict[str, tuple[str | None, str | None]]


# ─── Parsing ─────────────────────────────────────────────────────────────────


def parse_ottoneu_datetime(text: str) -> str | None:
    """'October 14, 2026 8:45 PM' -> '2026-10-14T20:45:00' (site clock)."""
    cleaned = " ".join(text.split())
    for fmt in ("%B %d, %Y %I:%M %p", "%b %d, %Y %I:%M %p", "%B %d, %Y"):
        try:
            return datetime.strptime(cleaned, fmt).isoformat()
        except ValueError:
            continue
    return None


def _status_from_label(label: str) -> str:
    return _STATUS_BY_LABEL.get(label.strip().lower(), STATUS_PENDING)


def parse_side(td) -> TradeSide | None:
    """One side's cell: the team link, then one `<br />`-separated line per asset.

    A player line is the player-card link followed (after any injury badge and
    news icon) by " $16". A loan line is the bare text "Loan: $82".
    """
    team_link = td.find("a", href=_TEAM_ID_RE)
    if team_link is None:
        return None
    team_id_match = _TEAM_ID_RE.search(team_link["href"])
    side = TradeSide(
        team_id=int(team_id_match.group(1)) if team_id_match else None,
        team_name=team_link.get_text(strip=True),
    )

    segments = _BR_RE.split(td.decode_contents())
    for segment in segments[1:]:
        fragment = BeautifulSoup(segment, "html.parser")
        text = fragment.get_text(" ", strip=True)
        if not text:
            continue
        player_link = next(
            (a for a in fragment.find_all("a", href=_PLAYER_RE)
             if "recent-news" not in (a.get("class") or [])),
            None,
        )
        if player_link is not None:
            level, ottoneu_id = _PLAYER_RE.search(player_link["href"]).groups()
            amounts = _DOLLARS_RE.findall(text)
            side.gives.append(TradeAsset(
                asset_type="player",
                amount=int(amounts[-1]) if amounts else 0,
                ottoneu_id=int(ottoneu_id),
                is_college=level == "college",
                player_name=player_link.get_text(strip=True),
            ))
            continue
        loan = _LOAN_RE.search(text)
        if loan:
            side.gives.append(TradeAsset(asset_type="loan", amount=int(loan.group(1))))
    return side


def parse_trade_history(html: str) -> list[ParsedTrade]:
    """Every trade on the /trade_history page, newest first as the page lists them."""
    soup = BeautifulSoup(html, "html.parser")
    rows = [
        tr for tr in soup.select("table tbody tr")
        if tr.find("a", href=_TRADE_ID_RE)
    ]
    if not rows and "Trade History" not in soup.get_text():
        raise TradeHistoryParseError(
            "No trade table and no 'Trade History' header — the league may be "
            "private, or the page markup changed."
        )

    trades: list[ParsedTrade] = []
    for tr in rows:
        cells = tr.find_all("td", recursive=False)
        if len(cells) < 4:
            continue
        link = cells[0].find("a", href=_TRADE_ID_RE)
        accepted_at = parse_ottoneu_datetime(link.get_text(" ", strip=True))
        offered_by = parse_side(cells[1])
        offered_to = parse_side(cells[2])
        if accepted_at is None or offered_by is None or offered_to is None:
            continue
        label = cells[3].get_text(" ", strip=True)
        trades.append(ParsedTrade(
            trade_id=int(_TRADE_ID_RE.search(link["href"]).group(1)),
            accepted_at=accepted_at,
            status=_status_from_label(label),
            status_label=label,
            offered_by=offered_by,
            offered_to=offered_to,
        ))
    return trades


def parse_trade_detail(html: str) -> TradeDetail:
    """The processed (or scheduled) time, vote count and each player's NFL team
    and position."""
    soup = BeautifulSoup(html, "html.parser")
    status = soup.select_one("header.trade-status")

    processed_at = None
    approve = veto = None
    if status is not None:
        for heading in status.find_all(["h2", "h4"]):
            match = _PROCESSED_RE.search(heading.get_text(" ", strip=True))
            if match:
                processed_at = parse_ottoneu_datetime(match.group(1))
                break
        votes = status.get_text(" ", strip=True)
        veto_match = _VETOED_RE.search(votes)
        approve_match = _APPROVED_RE.search(votes)
        veto = int(veto_match.group(1)) if veto_match else None
        approve = int(approve_match.group(1)) if approve_match else None

    player_info: dict[str, tuple[str | None, str | None]] = {}
    for link in soup.find_all("a", href=_PLAYER_RE):
        if "recent-news" in (link.get("class") or []):
            continue
        level, ottoneu_id = _PLAYER_RE.search(link["href"]).groups()
        label = link.find_next_sibling("span", class_="smaller")
        nfl_team = position = None
        if label is not None:
            parts = label.get_text(" ", strip=True).split()
            if len(parts) >= 2:
                nfl_team, position = parts[0], parts[-1]
            elif parts:
                position = parts[0]
        player_info[f"{level}:{ottoneu_id}"] = (nfl_team, position)

    return TradeDetail(processed_at, approve, veto, player_info)


# ─── Shaping ─────────────────────────────────────────────────────────────────


def trade_row(trade: ParsedTrade, league_id: int, detail: TradeDetail | None,
              existing: dict | None, now: str) -> dict:
    """A `trades` row. Keeps what an earlier run learned that this run did not."""
    existing = existing or {}
    processed_at = detail.processed_at if detail else existing.get("processed_at")
    return {
        "league_id": league_id,
        "trade_id": trade.trade_id,
        "season": int(trade.accepted_at[:4]),
        "accepted_at": trade.accepted_at,
        "processed_at": processed_at,
        "status": trade.status,
        "status_label": trade.status_label,
        "offered_by_team_id": trade.offered_by.team_id,
        "offered_by_team_name": trade.offered_by.team_name,
        "offered_to_team_id": trade.offered_to.team_id,
        "offered_to_team_name": trade.offered_to.team_name,
        "approve_votes": detail.approve_votes if detail else existing.get("approve_votes"),
        "veto_votes": detail.veto_votes if detail else existing.get("veto_votes"),
        "scraped_at": now,
    }


def asset_rows(trade: ParsedTrade, league_id: int, detail: TradeDetail | None,
               player_ids: dict[tuple[int, bool], str], now: str) -> list[dict]:
    """`trade_assets` rows: everything each side gives up, to the other side."""
    rows: list[dict] = []
    pairs = ((trade.offered_by, trade.offered_to), (trade.offered_to, trade.offered_by))
    for giver, receiver in pairs:
        for asset in giver.gives:
            nfl_team = position = None
            if detail and asset.asset_type == "player":
                nfl_team, position = detail.player_info.get(asset.asset_key, (None, None))
            player_id = None
            if asset.asset_type == "player":
                player_id = player_ids.get((asset.ottoneu_id, bool(asset.is_college)))
            rows.append({
                "league_id": league_id,
                "trade_id": trade.trade_id,
                "asset_key": asset.asset_key,
                "asset_type": asset.asset_type,
                "from_team_id": giver.team_id,
                "from_team_name": giver.team_name,
                "to_team_id": receiver.team_id,
                "to_team_name": receiver.team_name,
                "ottoneu_id": asset.ottoneu_id,
                "is_college": asset.is_college,
                "player_id": player_id,
                "player_name": asset.player_name,
                "position": position,
                "nfl_team": nfl_team,
                "amount": asset.amount,
                "scraped_at": now,
            })
    return rows


def needs_detail(trade: ParsedTrade, existing: dict | None) -> bool:
    """Fetch view_trade only when it can tell us something new."""
    if existing is None:
        return True
    if trade.status == STATUS_PENDING:
        return True  # votes move while it is pending
    return trade.status == STATUS_PROCESSED and not existing.get("processed_at")


def removed_trade_ids(existing: dict[int, dict], listed: set[int]) -> list[int]:
    """Stored pending trades that are no longer on the page — vetoed or withdrawn."""
    return sorted(
        trade_id for trade_id, row in existing.items()
        if row.get("status") == STATUS_PENDING and trade_id not in listed
    )


def build_player_id_map(players: list[dict]) -> dict[tuple[int, bool], str]:
    """(ottoneu_id, is_college) -> players.id. College and NFL ids are separate
    namespaces on Ottoneu, so the flag is part of the key."""
    out: dict[tuple[int, bool], str] = {}
    for p in players:
        ottoneu_id = p.get("ottoneu_id") or 0
        if ottoneu_id > 0:
            out[(ottoneu_id, bool(p.get("is_college")))] = p["id"]
    return out


def describe(trade: ParsedTrade) -> str:
    def side(s: TradeSide) -> str:
        items = [
            f"Loan ${a.amount}" if a.asset_type == "loan" else f"{a.player_name} ${a.amount}"
            for a in s.gives
        ]
        return f"{s.team_name} gives {', '.join(items) or 'nothing'}"
    return (f"#{trade.trade_id} {trade.accepted_at[:16]} [{trade.status}] "
            f"{side(trade.offered_by)} | {side(trade.offered_to)}")


# ─── Fetching + writing ──────────────────────────────────────────────────────


def fetch_list_html(league_id: int, cookie: str | None = None) -> str:
    return fetch_page(LIST_PATH.format(league_id=league_id), USER_AGENT, cookie=cookie)


def fetch_detail_html(league_id: int, trade_id: int, cookie: str | None = None) -> str:
    return fetch_page(DETAIL_PATH.format(league_id=league_id, trade_id=trade_id),
                      USER_AGENT, cookie=cookie)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape Ottoneu trade history into trades + trade_assets."
    )
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse and print without writing to the database.")
    parser.add_argument("--no-details", action="store_true",
                        help="Skip the per-trade view_trade fetches.")
    parser.add_argument("--cookie", help="Raw Cookie header (or set OTTONEU_COOKIE).")
    parser.add_argument("--file", help="Parse a saved trade_history page instead of fetching.")
    args = parser.parse_args()

    try:
        if args.file:
            with open(args.file, encoding="utf-8") as handle:
                html = handle.read()
        else:
            print(f"Scraping {LIST_PATH.format(league_id=args.league_id)}")
            html = fetch_list_html(args.league_id, cookie=args.cookie)
        trades = parse_trade_history(html)
    except (requests.RequestException, CloudflareBlockedError, GatedPageError, OSError,
            TradeHistoryParseError) as exc:
        print(f"Trade history failed: {exc}", file=sys.stderr)
        sys.exit(1)

    pending = sum(t.status == STATUS_PENDING for t in trades)
    loans = sum(a.asset_type == "loan" for t in trades
                for a in t.offered_by.gives + t.offered_to.gives)
    print(f"Parsed {len(trades)} trades ({pending} pending, {loans} with a loan)")
    for trade in trades:
        print(f"  {describe(trade)}")

    supabase = None if args.dry_run else get_supabase_client()
    existing: dict[int, dict] = {}
    player_ids: dict[tuple[int, bool], str] = {}
    if supabase is not None:
        for row in fetch_all_rows(supabase, "trades",
                                  "trade_id, status, processed_at, approve_votes, veto_votes",
                                  filters=[("eq", "league_id", args.league_id)],
                                  order_by="trade_id"):
            existing[row["trade_id"]] = row
        player_ids = build_player_id_map(
            fetch_all_rows(supabase, "players", "id, ottoneu_id, is_college"))

    details: dict[int, TradeDetail] = {}
    if not args.no_details and not args.file:
        to_fetch = [t for t in trades if needs_detail(t, existing.get(t.trade_id))]
        print(f"Fetching {len(to_fetch)} trade detail page(s)")
        for i, trade in enumerate(to_fetch):
            if i:
                time.sleep(REQUEST_PAUSE_SECONDS)
            try:
                details[trade.trade_id] = parse_trade_detail(
                    fetch_detail_html(args.league_id, trade.trade_id, cookie=args.cookie))
            except (requests.RequestException, CloudflareBlockedError, GatedPageError) as exc:
                # A missing detail costs a processed time and positions, not the
                # trade itself — keep going.
                print(f"  warning: trade {trade.trade_id} detail failed: {exc}",
                      file=sys.stderr)

    now = datetime.now(timezone.utc).isoformat()
    trade_rows = [
        trade_row(t, args.league_id, details.get(t.trade_id), existing.get(t.trade_id), now)
        for t in trades
    ]
    assets = [
        row for t in trades
        for row in asset_rows(t, args.league_id, details.get(t.trade_id), player_ids, now)
    ]
    removed = removed_trade_ids(existing, {t.trade_id for t in trades})

    if supabase is None:
        print(f"Dry run — would upsert {len(trade_rows)} trades, {len(assets)} assets, "
              f"and mark {len(removed)} removed.")
        return

    if trade_rows:
        supabase.table("trades").upsert(
            trade_rows, on_conflict="league_id,trade_id").execute()
    if assets:
        supabase.table("trade_assets").upsert(
            assets, on_conflict="league_id,trade_id,asset_key").execute()
    if removed:
        (supabase.table("trades")
         .update({"status": STATUS_REMOVED, "scraped_at": now})
         .eq("league_id", args.league_id)
         .in_("trade_id", removed)
         .execute())
        print(f"Marked {len(removed)} no-longer-listed pending trade(s) removed: {removed}")
    print(f"Upserted {len(trade_rows)} trades and {len(assets)} assets "
          f"for league {args.league_id}.")


if __name__ == "__main__":
    main()
