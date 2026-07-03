"""HTML/CSV parsers for public Ottoneu football league pages.

Pure functions (markup in, plain dicts out) so they can be unit-tested on
fixture snippets and reused by any caller. Page shapes verified against live
pages in July 2026:

- /football/{id}/settings        key/value table of league configuration
- /football/{id}/standings/{yr}  per-season standings with division rows
- /football/{id}/team/{tid}      team header, manager, trophy case
- /football/{id}/finances        cap/salary table per team
- /football/{id}/csv/rosters     CSV export of all current rosters
- /football/{id}/player_card/... trade links into other leagues (discovery)
"""

from __future__ import annotations

import csv
import io
import re

from bs4 import BeautifulSoup

_RECORD_RE = re.compile(r"^(\d+)-(\d+)-(\d+)$")
_YEAR_RE = re.compile(r"(\d{4})")
_MONEY_RE = re.compile(r"-?\d+")
_FOOTBALL_LEAGUE_RE = re.compile(r"/football/(\d+)/")
_TROPHY_RE = re.compile(r"(\d{4})\s+(.*)")

TROPHY_PLACES = {
    "Champion": "champion",
    "Runner-Up": "runner_up",
    "Third Place": "third_place",
}


def _soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def _money(text: str) -> int | None:
    m = _MONEY_RE.search(text.replace(",", ""))
    return int(m.group()) if m else None


def parse_league_name(html: str) -> str | None:
    """League name from the <title>: 'Ottoneu Fantasy Football - {name} - {page}'."""
    soup = _soup(html)
    if not soup.title:
        return None
    parts = [p.strip() for p in soup.title.get_text().split(" - ")]
    if len(parts) < 3:
        return None
    return " - ".join(parts[1:-1])


def parse_settings(html: str) -> dict:
    """League configuration from the settings page's key/value table."""
    soup = _soup(html)
    raw: dict[str, str] = {}
    for tr in soup.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        if len(cells) >= 2:
            label = cells[0].get_text(" ", strip=True)
            value = cells[1].get_text(" ", strip=True)
            if label and label != "Setting":
                raw[label] = value

    established = raw.get("Established", "")
    year_match = _YEAR_RE.search(established)
    num_teams = raw.get("Number of Teams", "")
    return {
        "league_id": int(raw["ID"]) if raw.get("ID", "").isdigit() else None,
        "name": parse_league_name(html),
        "established": established or None,
        "established_year": int(year_match.group(1)) if year_match else None,
        "tier": raw.get("Tier"),
        "is_private": raw.get("Private League?", "").strip().lower() == "yes",
        "num_teams": int(num_teams) if num_teams.isdigit() else None,
        "points_system": raw.get("Points System"),
        "roster_settings": raw.get("Roster Settings"),
        "playoff_settings": raw.get("Playoff Settings"),
    }


def parse_standings(html: str) -> list[dict]:
    """Standings rows with division labels; division header rows repeat one
    value across every column, which is how they are detected."""
    soup = _soup(html)
    rows: list[dict] = []
    division = None
    for tr in soup.find_all("tr"):
        cells = tr.find_all("td")
        if not cells:
            continue
        texts = [c.get_text(" ", strip=True) for c in cells]
        if len(set(texts)) == 1 and texts[0]:
            division = texts[0]
            continue
        if len(texts) < 4:
            continue
        record = _RECORD_RE.match(texts[1])
        if not record:
            continue
        link = cells[0].find("a", href=_FOOTBALL_LEAGUE_RE)
        team_id = None
        if link:
            id_match = re.search(r"/team/(\d+)", link["href"])
            team_id = int(id_match.group(1)) if id_match else None
        rows.append(
            {
                "team_id": team_id,
                "team_name": texts[0],
                "division": division,
                "wins": int(record.group(1)),
                "losses": int(record.group(2)),
                "ties": int(record.group(3)),
                "points_for": float(texts[2]) if texts[2] else None,
                "points_against": float(texts[3]) if texts[3] else None,
            }
        )
    return rows


def parse_team_page(html: str) -> dict:
    """Team name, manager username, and trophy history from a team page."""
    soup = _soup(html)
    name = None
    for h1 in soup.find_all("h1"):
        if "ottoneu-logo" in (h1.get("class") or []):
            continue
        text = h1.get_text(" ", strip=True)
        if text:
            name = text
            break

    owner_link = soup.find("a", href=re.compile(r"^/user/"))
    owner = owner_link.get_text(strip=True) if owner_link else None

    trophies = []
    case = soup.select_one(".trophy-case")
    if case:
        for icon in case.find_all("i"):
            m = _TROPHY_RE.match(icon.get("title", ""))
            if not m:
                continue
            place = TROPHY_PLACES.get(m.group(2).strip())
            if place:
                trophies.append({"season": int(m.group(1)), "place": place})

    return {"name": name, "owner": owner, "trophies": trophies}


def parse_finances(html: str) -> list[dict]:
    """Per-team salary/cap rows from the finances page."""
    soup = _soup(html)
    for table in soup.find_all("table"):
        headers = [th.get_text(" ", strip=True) for th in table.find_all("th")]
        if "Salaries" not in headers or "Team" not in headers:
            continue
        idx = {h: i for i, h in enumerate(headers)}
        rows = []
        for tr in table.find_all("tr"):
            cells = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
            if len(cells) < len(headers):
                continue
            rows.append(
                {
                    "team_name": cells[idx["Team"]],
                    "players": _money(cells[idx["Players"]]),
                    "spots": _money(cells[idx["Spots"]]),
                    "salaries": _money(cells[idx["Salaries"]]),
                    "cap_penalties": _money(cells[idx["Cap Penalties"]]),
                    "incoming_loans": _money(cells[idx["Incoming Loans"]]),
                    "outgoing_loans": _money(cells[idx["Outgoing Loans"]]),
                    "free_cap_space": _money(cells[idx["Free Cap Space"]]),
                }
            )
        return rows
    return []


def parse_rosters_csv(text: str) -> list[dict]:
    """Rows from the /csv/rosters export (current rosters + salaries)."""
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for r in reader:
        if not r.get("Team ID") or not r["Team ID"].isdigit():
            continue
        rows.append(
            {
                "team_id": int(r["Team ID"]),
                "team_name": r["Team Name"],
                "ottoneu_player_id": int(r["Player ID"]) if r.get("Player ID", "").isdigit() else None,
                "player_name": r["Player Name"],
                "pro_team": r.get("Pro Team") or None,
                "positions": r.get("Position(s)") or None,
                "salary": _money(r.get("Salary", "")),
            }
        )
    return rows


def parse_league_ids_from_player_card(html: str, exclude: int | None = None) -> set[int]:
    """League IDs linked from a player card (trades in other leagues)."""
    ids = {int(m) for m in _FOOTBALL_LEAGUE_RE.findall(html)}
    if exclude is not None:
        ids.discard(exclude)
    return ids
