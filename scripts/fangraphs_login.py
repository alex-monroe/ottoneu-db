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
"""

from __future__ import annotations

import os
import sys

from scripts.config import LEAGUE_ID

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
