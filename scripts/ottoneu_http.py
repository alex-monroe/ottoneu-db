"""Plain-HTTP fetching of public Ottoneu pages, with the Cloudflare trap handled.

The counter-intuitive rule this module exists to encode: Ottoneu serves
Cloudflare's *interactive* challenge to requests that spoof a browser
User-Agent (a "Chrome" claim with none of a browser's TLS/JS fingerprint reads
as a bot), but lets a plainly-automated client through with a 200 — from
datacenter IPs, GitHub-hosted runners included. So we send an honest,
descriptive UA and never impersonate a browser.

A redirect is also meaningful rather than incidental: Ottoneu 307s gated and
nonexistent pages to a login screen or `/football/?invalidLeague=1`, so a
redirect means "no public page here", not "follow me".

NOTE ON DUPLICATION: `scrape_league_calendar.py`, `scrape_player_cards.py` and
`reconcile_roster.py` each grew their own copy of this logic before this module
existed, and still carry it (the player-card one adds retry/backoff on top).
They are working production scrapers, so they were left alone rather than
refactored alongside an unrelated feature; migrating them onto `fetch_page` is
a standalone cleanup.
"""

from __future__ import annotations

import os

import requests

BASE_URL = "https://ottoneu.fangraphs.com"

# Markers Cloudflare's challenge page carries. Checked in the body as well as on
# the status code because the challenge is sometimes served with a 200.
CF_MARKERS = (
    "Just a moment",
    "cf-chl",
    "Enable JavaScript and cookies to continue",
    "Attention Required",
)

REDIRECTS = (301, 302, 303, 307, 308)


class CloudflareBlockedError(RuntimeError):
    """Raised when a page returns a Cloudflare challenge instead of content."""


class GatedPageError(RuntimeError):
    """Raised when a page redirects — i.e. it is login-gated or does not exist."""


def fetch_page(
    path: str,
    user_agent: str,
    cookie: str | None = None,
    accept: str = "text/html, */*",
    timeout: int = 30,
    session: requests.Session | None = None,
) -> str:
    """GET ``BASE_URL + path`` and return the body, or raise a clear error.

    ``user_agent`` must be honest and descriptive (see the module docstring) —
    each caller passes its own so a blocked request is attributable to the
    scraper that made it. ``cookie`` (or the ``OTTONEU_COOKIE`` env var) is an
    optional escape hatch: a raw ``Cookie`` header reusing a browser session,
    only needed if a page we read is ever put behind the login.
    """
    url = f"{BASE_URL}{path}"
    headers = {"User-Agent": user_agent, "Accept": accept}
    cookie = cookie or os.getenv("OTTONEU_COOKIE")
    if cookie:
        headers["Cookie"] = cookie

    getter = session.get if session is not None else requests.get
    resp = getter(url, headers=headers, timeout=timeout, allow_redirects=False)
    body = resp.text or ""

    if resp.status_code == 403 or any(m in body for m in CF_MARKERS):
        raise CloudflareBlockedError(
            f"Cloudflare challenge (HTTP {resp.status_code}) fetching {url}. Check "
            "the User-Agent is honest (a browser UA trips the challenge), or supply "
            "a session via OTTONEU_COOKIE."
        )
    if resp.status_code in REDIRECTS:
        raise GatedPageError(
            f"{url} redirected to {resp.headers.get('location')!r} — the page is "
            "login-gated or does not exist."
        )
    resp.raise_for_status()
    return body
