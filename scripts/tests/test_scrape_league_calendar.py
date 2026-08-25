"""Tests for the league-calendar scraper's parsing (scripts/scrape_league_calendar.py).

Pure parsing over saved HTML — no network. The fixture mirrors the real finances
page markup, including the two quirks that broke the previous version: the
auction date printed with an abbreviated month and NO year, and a nav <li> that
must not be mistaken for a calendar entry.
"""

from scripts.scrape_league_calendar import _parse_date, parse_calendar

FINANCES_HTML = """
<header><nav><ul>
  <li><a href="/football/309/settings">League Settings</a></li>
  <li><strong>Not A Date</strong> - nav noise outside the section</li>
</ul></nav></header>
<main>
<section class="section-container">
  <header class="section-container-header"><h3>Calendar</h3></header>
  <header class="section-container-header__title-secondary">
    <h4>These are the important dates for the 2026 season</h4>
    <h4>All deadlines are at the end of the day in Eastern Time</h4>
  </header>
  <div class="container">
    <ul>
      <li>
        <strong>Start of Season</strong> -
        January 3, 2026      </li>
      <li>
        <strong>Start of Arbitration</strong> -
        February 15, 2026      </li>
      <li>
        <strong>End of Arbitration</strong> -
        March 31, 2026      </li>
      <li>
        <strong>Keeper Deadline</strong> -
        July 31, 2026 11:59 PM EDT      </li>
      <li>
        <strong>Auction Draft</strong> -
                  Aug 22, 8:00 PM EDT                </li>
      <li>
        <strong>Start of Regular Season</strong> -
                  September 9, 2026                </li>
      <li>
        <strong>Trade Deadline</strong> -
        December 1, 2026 11:59 PM EST      </li>
      <li>
        <strong>Last day to start auctions</strong> -
        December 30, 2026      </li>
      <li>
        <strong>End of Season</strong> -
        January 5, 2027      </li>
    </ul>
  </div>
</section>
</main>
"""

UNSCHEDULED_HTML = FINANCES_HTML.replace(
    "Aug 22, 8:00 PM EDT", "Draft day has not been set yet"
)


class TestParseDate:
    def test_full_month_with_year(self):
        assert _parse_date("January 3, 2026") == "2026-01-03"

    def test_trailing_time_and_timezone_ignored(self):
        assert _parse_date("July 31, 2026 11:59 PM EDT") == "2026-07-31"

    # The auction date is the one Ottoneu prints without a year, and it is the
    # whole reason this scraper runs mid-cycle. An explicit-year-only regex
    # parsed it as None even when the fetch succeeded.
    def test_abbreviated_month_without_year_infers_the_season(self):
        assert _parse_date("Aug 22, 8:00 PM EDT", season=2026) == "2026-08-22"

    def test_year_less_date_without_a_season_is_unparseable(self):
        assert _parse_date("Aug 22, 8:00 PM EDT") is None

    def test_explicit_year_wins_over_the_season_label(self):
        assert _parse_date("January 5, 2027", season=2026) == "2027-01-05"

    def test_unset_placeholder(self):
        assert _parse_date("Draft day has not been set yet", season=2026) is None

    def test_impossible_date(self):
        assert _parse_date("February 31, 2026") is None

    def test_nonsense_month(self):
        assert _parse_date("Smarch 4, 2026") is None


class TestParseCalendar:
    def test_parses_every_mapped_boundary(self):
        row = parse_calendar(FINANCES_HTML)
        assert row["season"] == 2026
        assert row["season_start"] == "2026-01-03"
        assert row["arb_start"] == "2026-02-15"
        assert row["arb_end"] == "2026-03-31"
        assert row["keeper_deadline"] == "2026-07-31"
        assert row["auction_date"] == "2026-08-22"
        assert row["regular_season_start"] == "2026-09-09"
        assert row["trade_deadline"] == "2026-12-01"
        assert row["last_auction_date"] == "2026-12-30"

    def test_raw_keeps_labels_without_a_column(self):
        raw = parse_calendar(FINANCES_HTML)["raw"]
        assert raw["End of Season"] == "January 5, 2027"
        assert raw["Auction Draft"] == "Aug 22, 8:00 PM EDT"

    def test_ignores_list_items_outside_the_calendar_section(self):
        assert "Not A Date" not in parse_calendar(FINANCES_HTML)["raw"]

    def test_unscheduled_auction_is_none_but_other_dates_survive(self):
        row = parse_calendar(UNSCHEDULED_HTML)
        assert row["auction_date"] is None
        assert row["keeper_deadline"] == "2026-07-31"
        assert row["raw"]["Auction Draft"] == "Draft day has not been set yet"

    def test_returns_none_without_the_season_header(self):
        assert parse_calendar("<html><body><p>nothing here</p></body></html>") is None
