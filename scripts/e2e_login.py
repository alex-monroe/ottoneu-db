"""Sign in as the dedicated e2e user and save a Playwright ``storageState`` file.

Agents (the devcontainer and cloud sessions) need to see the gated pages, which
sit behind the ``ottoneu_auth`` session cookie. Rather than driving the login
form for every screenshot, this posts the credentials to ``/api/auth/login`` once
and writes the resulting cookie in Playwright's ``storageState`` format, so a
browser context can start already signed in:

    context = browser.new_context(storage_state=".cache/e2e/storage-state.json")

Credentials come from ``E2E_EMAIL`` / ``E2E_PASSWORD`` (never the command line, so
they stay out of shell history and process listings). The account is
non-admin with ``has_projections_access`` only. Anything it submits (pick'em
picks, ballots) is a real row in the shared database — don't submit from it.

Usage:
    just e2e-login                                   # against localhost:3000
    E2E_BASE_URL=https://sofa-db.vercel.app just e2e-login
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

AUTH_COOKIE_NAME = "ottoneu_auth"  # mirrors web/lib/auth.ts
DEFAULT_BASE_URL = "http://localhost:3000"
DEFAULT_OUT = Path(".cache/e2e/storage-state.json")


def login(base_url: str, email: str, password: str) -> http.cookiejar.Cookie:
    """POST the credentials and return the auth cookie the server set."""
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    request = urllib.request.Request(
        f"{base_url}/api/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "ottoneu-db-e2e-login"},
    )
    try:
        opener.open(request, timeout=30)
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"login failed: HTTP {exc.code} from {base_url}/api/auth/login") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"could not reach {base_url}: {exc.reason}") from exc
    for cookie in jar:
        if cookie.name == AUTH_COOKIE_NAME:
            return cookie
    raise SystemExit(f"login succeeded but no {AUTH_COOKIE_NAME} cookie was set")


def storage_state(base_url: str, cookie: http.cookiejar.Cookie) -> dict:
    parsed = urllib.parse.urlparse(base_url)
    return {
        "cookies": [
            {
                "name": cookie.name,
                "value": cookie.value,
                "domain": parsed.hostname,
                "path": "/",
                "expires": cookie.expires if cookie.expires else -1,
                "httpOnly": True,
                "secure": parsed.scheme == "https",
                "sameSite": "Lax",
            }
        ],
        "origins": [],
    }


def main() -> int:
    email = os.environ.get("E2E_EMAIL")
    password = os.environ.get("E2E_PASSWORD")
    if not email or not password:
        print("E2E_EMAIL and E2E_PASSWORD must be set (see .env.example)", file=sys.stderr)
        return 1
    base_url = os.environ.get("E2E_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    out = Path(os.environ.get("E2E_STORAGE_STATE", DEFAULT_OUT))

    cookie = login(base_url, email, password)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(storage_state(base_url, cookie), indent=2))
    out.chmod(0o600)
    print(f"signed in to {base_url} as {email}; wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
