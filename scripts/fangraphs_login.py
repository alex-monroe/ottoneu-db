"""Log a Playwright page in to FanGraphs, for the Ottoneu pages that need a session.

Most Ottoneu pages are public and read over plain HTTP (`scripts/ottoneu_http.py`).
A few are only shown to logged-in league members — the arbitration page and the
waiver-claims page — and those go through a real browser login here, using the
FANGRAPHS_USERNAME / FANGRAPHS_PASSWORD env vars.

## The login page has two submit buttons (October 2026)

FanGraphs re-skinned `wp-login.php`. The stock WordPress `#wp-submit` ("Log In")
is still in the form but hidden; the visible button is a new
`input.fg-login-submit` ("Sign In") with the same `name="wp-submit"`. Clicking
`#wp-submit` waits forever for an element that never becomes visible, so the
click targets whichever `wp-submit` input is visible — which works on both the
old page and the new one.

## Plain-HTTP login (`login_session`)

The same form also works without a browser, which is what the droplet's FA
market scrape uses (no Chromium on a 2 GB box). It is stock WordPress: no CSRF
nonce, just `log`/`pwd`, the hidden `redirect_to` and `testcookie=1` fields, and
the `wordpress_test_cookie` the GET sets. A good login answers the POST with a
302 to `redirect_to` and sets a `wordpress_logged_in_*` cookie on
`.fangraphs.com`, which `ottoneu.fangraphs.com` accepts; a bad one re-renders
the form (200) with `#login_error`. Cloudflare's rule from `ottoneu_http.py`
holds here too: send an honest User-Agent, never a browser one.
"""

from __future__ import annotations

import os
import sys
from urllib.parse import urlencode

import requests
from bs4 import BeautifulSoup

from scripts.config import LEAGUE_ID
from scripts.ottoneu_http import CF_MARKERS, CloudflareBlockedError

DEBUG_SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "debug")
FANGRAPHS_LOGIN_URL = "https://blogs.fangraphs.com/wp-login.php"
# Any visible submit named wp-submit — see the module docstring.
SUBMIT_SELECTOR = "input[type=submit][name=wp-submit]:visible"


def have_credentials() -> bool:
    """True when both FanGraphs login env vars are set."""
    return bool(os.getenv("FANGRAPHS_USERNAME") and os.getenv("FANGRAPHS_PASSWORD"))


async def save_debug_screenshot(page, name: str):
    """Save a screenshot and page HTML for debugging CI failures."""
    os.makedirs(DEBUG_SCREENSHOT_DIR, exist_ok=True)
    screenshot_path = os.path.join(DEBUG_SCREENSHOT_DIR, f"{name}.png")
    html_path = os.path.join(DEBUG_SCREENSHOT_DIR, f"{name}.html")
    try:
        await page.screenshot(path=screenshot_path, full_page=True)
        print(f"  Debug screenshot saved: {screenshot_path}")
    except Exception as e:
        print(f"  Failed to save screenshot: {e}")
    try:
        content = await page.content()
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  Debug HTML saved: {html_path}")
    except Exception as e:
        print(f"  Failed to save HTML: {e}")


async def login_to_fangraphs(page, redirect_url: str):
    """Log in to FanGraphs via wp-login.php and redirect to the target page.

    Requires FANGRAPHS_USERNAME and FANGRAPHS_PASSWORD environment variables.
    Exits the process on failure, after saving a debug screenshot.
    """
    username = os.getenv("FANGRAPHS_USERNAME")
    password = os.getenv("FANGRAPHS_PASSWORD")

    if not username or not password:
        print("Error: FANGRAPHS_USERNAME and FANGRAPHS_PASSWORD must be set in .env")
        sys.exit(1)

    login_url = f"{FANGRAPHS_LOGIN_URL}?redirect_to={redirect_url}"
    print("Logging in to FanGraphs...")

    await page.goto(login_url, timeout=60000)

    # Debug: capture page title to detect Cloudflare challenges
    title = await page.title()
    print(f"  Login page title: {title}")

    try:
        await page.wait_for_selector("#user_login", timeout=30000)
    except Exception:
        print("  Could not find #user_login selector — page structure may have changed")
        await save_debug_screenshot(page, "login-form-missing")
        sys.exit(1)

    await page.fill("#user_login", username)
    await page.fill("#user_pass", password)
    await page.click(SUBMIT_SELECTOR)

    # Wait for redirect to complete — should land on the target page
    try:
        await page.wait_for_url(f"**/football/{LEAGUE_ID}/**", timeout=30000)
    except Exception:
        # May have landed on a different page, check if we're logged in
        current_url = page.url
        print(f"  Redirect landed on: {current_url}")
        if "wp-login" in current_url:
            error_text = await page.evaluate("""() => {
                const el = document.querySelector('#login_error');
                return el ? el.innerText.trim() : null;
            }""")
            if error_text:
                print(f"  Login error message: {error_text}")
            else:
                print("  No #login_error element found on page")
            await save_debug_screenshot(page, "login-failed")
            print("  Login appears to have failed. Check credentials.")
            sys.exit(1)

    print(f"  Logged in successfully. Current URL: {page.url}")


# ─── Plain-HTTP login ────────────────────────────────────────────────────────

LOGGED_IN_COOKIE_PREFIX = "wordpress_logged_in_"


class LoginFailedError(RuntimeError):
    """Raised when FanGraphs rejects the login or answers with something unexpected."""


def parse_login_form(html: str) -> tuple[str, dict[str, str]]:
    """(action URL, fields to post) from wp-login.php's `#loginform`.

    Keeps the form's hidden inputs (`redirect_to`, `testcookie`) and one
    `wp-submit` value; the caller adds `log` and `pwd`. Raises LoginFailedError
    when the form is missing (Cloudflare page, re-skin).
    """
    soup = BeautifulSoup(html, "html.parser")
    form = soup.find("form", id="loginform")
    if form is None:
        raise LoginFailedError("No #loginform on the FanGraphs login page — page changed?")
    fields: dict[str, str] = {}
    for el in form.find_all("input"):
        name = el.get("name")
        if not name:
            continue
        kind = (el.get("type") or "text").lower()
        if kind == "hidden":
            fields[name] = el.get("value", "")
        elif kind == "submit" and name not in fields:
            fields[name] = el.get("value", "")
    fields["rememberme"] = "forever"
    return form.get("action") or FANGRAPHS_LOGIN_URL, fields


def login_error_text(html: str) -> str | None:
    """The `#login_error` message on a re-rendered login form, if any."""
    el = BeautifulSoup(html or "", "html.parser").find(id="login_error")
    return " ".join(el.get_text(" ", strip=True).split()) if el else None


def login_succeeded(status: int, cookie_names: list[str]) -> bool:
    """True when the login POST redirected and set the logged-in cookie."""
    return status in (302, 303) and any(n.startswith(LOGGED_IN_COOKIE_PREFIX) for n in cookie_names)


def _check_cloudflare(resp: requests.Response) -> None:
    body = resp.text or ""
    if resp.status_code == 403 or any(m in body for m in CF_MARKERS):
        raise CloudflareBlockedError(
            f"Cloudflare challenge (HTTP {resp.status_code}) at {resp.url}. Check the "
            "User-Agent is honest (a browser UA trips the challenge)."
        )


def login_session(redirect_url: str, user_agent: str, timeout: int = 30) -> requests.Session:
    """A `requests.Session` logged in to FanGraphs, for logged-in Ottoneu pages.

    Uses FANGRAPHS_USERNAME / FANGRAPHS_PASSWORD. `user_agent` must be honest
    (see the module docstring). Raises LoginFailedError or
    CloudflareBlockedError rather than exiting, so callers decide what a failed
    login means.
    """
    username = os.getenv("FANGRAPHS_USERNAME")
    password = os.getenv("FANGRAPHS_PASSWORD")
    if not username or not password:
        raise LoginFailedError("FANGRAPHS_USERNAME and FANGRAPHS_PASSWORD must be set")

    session = requests.Session()
    session.headers.update({"User-Agent": user_agent, "Accept": "text/html, */*"})
    print("Logging in to FanGraphs (HTTP)...")
    resp = session.get(f"{FANGRAPHS_LOGIN_URL}?{urlencode({'redirect_to': redirect_url})}", timeout=timeout)
    _check_cloudflare(resp)
    resp.raise_for_status()
    action, fields = parse_login_form(resp.text)
    fields.update(log=username, pwd=password)

    resp = session.post(action, data=fields, timeout=timeout, allow_redirects=False,
                        headers={"Referer": resp.url})
    _check_cloudflare(resp)
    if not login_succeeded(resp.status_code, [c.name for c in session.cookies]):
        why = login_error_text(resp.text) or f"HTTP {resp.status_code}, no logged-in cookie"
        raise LoginFailedError(f"FanGraphs login failed: {why}")
    print("  Logged in.")
    return session
