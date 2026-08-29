"""Reconcile ``league_prices`` from an Ottoneu ``/csv/rosters`` export.

The Playwright roster scrape (``scripts/tasks/scrape_roster.py``) is served a
Cloudflare bot challenge from datacenter IPs, so it silently freezes
``league_prices`` when it fails. The official CSV export
(``/football/{id}/csv/rosters``) is a lighter-weight source of the same
*current-roster* state — team ownership and salary — fetchable with a plain
HTTP GET. This module fetches (or reads) that CSV and reconciles it into
``league_prices`` for one league:

  * **rostered players**   → upsert ``team_name`` + ``price``
  * **owned-but-absent**   → cut to ``FA`` at the ``$1`` placeholder price
  * **new players**        → adopt a matching prospect record, else create one

With ``--infer-transactions`` it also writes a ``transactions`` row for each
detected cut / trade / add, dated the run day (accurate for a *daily* run since
diffs are caught same-day). The unique constraint makes re-runs idempotent.

**Limitations.** The CSV lists ONLY current rostered players — no free agents
and no transaction history. It cannot populate the FA universe or FA average
salaries, and it is NOT a full replacement for the search-page scrape +
player-card history. (Unlike the Playwright search-page scrape, the CSV endpoint
itself is reachable from datacenter IPs incl. GitHub-hosted runners — as long as
you send an honest User-Agent and don't impersonate a browser; see
``fetch_roster_csv``.) See ``docs/references/roster-csv-reconciliation.md``.

Usage::

    python scripts/reconcile_roster.py                       # fetch + dry-run
    python scripts/reconcile_roster.py --apply               # fetch + write
    python scripts/reconcile_roster.py --file roster.csv --apply --infer-transactions
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta

import requests
from dotenv import load_dotenv

from scripts.config import (
    LEAGUE_ID,
    fetch_all_rows,
    get_supabase_client,
)
from scripts.prospect_adopt import choose_prospect_to_adopt
from scripts.transaction_dedupe import INFERRED_MARKER, SUPERSEDE_WINDOW_DAYS

ROSTER_CSV_URL_TEMPLATE = "https://ottoneu.fangraphs.com/football/{league_id}/csv/rosters"

# An HONEST, descriptive User-Agent. Counter-intuitively, this endpoint is served by
# Cloudflare's *interactive* challenge (403 "Just a moment…") when a request spoofs a
# real browser UA (a "Chrome" claim with none of a browser's TLS/JS fingerprint reads
# as a bot), but a plain automated client — curl's default, python-requests, or a
# descriptive tool UA like this — passes straight through with a 200, from datacenter
# IPs (incl. GitHub-hosted runners) included. So do NOT impersonate a browser here.
USER_AGENT = "ottoneu-db-roster-csv/1.0 (+https://github.com/alex-monroe/ottoneu-db)"

# Absent-from-CSV owned players become free agents. The DB represents FAs with
# team_name="FA"; 958/1032 existing FA rows carry the $1 placeholder price (the
# CSV can never supply an FA average salary), so cuts land there too.
FA_TEAM = "FA"
FA_PLACEHOLDER_PRICE = 1
_FA_LABELS = {"", "FA", "Free Agent"}

# Stamped into `raw_description` so a row inferred here is distinguishable from
# one the player-card scrape recorded with a real timestamp — both on re-read
# (web/lib/mcp/transactions.ts) and when deduping the next run's inferences.
# Shared with the post-scrape purge (scripts/transaction_dedupe.py).
_INFERRED_MARKER = INFERRED_MARKER

# How far back to look for a card-scraped copy of a move before inferring it.
# Wide enough to cover a lagging or failed card-scrape run, narrow enough that a
# genuine repeat (add → cut → re-add at the same price) is not swallowed.
TXN_DEDUPE_LOOKBACK_DAYS = SUPERSEDE_WINDOW_DAYS

# Safety floor: refuse to apply a suspiciously small CSV (a truncated/garbled
# fetch must never mass-cut real rosters). A real league is ~12 teams / 150+ rows.
MIN_ROSTER_ROWS = 20
MIN_TEAMS = 2

_NON_DIGIT = re.compile(r"[^\d]")

# Cloudflare interstitial / challenge markers seen on a blocked datacenter fetch.
_CF_MARKERS = ("Just a moment", "cf-chl", "Enable JavaScript and cookies to continue",
               "Attention Required")


class CloudflareBlockedError(RuntimeError):
    """Raised when the CSV endpoint returns a Cloudflare challenge instead of data."""


@dataclass(frozen=True)
class RosterRow:
    ottoneu_id: int
    name: str
    position: str
    nfl_team: str | None
    is_college: bool
    team: str
    price: int


@dataclass
class Event:
    """A detected roster move, used to build an inferred transaction row."""
    kind: str            # "cut" | "trade" | "add"
    player_id: str | None
    name: str
    team: str | None     # destination team ("" / None for a cut)
    from_team: str | None  # source team (cut/trade); None for add
    salary: int


@dataclass
class Reconciliation:
    # (RosterRow, player_dict, existing_price_or_None) — team differs (trade/add)
    ownership_changes: list = field(default_factory=list)
    # (RosterRow, player_dict, existing_price) — same team, price differs
    price_changes: list = field(default_factory=list)
    cuts: list = field(default_factory=list)      # existing price dicts, owned & absent
    creates: list = field(default_factory=list)   # RosterRows with no players record
    unchanged: int = 0


def _clean_price(text: str) -> int:
    digits = _NON_DIGIT.sub("", text or "")
    return int(digits) if digits else 0


def parse_roster_csv(text: str) -> list[RosterRow]:
    """Parse the ``/csv/rosters`` export into ``RosterRow`` records.

    Columns: Team ID, Team Name, Player ID, Pro Player, Player Name, Pro Team,
    Position(s), Salary. College players carry a class-year suffix on Pro Team
    ("OSU JR") which is stripped to the bare team code ("OSU") to match how the
    scraper stores ``players.nfl_team``.
    """
    rows: list[RosterRow] = []
    for r in csv.DictReader(io.StringIO(text)):
        pid = (r.get("Player ID") or "").strip()
        if not pid.isdigit():
            continue
        is_college = (r.get("Pro Player") or "").strip().lower() == "false"
        pro_team = (r.get("Pro Team") or "").strip()
        nfl_team = pro_team.split()[0] if (is_college and pro_team) else (pro_team or None)
        rows.append(RosterRow(
            ottoneu_id=int(pid),
            name=(r.get("Player Name") or "").strip(),
            position=(r.get("Position(s)") or "").strip(),
            nfl_team=nfl_team,
            is_college=is_college,
            team=(r.get("Team Name") or "").strip(),
            price=_clean_price(r.get("Salary", "")),
        ))
    return rows


def fetch_roster_csv(league_id: int = LEAGUE_ID, cookie: str | None = None,
                     timeout: int = 30) -> str:
    """GET the roster CSV, raising a clear error on a Cloudflare block or redirect.

    Sends an honest, descriptive ``USER_AGENT`` — spoofing a browser UA is what
    triggers Cloudflare's challenge on this endpoint, so we deliberately don't.
    ``cookie`` (or the ``OTTONEU_COOKIE`` env var) is an optional escape hatch: a
    raw ``Cookie`` header to reuse a browser session, only needed if Cloudflare
    ever tightens the rule for plain clients.
    """
    url = ROSTER_CSV_URL_TEMPLATE.format(league_id=league_id)
    headers = {"User-Agent": USER_AGENT, "Accept": "text/csv, */*"}
    cookie = cookie or os.getenv("OTTONEU_COOKIE")
    if cookie:
        headers["Cookie"] = cookie

    resp = requests.get(url, headers=headers, timeout=timeout, allow_redirects=False)
    body = resp.text or ""

    if resp.status_code == 403 or any(m in body for m in _CF_MARKERS):
        raise CloudflareBlockedError(
            f"Cloudflare blocked the CSV fetch (HTTP {resp.status_code}) for league "
            f"{league_id}. The endpoint 403s from datacenter IPs (incl. GitHub-hosted "
            "runners). Run from a residential IP, or supply a valid session via the "
            "OTTONEU_COOKIE secret (captured on a machine that can reach the site)."
        )
    if resp.status_code in (301, 302, 303, 307, 308):
        raise RuntimeError(
            f"CSV endpoint redirected to {resp.headers.get('location')!r} — the league "
            "is likely non-public/gated (needs an authenticated session)."
        )
    resp.raise_for_status()
    if "Team ID" not in body[:200]:
        raise RuntimeError(
            "Response did not look like the roster CSV export (missing 'Team ID' "
            "header) — the endpoint may have returned an HTML error/login page."
        )
    return body


def compute_reconciliation(csv_rows: list[RosterRow], players: list[dict],
                           existing_prices: list[dict]) -> Reconciliation:
    """Pure diff of a parsed CSV against the current ``players`` + ``league_prices``.

    ``players``: dicts with ``id`` and ``ottoneu_id``. ``existing_prices``: dicts
    with ``player_id``, ``price``, ``team_name`` for the target league only.
    """
    by_oid = {str(p["ottoneu_id"]): p for p in players if p.get("ottoneu_id") is not None}
    price_by_pid = {p["player_id"]: p for p in existing_prices}
    id_to_oid = {p["id"]: str(p["ottoneu_id"]) for p in players
                 if p.get("ottoneu_id") is not None}
    csv_oids = {str(r.ottoneu_id) for r in csv_rows}

    recon = Reconciliation()
    for row in csv_rows:
        player = by_oid.get(str(row.ottoneu_id))
        if not player:
            recon.creates.append(row)
            continue
        lp = price_by_pid.get(player["id"])
        if lp is None:
            recon.ownership_changes.append((row, player, None))
            continue
        old_team = (lp["team_name"] or "").strip()
        if old_team != row.team:
            recon.ownership_changes.append((row, player, lp))
        elif lp["price"] != row.price:
            recon.price_changes.append((row, player, lp))
        else:
            recon.unchanged += 1

    for pid, lp in price_by_pid.items():
        if (lp["team_name"] or "").strip() in _FA_LABELS:
            continue
        if id_to_oid.get(pid) not in csv_oids:
            recon.cuts.append(lp)
    return recon


def _resolve_or_create_player(sb, row: RosterRow) -> str | None:
    """Adopt a matching prospect record for ``row`` or create a fresh players row.

    Mirrors the scraper's adopt-or-insert path so the CSV and Playwright pipelines
    stay consistent (``choose_prospect_to_adopt``).
    """
    candidates = (
        sb.table("players").select("id, ottoneu_id")
        .eq("name", row.name).eq("position", row.position)
        .neq("ottoneu_id", row.ottoneu_id).execute().data or []
    )
    for c in candidates:
        c["has_draft_capital"] = bool(
            sb.table("draft_capital").select("id")
            .eq("player_id", c["id"]).limit(1).execute().data
        )
    adopt_id = choose_prospect_to_adopt(candidates)
    payload = {
        "ottoneu_id": row.ottoneu_id,
        "position": row.position,
        "nfl_team": row.nfl_team,
        "is_college": row.is_college,
    }
    if adopt_id:
        sb.table("players").update(payload).eq("id", adopt_id).execute()
        return adopt_id
    payload["name"] = row.name
    data, _ = sb.table("players").upsert(payload, on_conflict="ottoneu_id").execute()
    returned = data.data if hasattr(data, "data") else data[1]
    return returned[0]["id"] if returned else None


def _upsert_price(sb, player_id: str, league_id: int, price: int, team: str) -> None:
    sb.table("league_prices").upsert(
        {"player_id": player_id, "league_id": league_id, "price": price, "team_name": team},
        on_conflict="player_id, league_id",
    ).execute()


def apply_reconciliation(sb, recon: Reconciliation, players: list[dict],
                         league_id: int, dry_run: bool) -> list[Event]:
    """Write the reconciliation to ``league_prices`` and return the move events.

    In dry-run mode nothing is written and ``creates`` events carry ``player_id=None``
    (the adopt/create resolution is deferred to an actual apply).
    """
    name_by_pid = {p["id"]: p.get("name", "?") for p in players}
    events: list[Event] = []

    # Ownership changes: trade (old real team) or add (was FA / no price row).
    for row, player, lp in recon.ownership_changes:
        old_team = (lp["team_name"] or "").strip() if lp else ""
        if old_team in _FA_LABELS:
            events.append(Event("add", player["id"], row.name, row.team, None, row.price))
        else:
            events.append(Event("trade", player["id"], row.name, row.team, old_team, row.price))
        if not dry_run:
            _upsert_price(sb, player["id"], league_id, row.price, row.team)

    # Price-only changes: update salary, but emit no transaction (a same-team
    # salary delta is an arbitration raise/adjustment we can't reliably type).
    for row, player, lp in recon.price_changes:
        if not dry_run:
            _upsert_price(sb, player["id"], league_id, row.price, row.team)

    # Cuts: owned-but-absent → FA at the placeholder price.
    for lp in recon.cuts:
        pid = lp["player_id"]
        old_team = (lp["team_name"] or "").strip()
        events.append(Event("cut", pid, name_by_pid.get(pid, "?"), None, old_team, lp["price"]))
        if not dry_run:
            _upsert_price(sb, pid, league_id, FA_PLACEHOLDER_PRICE, FA_TEAM)

    # New players: adopt/create, then add the price row.
    for row in recon.creates:
        pid = None
        if not dry_run:
            pid = _resolve_or_create_player(sb, row)
            if pid:
                _upsert_price(sb, pid, league_id, row.price, row.team)
        events.append(Event("add", pid, row.name, row.team, None, row.price))

    return events


def _already_scraped(sb, league_id: int, run_date: date,
                     lookback_days: int = TXN_DEDUPE_LOOKBACK_DAYS) -> set[tuple]:
    """Keys of real player-card transactions recorded near ``run_date``.

    ``scrape_player_cards.py`` owns ``transactions`` and ``reconcile_roster``
    owns ``league_prices``; neither writes the other's table. So after the card
    scrape logs a move *with its true timestamp*, this reconciliation still sees
    a stale price row, re-derives the same move, and — since the upsert key
    includes ``transaction_date`` — files a second copy under the run date. That
    is how 86 duplicate rows landed on 2026-08-23, one for every card row from
    2026-08-22, burying real activity under a bulk load.

    So look back a window and skip any event a card already accounts for.

    This filter only fires for moves the card scrape has **already** recorded, so
    it depends on the card scrape running first — which is why the workflows are
    ordered that way. It cannot catch an overnight move on a day the card scrape
    lags or fails, so ``scripts.transaction_dedupe`` runs after that scrape and
    deletes any inference its real rows superseded. This filter is the cheap
    path; that purge is the guarantee.
    """
    since = (run_date - timedelta(days=lookback_days)).isoformat()
    rows = fetch_all_rows(
        sb, "transactions", "player_id, transaction_type, salary, team_name, raw_description",
        filters=[("eq", "league_id", league_id), ("gte", "transaction_date", since)],
    )
    return {
        (r["player_id"], r["transaction_type"], r["salary"], r["team_name"])
        for r in rows
        if _INFERRED_MARKER not in (r.get("raw_description") or "")
    }


def build_transaction_rows(events: list[Event], run_date: date, league_id: int,
                           already_scraped: set[tuple] | None = None) -> list[dict]:
    """Build ``transactions`` rows from move events, dated ``run_date``.

    Follows the scraper's stored convention: ``cut``, ``add``, and
    ``move (from <old team>)`` type strings; ``from_team`` left null (the source
    team is encoded in the ``move (from …)`` type). Skips events without a
    resolved ``player_id`` (dry-run creates), and events already recorded by the
    player-card scrape (see ``_already_scraped``) — an inference dated the run
    day is strictly worse than the same move with its real timestamp.
    """
    already_scraped = already_scraped or set()
    date_iso = run_date.isoformat()
    date_label = f"{run_date:%b} {run_date.day}, {run_date.year}"
    season = run_date.year
    rows: list[dict] = []
    for e in events:
        if e.player_id is None:
            continue
        if e.kind == "cut":
            ttype, team = "cut", e.from_team
        elif e.kind == "trade":
            ttype, team = f"move (from {e.from_team})", e.team
        else:
            ttype, team = "add", e.team
        if (e.player_id, ttype, e.salary, team) in already_scraped:
            continue
        rows.append({
            "player_id": e.player_id,
            "league_id": league_id,
            "season": season,
            "transaction_type": ttype,
            "team_name": team,
            "from_team": None,
            "salary": e.salary,
            "transaction_date": date_iso,
            "raw_description": f"{date_label} | {team} | {ttype} | ${e.salary} | "
                               f"{_INFERRED_MARKER} {date_iso}",
        })
    return rows


def _write_transactions(sb, rows: list[dict]) -> None:
    for r in rows:
        sb.table("transactions").upsert(
            r, on_conflict="player_id, league_id, transaction_type, transaction_date, salary",
        ).execute()


def reconcile(sb, csv_text: str, league_id: int, apply: bool,
              infer_transactions: bool, run_date: date) -> dict:
    """Full reconciliation: parse → diff → (apply) → (infer transactions). Returns a summary."""
    csv_rows = parse_roster_csv(csv_text)
    n_teams = len({r.team for r in csv_rows})
    if len(csv_rows) < MIN_ROSTER_ROWS or n_teams < MIN_TEAMS:
        raise RuntimeError(
            f"CSV has only {len(csv_rows)} rostered rows across {n_teams} team(s) — "
            f"below the safety floor ({MIN_ROSTER_ROWS} rows / {MIN_TEAMS} teams). "
            "Refusing to apply (a truncated fetch must not mass-cut rosters)."
        )

    players = fetch_all_rows(sb, "players", "id, ottoneu_id, name")
    prices = fetch_all_rows(sb, "league_prices", "player_id, price, team_name",
                            filters=[("eq", "league_id", league_id)])
    recon = compute_reconciliation(csv_rows, players, prices)
    events = apply_reconciliation(sb, recon, players, league_id, dry_run=not apply)

    txn_rows: list[dict] = []
    inferred_skipped = 0
    if infer_transactions:
        already = _already_scraped(sb, league_id, run_date)
        resolved = sum(1 for e in events if e.player_id is not None)
        txn_rows = build_transaction_rows(events, run_date, league_id, already)
        inferred_skipped = resolved - len(txn_rows)
        if apply:
            _write_transactions(sb, txn_rows)

    trades = sum(1 for e in events if e.kind == "trade")
    adds = sum(1 for e in events if e.kind == "add")
    cuts = sum(1 for e in events if e.kind == "cut")
    return {
        "rostered": len(csv_rows),
        "teams": n_teams,
        "unchanged": recon.unchanged,
        "trades": trades,
        "adds": adds,
        "cuts": cuts,
        "price_changes": len(recon.price_changes),
        "creates": len(recon.creates),
        "transactions_written": len(txn_rows) if apply else 0,
        "transactions_skipped_as_scraped": inferred_skipped,
        "events": events,
    }


def _print_summary(summary: dict, apply: bool, infer: bool) -> None:
    mode = "APPLIED" if apply else "DRY-RUN (no writes)"
    print(f"\n=== Roster reconciliation: {mode} ===")
    print(f"  CSV: {summary['rostered']} rostered players across {summary['teams']} teams")
    print(f"  unchanged:      {summary['unchanged']}")
    print(f"  trades:         {summary['trades']}")
    print(f"  adds:           {summary['adds']}  ({summary['creates']} new player record(s))")
    print(f"  cuts → FA:      {summary['cuts']}")
    print(f"  price changes:  {summary['price_changes']}")
    if infer:
        print(f"  transactions:   {summary['transactions_written']} written"
              if apply else "  transactions:   (dry-run — not written)")
        if summary["transactions_skipped_as_scraped"]:
            print(f"  skipped:        {summary['transactions_skipped_as_scraped']} already "
                  "recorded by the player-card scrape (real timestamps)")
    for e in summary["events"]:
        if e.kind == "trade":
            print(f"    trade  {e.name:24} {e.from_team} → {e.team}  ${e.salary}")
        elif e.kind == "add":
            print(f"    add    {e.name:24} → {e.team}  ${e.salary}")
        else:
            print(f"    cut    {e.name:24} {e.from_team} → FA  (was ${e.salary})")


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Reconcile league_prices from an Ottoneu /csv/rosters export.")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--file", help="Read CSV from a local file instead of fetching over HTTP.")
    src.add_argument("--url", help="Override the CSV URL (default: the league's /csv/rosters).")
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    parser.add_argument("--cookie", help="Raw Cookie header for the fetch (or set OTTONEU_COOKIE).")
    parser.add_argument("--apply", action="store_true", help="Write changes (default: dry run).")
    parser.add_argument("--infer-transactions", action="store_true",
                        help="Also write an inferred transaction row per detected cut/trade/add.")
    parser.add_argument("--date", help="Run date for inferred transactions (YYYY-MM-DD; default today).")
    args = parser.parse_args(argv)

    run_date = date.fromisoformat(args.date) if args.date else date.today()

    try:
        if args.file:
            with open(args.file, encoding="utf-8") as fh:
                csv_text = fh.read()
        elif args.url:
            resp = requests.get(args.url, headers={"User-Agent": USER_AGENT},
                                timeout=30, allow_redirects=False)
            resp.raise_for_status()
            csv_text = resp.text
        else:
            csv_text = fetch_roster_csv(args.league_id, cookie=args.cookie)
    except CloudflareBlockedError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2
    except (requests.RequestException, OSError, RuntimeError) as e:
        print(f"ERROR: could not obtain roster CSV: {e}", file=sys.stderr)
        return 1

    sb = get_supabase_client()
    try:
        summary = reconcile(sb, csv_text, args.league_id, apply=args.apply,
                            infer_transactions=args.infer_transactions, run_date=run_date)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    _print_summary(summary, args.apply, args.infer_transactions)
    if not args.apply:
        print("\nDry-run only. Re-run with --apply to write.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
