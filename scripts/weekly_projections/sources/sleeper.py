"""Sleeper weekly projections and actuals.

Terms: docs.sleeper.com states the read-only HTTP API is "free to use for
non-commercial purposes" (commercial use requires contacting them for
licensing). This league's private analytics site is non-commercial. No key, no
login, no browser automation, and an honest identifying User-Agent — we do not
spoof a browser to get past anything.

    GET https://api.sleeper.com/projections/nfl/{season}/{week}?season_type=regular
    GET https://api.sleeper.com/stats/nfl/{season}/{week}?season_type=regular

Both return the same row shape, which is why actuals cost almost nothing on top
of projections.

CAVEAT — read before trusting this module: these paths are open and
unauthenticated on the same public API the permission grant covers, but they are
not in Sleeper's *published* endpoint docs (those cover leagues, users, drafts
and players). Permission is clear; stability is not promised. So _STAT_MAP below
is a mapping onto keys that may change without notice, and every parse runs
through `validate_payload`, which raises rather than letting a shape change
quietly write a table full of zeroes.

Run `just weekly-projections-probe` to dump a live payload and confirm the keys.
"""

from __future__ import annotations

import time
from typing import Iterable

import requests

from scripts.weekly_projections.sources.base import WeeklyRow

BASE_URL = "https://api.sleeper.com"

# An honest User-Agent: says what this is and who runs it, so Sleeper can
# identify (or block) the traffic. Deliberately NOT a spoofed browser string.
USER_AGENT = "ottoneu-db/1.0 (private fantasy league analytics; +https://github.com/alex-monroe/ottoneu-db)"

HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}

# Ottoneu FF 309 rosters QB/RB/WR/TE/K — no DST or IDP, so we never ask for them.
POSITIONS = ("QB", "RB", "WR", "TE", "K")

# Sleeper stat key -> our SCORING_SETTINGS key. Several Sleeper keys fold into
# one of ours: Ottoneu buckets field goals as 0-39 / 40-49 / 50+, while Sleeper
# reports finer distance bands, so the short bands sum into fg_made_0_39.
_STAT_MAP: dict[str, str] = {
    "pass_yd": "passing_yards",
    "pass_td": "passing_tds",
    "pass_int": "interceptions",
    "rush_yd": "rushing_yards",
    "rush_td": "rushing_tds",
    "rec": "receptions",
    "rec_yd": "receiving_yards",
    "rec_td": "receiving_tds",
    "fgm_0_19": "fg_made_0_39",
    "fgm_20_29": "fg_made_0_39",
    "fgm_30_39": "fg_made_0_39",
    "fgm_40_49": "fg_made_40_49",
    "fgm_50p": "fg_made_50_plus",
    "xpm": "pat_made",
}

# If a payload contains none of these, the response shape has changed and we
# refuse to write. Chosen as the keys that must appear across any real slate of
# QB/RB/WR/TE rows — a week where nobody is projected to throw or catch a pass
# does not exist.
_SENTINEL_KEYS = ("pass_yd", "rush_yd", "rec_yd", "rec")


class SleeperSchemaError(RuntimeError):
    """Raised when Sleeper's response no longer matches what we parse.

    Deliberately fatal: silently upserting a week of zeroed projections would be
    far worse than a failed job, because the zeroes look like real data on the
    player cards and in the MCP payload.
    """


def _url(kind: str, season: int, week: int) -> str:
    return f"{BASE_URL}/{kind}/nfl/{season}/{week}"


def fetch_raw(
    season: int,
    week: int,
    kind: str = "projections",
    positions: Iterable[str] = POSITIONS,
    timeout: int = 30,
) -> list[dict]:
    """Fetch one week's raw rows from Sleeper.

    Args:
        season: NFL season, e.g. 2025.
        week: NFL week, 1-18.
        kind: "projections" (forward-looking) or "stats" (actuals).
        positions: Positions to request.
        timeout: Per-request timeout in seconds.

    Returns:
        The raw JSON list, unparsed.
    """
    if kind not in ("projections", "stats"):
        raise ValueError(f"kind must be 'projections' or 'stats', got {kind!r}")

    params = [("season_type", "regular")] + [("position[]", p) for p in positions]
    url = _url(kind, season, week)
    resp = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
    resp.raise_for_status()
    payload = resp.json()

    if not isinstance(payload, list):
        raise SleeperSchemaError(
            f"{url} returned {type(payload).__name__}, expected a list of player rows. "
            "The endpoint shape has changed — re-run `just weekly-projections-probe` "
            "and update _STAT_MAP in scripts/weekly_projections/sources/sleeper.py."
        )
    return payload


def validate_payload(payload: list[dict], url_hint: str = "") -> None:
    """Fail loudly if the payload is not the shape we parse.

    Guards the failure mode that actually matters: a renamed stat key would
    otherwise map to nothing, score every player at 0.0, and quietly overwrite a
    good week with zeroes.
    """
    where = f" ({url_hint})" if url_hint else ""

    if not payload:
        raise SleeperSchemaError(
            f"Sleeper returned zero rows{where}. Either the week has no data yet or "
            "the request shape changed; refusing to write."
        )

    rows_with_stats = [r for r in payload if isinstance(r.get("stats"), dict)]
    if not rows_with_stats:
        raise SleeperSchemaError(
            f"No row in the Sleeper payload{where} has a 'stats' object. "
            "The response shape has changed — re-run `just weekly-projections-probe`."
        )

    observed = {k for r in rows_with_stats for k in r["stats"]}
    if not observed & set(_SENTINEL_KEYS):
        raise SleeperSchemaError(
            f"Sleeper payload{where} contains none of the expected stat keys "
            f"{_SENTINEL_KEYS}. Observed a sample of: {sorted(observed)[:20]}. "
            "Update _STAT_MAP in scripts/weekly_projections/sources/sleeper.py."
        )

    mapped = observed & set(_STAT_MAP)
    if not mapped:
        raise SleeperSchemaError(
            f"None of Sleeper's stat keys{where} map to Ottoneu scoring categories. "
            f"Observed: {sorted(observed)[:20]}."
        )


def _to_ottoneu_stats(sleeper_stats: dict) -> dict:
    """Translate one Sleeper stats dict into our SCORING_SETTINGS keys.

    Note the `+=`: several Sleeper field-goal bands fold into one Ottoneu bucket.
    """
    out: dict[str, float] = {}
    for src_key, our_key in _STAT_MAP.items():
        value = sleeper_stats.get(src_key)
        if value is None:
            continue
        try:
            out[our_key] = out.get(our_key, 0.0) + float(value)
        except (TypeError, ValueError):
            continue
    return out


def parse(payload: list[dict], season: int, week: int) -> list[WeeklyRow]:
    """Normalise a validated Sleeper payload into WeeklyRow records.

    Rows without a usable player name or position are skipped — Sleeper carries
    team defenses and practice-squad entries we have no player record for.
    """
    rows: list[WeeklyRow] = []
    for entry in payload:
        stats = entry.get("stats")
        if not isinstance(stats, dict):
            continue

        player = entry.get("player") or {}
        name = (
            player.get("full_name")
            or " ".join(
                p for p in (player.get("first_name"), player.get("last_name")) if p
            ).strip()
        )
        position = (player.get("position") or "").upper()
        if not name or position not in POSITIONS:
            continue

        rows.append(
            WeeklyRow(
                name=name,
                position=position,
                team=(entry.get("team") or player.get("team") or "").upper(),
                week=int(entry.get("week") or week),
                season=int(entry.get("season") or season),
                stats=_to_ottoneu_stats(stats),
                opponent=(entry.get("opponent") or None),
            )
        )
    return rows


def fetch(
    season: int,
    week: int,
    kind: str = "projections",
    positions: Iterable[str] = POSITIONS,
    delay: float = 1.0,
) -> list[WeeklyRow]:
    """Fetch, validate, and normalise one week from Sleeper."""
    payload = fetch_raw(season, week, kind=kind, positions=positions)
    validate_payload(payload, url_hint=_url(kind, season, week))
    rows = parse(payload, season, week)
    if delay:
        time.sleep(delay)  # be a polite client
    return rows
