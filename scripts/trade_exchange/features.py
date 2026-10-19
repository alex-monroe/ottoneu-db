"""One row per trade: the exchange it made, from the buyer-of-now's side.

Inputs:

- ``.cache/trade_exchange/sides.json`` — written by
  ``web/scripts/export-trade-exchange.ts`` from the /trades valuation
  (``valueTrade``) and the rewound playoff odds (``web/lib/trade-exchange.ts``).
- The keeper outlooks (``outlook.load_outlooks``), read as of the trade's week.
- ``trades.approve_votes`` / ``veto_votes``.

Both sides of a trade see the same assets, so the two sides' nets are mirror
images: the trade is one observation. It is oriented so ``season_net ≥ 0`` —
the **buyer** took this-season value and the **seller** took the rest. When
the seller also took keeper value (``keeper_net`` of the buyer < 0) the trade
is an *exchange*: the buyer paid ``−keeper_net`` keeper dollars for
``season_net`` this-season dollars, a rate of ``rate = −keeper_net / season_net``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from scripts.config import LEAGUE_ID, MIN_PLAYER_SALARY, fetch_all_rows, get_supabase_client
from scripts.trade_exchange.outlook import CACHE as OUTLOOK_CACHE
from scripts.trade_exchange.outlook import OutlookBook, option_value

SIDES = OUTLOOK_CACHE.parent / "sides.json"
REGULAR_SEASON_WEEKS = 14

# A side must move at least this much of both kinds of value for the trade to
# say anything about a rate. Under it, the "rate" is the ratio of two
# rounding errors (a $1 swap of fringe players).
MIN_LEG = 5.0


def week_ends(season: int) -> list[date]:
    """Approximate fantasy-week end dates for a season with no stored schedule.

    Week 1 ends the Tuesday after the NFL opener (the Thursday after Labor
    Day), as it did in 2026 (2026-09-15, from ``league_matchups``) and 2025.
    """
    sept1 = date(season, 9, 1)
    labor_day = sept1 + timedelta(days=(7 - sept1.weekday()) % 7)
    first_end = labor_day + timedelta(days=8)
    return [first_end + timedelta(days=7 * k) for k in range(REGULAR_SEASON_WEEKS)]


def approx_week(at: str, season: int) -> tuple[int, float]:
    """(weeks finished before ``at``, share of the season left) — `weeksPlayedBefore` rules."""
    day = date.fromisoformat(at[:10])
    ends = week_ends(season)
    played = sum(1 for e in ends if e < day)
    left = sum(1 for e in ends if e >= day)
    return played, left / len(ends)


@dataclass
class KeeperLeg:
    value: float
    from_outlook: bool


def keeper_value(asset: dict, season: int, week: int, book: OutlookBook) -> KeeperLeg:
    """Option value at next salary, else the /trades point fallback."""
    q = book.as_of(asset.get("player_id"), season, week)
    if q is not None:
        return KeeperLeg(option_value(q, asset["next_salary"]), True)
    nv = asset.get("next_value")
    nv = asset.get("value") if nv is None else nv
    return KeeperLeg(max(0.0, (nv or 0.0) - asset["next_salary"]), False)


def load_sides(path: Path = SIDES) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"{path} missing — run `just trade-exchange` (it exports first)")
    return json.loads(path.read_text())["sides"]


def fetch_votes() -> dict[int, tuple[int | None, int | None]]:
    rows = fetch_all_rows(get_supabase_client(), "trades", "trade_id, approve_votes, veto_votes",
                          filters=[("eq", "league_id", LEAGUE_ID)], order_by="trade_id")
    return {int(r["trade_id"]): (r.get("approve_votes"), r.get("veto_votes")) for r in rows}


def count_removed() -> int:
    rows = fetch_all_rows(get_supabase_client(), "trades", "trade_id, status",
                          filters=[("eq", "league_id", LEAGUE_ID)], order_by="trade_id")
    return sum(1 for r in rows if r.get("status") == "removed")


def side_row(side: dict, book: OutlookBook) -> dict:
    season = side["season"]
    week, remaining, approx = side["as_of_week"], side["remaining"], False
    if week is None:
        week, remaining = approx_week(side["at"], season)
        approx = True
    full = lambda assets: sum(a["value"] if a["value"] is not None else MIN_PLAYER_SALARY for a in assets)
    season_full = full(side["got"]) - full(side["gave"])
    legs_got = [keeper_value(a, season, week, book) for a in side["got"]]
    legs_gave = [keeper_value(a, season, week, book) for a in side["gave"]]
    odds = side.get("odds") or {}
    return {
        "trade_key": side["trade_key"],
        "trade_id": side["ottoneu_trade_id"],
        "season": season,
        "at": side["at"],
        "as_of_week": week,
        "week_approx": approx,
        "remaining": remaining,
        "team": side["team"],
        "counterparty": side["counterparty"],
        "season_net": season_full * remaining,
        "keeper_net": sum(l.value for l in legs_got) - sum(l.value for l in legs_gave),
        "cap_net": side["cap_net"],
        "n_players": len(side["got"]) + len(side["gave"]),
        "outlook_coverage": (
            sum(l.from_outlook for l in legs_got + legs_gave) / max(1, len(legs_got) + len(legs_gave))
        ),
        "odds": odds.get("playoff_odds"),
        "rank": odds.get("rank"),
    }


def trade_rows(sides: list[dict], book: OutlookBook,
               votes: dict[int, tuple[int | None, int | None]] | None = None) -> pd.DataFrame:
    """One row per trade, oriented to the side that took this-season value."""
    per_side = pd.DataFrame([side_row(s, book) for s in sides])
    votes = votes or {}
    out = []
    for _, g in per_side.groupby("trade_key", sort=False):
        if len(g) != 2:
            continue
        a, b = g.iloc[0], g.iloc[1]
        buyer, seller = (a, b) if a["season_net"] >= b["season_net"] else (b, a)
        approve, veto = votes.get(int(buyer["trade_id"]), (None, None)) if pd.notna(buyer["trade_id"]) else (None, None)
        s, k = float(buyer["season_net"]), float(buyer["keeper_net"])
        exchange = s >= MIN_LEG and k <= -MIN_LEG
        out.append({
            "trade_key": buyer["trade_key"],
            "trade_id": buyer["trade_id"],
            "season": int(buyer["season"]),
            "at": buyer["at"],
            "as_of_week": int(buyer["as_of_week"]),
            "week_approx": bool(buyer["week_approx"]),
            "remaining": float(buyer["remaining"]),
            "buyer": buyer["team"],
            "seller": seller["team"],
            "season_net": s,
            "keeper_net": k,
            "exchange": exchange,
            "rate": -k / s if exchange else np.nan,
            "buyer_odds": buyer["odds"],
            "seller_odds": seller["odds"],
            # Both sides list the same players, so either side's share will do.
            "outlook_coverage": float(buyer["outlook_coverage"]),
            "approve_votes": approve,
            "veto_votes": veto,
        })
    return pd.DataFrame(out)
