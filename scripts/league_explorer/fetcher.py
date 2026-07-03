"""Polite HTTP fetcher with an on-disk cache for public Ottoneu pages.

Every network request is rate-limited (default 1 req/s) and sent with a
descriptive User-Agent. Successful responses are cached under
data/league_explorer/cache/ so re-runs and re-parses are free; pages that can
never change (e.g. completed-season standings) are cached forever, while
current-state pages honor a max_age.
"""

from __future__ import annotations

import re
import time
from pathlib import Path

import requests

BASE_URL = "https://ottoneu.fangraphs.com"
USER_AGENT = (
    "ottoneu-db-league-explorer/0.1 "
    "(personal research tool; github.com/alex-monroe/ottoneu-db)"
)
DEFAULT_CACHE_DIR = Path("data/league_explorer/cache")
RETRY_DELAYS = [2, 5, 10]

_SLUG_RE = re.compile(r"[^A-Za-z0-9._-]+")


class FetchError(Exception):
    """Raised when a page cannot be fetched after retries (non-404 failure)."""


class Fetcher:
    def __init__(
        self,
        cache_dir: Path | str = DEFAULT_CACHE_DIR,
        delay_seconds: float = 1.0,
        refresh: bool = False,
    ):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay_seconds = delay_seconds
        self.refresh = refresh
        self._last_request_at = 0.0
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.requests_made = 0
        self.cache_hits = 0

    def _cache_path(self, path: str) -> Path:
        slug = _SLUG_RE.sub("_", path.strip("/")) or "root"
        return self.cache_dir / slug

    def _throttle(self) -> None:
        wait = self._last_request_at + self.delay_seconds - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last_request_at = time.monotonic()

    def get(self, path: str, max_age_hours: float | None = None) -> str | None:
        """Fetch BASE_URL + path, returning page text or None on HTTP 404.

        max_age_hours=None means the cached copy never expires (immutable
        pages like past-season standings). refresh=True bypasses the cache
        for mutable pages but still trusts immutable ones.
        """
        cache_file = self._cache_path(path)
        if cache_file.exists():
            age_hours = (time.time() - cache_file.stat().st_mtime) / 3600
            immutable = max_age_hours is None
            if immutable or (not self.refresh and age_hours <= max_age_hours):
                self.cache_hits += 1
                return cache_file.read_text()

        last_error: Exception | None = None
        for attempt, retry_delay in enumerate([0] + RETRY_DELAYS):
            if retry_delay:
                time.sleep(retry_delay)
            self._throttle()
            try:
                resp = self.session.get(BASE_URL + path, timeout=30)
            except requests.RequestException as e:
                last_error = e
                continue
            self.requests_made += 1
            if resp.status_code == 404:
                return None
            if resp.status_code >= 500:
                last_error = FetchError(f"HTTP {resp.status_code} for {path}")
                continue
            resp.raise_for_status()
            cache_file.write_text(resp.text)
            return resp.text
        raise FetchError(f"Failed to fetch {path}: {last_error}")
