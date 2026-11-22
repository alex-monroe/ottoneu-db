"""Tests for the plain-HTTP FanGraphs login (scripts/fangraphs_login.py).

The form is wp-login.php as FanGraphs served it on 2026-11-22, trimmed to the
inputs: the re-skinned visible "Sign In" submit and the stock hidden "Log In"
one share `name="wp-submit"`. No network: `login_session` runs against a fake
`requests.Session`.
"""

import pytest

from scripts import fangraphs_login
from scripts.fangraphs_login import (
    LoginFailedError,
    login_error_text,
    login_session,
    login_succeeded,
    parse_login_form,
)
from scripts.ottoneu_http import CloudflareBlockedError

REDIRECT = "https://ottoneu.fangraphs.com/football/309/waivers"

LOGIN_PAGE = f"""
<form name="loginform" id="loginform" action="https://blogs.fangraphs.com/wp-login.php" method="post">
  <p><input type="text" name="log" id="user_login" class="input ltr" value="" /></p>
  <div class="wp-pwd"><input type="password" name="pwd" id="user_pass" value="" />
    <button type="button" class="button wp-hide-pw">show</button></div>
  <input type="submit" name="wp-submit" class="fg-login-submit" value="Sign In">
  <p class="forgetmenot"><input name="rememberme" type="checkbox" id="rememberme" value="forever" /></p>
  <p class="submit">
    <input type="submit" name="wp-submit" id="wp-submit" value="Log In" />
    <input type="hidden" name="redirect_to" value="{REDIRECT}" />
    <input type="hidden" name="testcookie" value="1" />
  </p>
</form>
"""

ERROR_PAGE = """
<div id="login_error" class="notice notice-error"><p>
  <strong>Error:</strong> The password you entered for the username <strong>x</strong> is incorrect.
</p></div>
""" + LOGIN_PAGE


def test_parse_login_form_keeps_hidden_fields_and_one_submit():
    action, fields = parse_login_form(LOGIN_PAGE)
    assert action == "https://blogs.fangraphs.com/wp-login.php"
    assert fields == {
        "wp-submit": "Sign In",
        "redirect_to": REDIRECT,
        "testcookie": "1",
        "rememberme": "forever",
    }


def test_parse_login_form_never_carries_credentials_fields():
    _, fields = parse_login_form(LOGIN_PAGE)
    assert "log" not in fields and "pwd" not in fields


def test_parse_login_form_missing_form_raises():
    with pytest.raises(LoginFailedError):
        parse_login_form("<html><body>Something else</body></html>")


def test_login_error_text():
    assert login_error_text(ERROR_PAGE).startswith("Error: The password you entered")
    assert login_error_text(LOGIN_PAGE) is None
    assert login_error_text("") is None


@pytest.mark.parametrize("status, cookies, ok", [
    (302, ["wordpress_test_cookie", "wordpress_logged_in_abc123"], True),
    (303, ["wordpress_logged_in_abc123"], True),
    (302, ["wordpress_test_cookie"], False),  # redirect without a session
    (200, ["wordpress_logged_in_abc123"], False),  # form re-rendered
])
def test_login_succeeded(status, cookies, ok):
    assert login_succeeded(status, cookies) is ok


# ─── login_session against a fake requests.Session ──────────────────────────


class _Cookie:
    def __init__(self, name):
        self.name = name


class _Resp:
    def __init__(self, status, text="", url=""):
        self.status_code, self.text, self.url = status, text, url

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


def _fake_session(get_resp, post_resp, post_cookies):
    calls = {}

    class FakeSession:
        def __init__(self):
            self.headers = {}
            self.cookies = [_Cookie("wordpress_test_cookie")]

        def get(self, url, **kw):
            calls["get"] = url
            return get_resp

        def post(self, url, data=None, **kw):
            calls["post"] = (url, data, kw)
            self.cookies += [_Cookie(n) for n in post_cookies]
            return post_resp

    return FakeSession, calls


@pytest.fixture
def creds(monkeypatch):
    monkeypatch.setenv("FANGRAPHS_USERNAME", "someone")
    monkeypatch.setenv("FANGRAPHS_PASSWORD", "not-a-real-password")


def test_login_session_posts_form_and_returns_session(monkeypatch, creds):
    cls, calls = _fake_session(
        _Resp(200, LOGIN_PAGE, "https://blogs.fangraphs.com/wp-login.php"),
        _Resp(302),
        ["wordpress_logged_in_abc"],
    )
    monkeypatch.setattr(fangraphs_login.requests, "Session", cls)
    session = login_session(REDIRECT, "test-agent/1.0")
    assert session.headers["User-Agent"] == "test-agent/1.0"
    assert "redirect_to=https%3A%2F%2Fottoneu.fangraphs.com" in calls["get"]
    url, data, kw = calls["post"]
    assert url == "https://blogs.fangraphs.com/wp-login.php"
    assert data["log"] == "someone" and data["redirect_to"] == REDIRECT and data["testcookie"] == "1"
    assert kw["allow_redirects"] is False


def test_login_session_bad_password_raises_with_message(monkeypatch, creds):
    cls, _ = _fake_session(_Resp(200, LOGIN_PAGE), _Resp(200, ERROR_PAGE), [])
    monkeypatch.setattr(fangraphs_login.requests, "Session", cls)
    with pytest.raises(LoginFailedError, match="password you entered"):
        login_session(REDIRECT, "test-agent/1.0")


def test_login_session_cloudflare_challenge_raises(monkeypatch, creds):
    cls, _ = _fake_session(_Resp(403, "<title>Just a moment...</title>"), _Resp(302), [])
    monkeypatch.setattr(fangraphs_login.requests, "Session", cls)
    with pytest.raises(CloudflareBlockedError):
        login_session(REDIRECT, "test-agent/1.0")


def test_login_session_without_credentials_raises(monkeypatch):
    monkeypatch.delenv("FANGRAPHS_USERNAME", raising=False)
    monkeypatch.delenv("FANGRAPHS_PASSWORD", raising=False)
    with pytest.raises(LoginFailedError):
        login_session(REDIRECT, "test-agent/1.0")


# ─── The FA market scrape's logged-in path over one session ─────────────────


class _PageSession:
    """Serves Ottoneu paths from a dict, recording the headers each GET sent."""

    def __init__(self, pages):
        self.pages, self.sent = pages, []

    def get(self, url, headers=None, **kw):
        self.sent.append((url, headers))
        status, body = self.pages[url.removeprefix("https://ottoneu.fangraphs.com")]
        resp = _Resp(status, body, url)
        resp.headers = {"location": "/football/309/"} if status == 307 else {}
        return resp


def test_fetch_logged_in_reads_both_pages_over_the_login_session(monkeypatch):
    from scripts import scrape_fa_market

    session = _PageSession({
        "/football/309/waivers": (200, "<h1>Waiver Claims</h1>"),
        "/football/309/auctions": (200, "<h1>Active Auctions</h1>"),
    })
    seen = {}
    monkeypatch.setattr(scrape_fa_market, "login_session",
                        lambda redirect, ua: seen.update(redirect=redirect, ua=ua) or session)
    monkeypatch.setenv("OTTONEU_COOKIE", "stale=1")  # must not override the session's cookies

    auctions, waivers = scrape_fa_market.fetch_logged_in(309)
    assert "Active Auctions" in auctions and "Waiver Claims" in waivers
    assert seen["redirect"] == "https://ottoneu.fangraphs.com/football/309/waivers"
    assert seen["ua"] == scrape_fa_market.USER_AGENT and "Mozilla" not in seen["ua"]
    assert all("Cookie" not in headers for _, headers in session.sent)


def test_fetch_logged_in_waivers_redirect_means_login_did_not_take(monkeypatch):
    from scripts import scrape_fa_market
    from scripts.ottoneu_http import GatedPageError

    session = _PageSession({"/football/309/waivers": (307, "")})
    monkeypatch.setattr(scrape_fa_market, "login_session", lambda redirect, ua: session)
    with pytest.raises(GatedPageError):
        scrape_fa_market.fetch_logged_in(309)
