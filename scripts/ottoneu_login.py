"""Interactive helper: capture an authenticated Ottoneu session for the scraper.

Ottoneu's search page now sits behind a Cloudflare bot challenge that a headless,
datacenter-IP browser cannot clear, so anonymous scrapes fail with a
``Just a moment...`` interstitial and every ``scrape_roster`` job times out. This
script opens a *visible* browser on your own machine so you can sign in (and clear
any Cloudflare check) by hand, then saves the resulting Playwright storage_state
— cookies *and* localStorage — to disk. The scraper worker loads that file to
reuse your logged-in session.

Run it from your local machine (a residential IP), not CI:

    just ottoneu-login

Re-run whenever the session expires and the scrape starts hitting the challenge
again. The saved file (``OTTONEU_STORAGE_STATE_PATH``) is gitignored — it holds a
live login, so never commit it.
"""

from __future__ import annotations

import asyncio

from playwright.async_api import async_playwright

from scripts.config import LEAGUE_ID, OTTONEU_STORAGE_STATE_PATH

SEARCH_URL = f"https://ottoneu.fangraphs.com/football/{LEAGUE_ID}/search"


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )
        page = await context.new_page()
        await page.goto(SEARCH_URL, timeout=60000)

        print("\n" + "=" * 70)
        print("A browser window has opened.")
        print("  1. Sign in to Ottoneu / FanGraphs in that window.")
        print("  2. Wait until the league search page and its player table are")
        print("     visible (the Cloudflare 'Just a moment...' page is gone).")
        print("  3. Return here and press Enter to save the session.")
        print("=" * 70)
        input("\nPress Enter once you are logged in and the search page has loaded... ")

        # Re-visit the search page so its origin's localStorage is captured, and
        # confirm the authenticated table is actually reachable before saving.
        await page.goto(SEARCH_URL, timeout=60000)
        try:
            await page.wait_for_selector("a.top_players", timeout=15000)
            print("Search page loaded successfully (a.top_players found).")
        except Exception:
            print(
                "WARNING: could not confirm the search page loaded "
                "(a.top_players not found). Saving the session anyway — if the "
                "scrape still fails, re-run this and make sure the player table "
                "is visible before pressing Enter."
            )

        await context.storage_state(path=str(OTTONEU_STORAGE_STATE_PATH))
        print(f"\nSaved authenticated session to {OTTONEU_STORAGE_STATE_PATH}")
        print("The scraper will now pick it up automatically. Run `just scrape`.")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
