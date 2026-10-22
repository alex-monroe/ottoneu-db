"""Tests for the FA market scraper (scripts/scrape_fa_market.py) and its gate.

Pure parsing over saved markup — no network. The rows are lifted from League
309's /auctions and /waivers pages on 2026-10-17, trimmed to what the parser
reads: a college player, an injured NFL player with a news icon and a game line,
and (logged in) the bid box / claim checkbox that carries Ottoneu's ids.
"""

from datetime import date, datetime, timedelta, timezone

from scripts.fa_market_gate import fa_market_due
from scripts.fa_market_gate import main as gate_main
from scripts.scrape_fa_market import (
    MarketRow,
    carry_over,
    claim_deadline,
    parse_auction_page,
    parse_auctions,
    parse_completed_auctions,
    parse_cut_time,
    parse_duration,
    parse_waivers,
    results_to_fetch,
    to_db_rows,
    with_auction_page,
)

BASE = "https://ottoneu.fangraphs.com/football/309"
NOW = datetime(2026, 10, 17, 23, 30, tzinfo=timezone.utc)


def _auctions_page(logged_in: bool) -> str:
    bid = (lambda i: f'<td id="bid_{i}">$<input type="textbox" name="bid[{i}]"></td>') if logged_in else (lambda i: "")
    return f"""
    <main><form class="form" method="POST"><header class="page-header"><h1>
            Active Auctions
          </h1></header>
    <section><table><thead><tr><th>Player</th><th>Auction Ends</th><th>Min Bid</th></tr></thead>
    <tbody>
      <tr class=""><td>
        <a href="{BASE}/player_card/college/139723">Nate Frazier</a> <span class="smaller">UGA JR RB</span> <br />
      </td><td> 1 hours 30 minutes 6 seconds</td><td style="text-align: center;">$1</td>{bid(65506)}
      <tr class=""><td>
        <a href="{BASE}/player_card/nfl/7366">Christian Kirk</a> <span class="smaller">SF WR</span> <span class="injury">IR</span>
        <a class="recent-news" title="Rotowire.com: May be activated Monday" href="{BASE}/player_card/nfl/7366"><i class="far fa-newspaper"></i></a> <br />
        Mon 8:15pm WAS
      </td><td> 3 hours 47 minutes 30 seconds</td><td style="text-align: center;">$2</td>{bid(65513)}
      <tr><td colspan="5"><input type="submit" name="submit" value="Bid"></td></tr>
    </tbody></table></section></form>
    <section><header><h1>2026 Completed Auctions</h1></header><table><tbody>
      <tr><td><a href="{BASE}/player_card/nfl/7063">Calvin Ridley</a> <span class="smaller">TEN WR</span>
        <span class="salary">$3</span></td>
      <td>Oct 17, 2026 9:39 AM</td><td><a href="/football/309/auctions/65463">View</a></td></tr>
      <tr><td><a href="{BASE}/player_card/college/139723">Nate Frazier</a> <span class="smaller">UGA JR RB</span>
        <span class="salary">$1</span></td>
      <td>Oct 15, 2026 12:52 PM</td><td><a href="/football/309/auctions/65400">View</a></td></tr>
    </tbody></table></section></main>
    """


WAIVERS_PAGE = f"""
<main><header class="page-header"><h1>
            Waiver Claims
          </h1><h4>You have <span class="green">$9</span> and 0 roster spot(s) available</h4></header>
<section><form class="form" method="POST"><table>
  <thead><tr><th>Player</th><th>Salary</th><th>Cut Date</th><th>Claim?</th></tr></thead>
  <tbody>
    <tr><td><a href="{BASE}/player_card/nfl/13211">Tyrone Tracy</a> <span class="smaller">NYG RB</span></td>
      <td> $3 </td><td> October 16, 2026 11:54 PM </td>
      <td><input name="claim[393882]" type="checkbox" value="yes"></td></tr>
    <tr><td><a href="{BASE}/player_card/nfl/7184">Courtland Sutton</a> <span class="smaller">DEN WR</span>
      <a class="recent-news" title="Rotowire.com: Remains quiet" href="{BASE}/player_card/nfl/7184"><i></i></a></td>
      <td> $11 </td><td> October 17, 2026 1:54 AM </td>
      <td><input name="claim[393894]" type="checkbox" value="yes"></td></tr>
    <tr><td colspan="4"><input name="submit" type="submit" value="Update Claims"></td></tr>
  </tbody></table></form></section>
<section><header><h1>Completed Claims</h1></header><table><tbody>
  <tr><td><a href="{BASE}/player_card/nfl/15274">Carson Beck</a> <span class="smaller">ARI QB</span></td>
  <td><a href="{BASE}/team/2540">The Triple Helix</a></td></tr>
</tbody></table></section></main>
"""


class TestParseDuration:
    def test_hours_minutes_seconds(self):
        assert parse_duration("1 hours 30 minutes 6 seconds") == timedelta(hours=1, minutes=30, seconds=6)

    def test_singular_units_and_days(self):
        assert parse_duration("1 day 1 hour 1 minute") == timedelta(days=1, hours=1, minutes=1)

    def test_unparseable_is_none(self):
        assert parse_duration("Ended") is None


class TestParseAuctions:
    def test_reads_active_table_only(self):
        rows = parse_auctions(_auctions_page(logged_in=False), NOW)
        assert [r.player_name for r in rows] == ["Nate Frazier", "Christian Kirk"]

    def test_identity_and_countdown(self):
        frazier, kirk = parse_auctions(_auctions_page(logged_in=False), NOW)
        assert frazier.is_college and frazier.ottoneu_id == 139723
        assert (frazier.nfl_team, frazier.position) == ("UGA", "RB")
        assert frazier.player_key == "college:139723"
        assert frazier.ends_at == (NOW + timedelta(hours=1, minutes=30, seconds=6)).isoformat()
        assert not kirk.is_college and kirk.player_key == "nfl:7366"
        assert (kirk.nfl_team, kirk.position, kirk.injury_status) == ("SF", "WR", "IR")
        assert kirk.min_bid == 2

    def test_auction_id_only_when_logged_in(self):
        assert [r.market_id for r in parse_auctions(_auctions_page(False), NOW)] == [None, None]
        assert [r.market_id for r in parse_auctions(_auctions_page(True), NOW)] == [65506, 65513]

    def test_no_heading_is_empty(self):
        assert parse_auctions("<main><h1>Log in</h1></main>", NOW) == []


class TestParseWaivers:
    def test_rows(self):
        tracy, sutton = parse_waivers(WAIVERS_PAGE)
        assert (tracy.player_name, tracy.salary, tracy.market_id) == ("Tyrone Tracy", 3, 393882)
        assert (sutton.nfl_team, sutton.position, sutton.salary) == ("DEN", "WR", 11)
        assert tracy.cut_at_local == "2026-10-16T23:54:00"

    def test_claim_window_is_24h_after_cut_on_eastern_clock(self):
        tracy = parse_waivers(WAIVERS_PAGE)[0]
        # 11:54 PM EDT (UTC-4) on Oct 16, plus 24 hours.
        assert tracy.ends_at == "2026-10-18T03:54:00+00:00"

    def test_claim_deadline_across_dst(self):
        # November 2 2026 is after the fall-back: EST is UTC-5.
        assert claim_deadline(datetime(2026, 11, 2, 9, 0)) == datetime(2026, 11, 3, 14, 0, tzinfo=timezone.utc)

    def test_bad_date_skips_row(self):
        assert parse_cut_time("yesterday") is None


class TestToDbRows:
    def test_resolves_player_id_by_key(self):
        row = MarketRow(kind="auction", ottoneu_id=7, is_college=False, player_name="A",
                        nfl_team="SF", position="WR", injury_status=None, ends_at="x", min_bid=1)
        college = MarketRow(kind="auction", ottoneu_id=7, is_college=True, player_name="B",
                            nfl_team="UGA", position="RB", injury_status=None, ends_at="x", min_bid=1)
        out = to_db_rows([row, college], 309, {"nfl:7": "uuid-a"}, "now")
        assert out[0]["player_id"] == "uuid-a" and out[0]["player_key"] == "nfl:7"
        # Same numeric id in the college number space is a different player.
        assert out[1]["player_id"] is None and out[1]["player_key"] == "college:7"
        assert out[0]["league_id"] == 309 and out[0]["scraped_at"] == "now"


class TestGate:
    def test_due_in_season(self):
        assert fa_market_due({"phase": "in_season"})[0] is True

    def test_not_due_offseason(self):
        for phase in ("pre_arb", "pre_keeper", "pre_draft", "post_draft"):
            assert fa_market_due({"phase": phase})[0] is False

    def test_force_writes_due(self, tmp_path, monkeypatch):
        out = tmp_path / "out"
        monkeypatch.setenv("GITHUB_OUTPUT", str(out))
        assert gate_main(["--force"], today=date(2026, 3, 1)) == 0
        assert out.read_text() == "due=true\n"


# League 309's /auctions/65780 on 2026-10-21, trimmed: a team-link table with
# the bids out of order, to show the parser sorts them.
AUCTION_PAGE = f"""
<main><header class="page-header">
  <h3>Auction for <a href="{BASE}/player_card/nfl/13211">Tyrone Tracy</a> <span class="smaller">NYG RB</span></h3>
  <h3>Started by The Roseman Empire</h3><h5>Ended at Oct 21, 2026 12:52 PM</h5>
</header>
<table><thead><tr><th>Team</th><th>Bid Amount</th></tr></thead><tbody>
  <tr><td><a href="/football/309/team/2625">
            Ball So Hard University          </a></td><td>$5</td></tr>
  <tr><td><a href="/football/309/team/2629">
            Marin County Mountain Runners          </a></td><td>$6</td></tr>
  <tr><td><a href="/football/309/team/2628">The Roseman Empire</a></td><td>$4</td></tr>
</tbody></table></main>
"""


class TestParseCompletedAuctions:
    def test_rows_with_auction_id_salary_and_site_clock_end(self):
        ridley, frazier = parse_completed_auctions(_auctions_page(logged_in=False))
        assert (ridley.auction_id, ridley.player_key, ridley.salary) == (65463, "nfl:7063", 3)
        assert ridley.ended_at_local == "2026-10-17T09:39:00"
        assert (ridley.nfl_team, ridley.position) == ("TEN", "WR")
        assert frazier.player_key == "college:139723" and frazier.ended_at_local == "2026-10-15T12:52:00"

    def test_active_table_is_not_completed(self):
        assert "Christian Kirk" not in [c.player_name for c in parse_completed_auctions(_auctions_page(True))]

    def test_no_heading_is_empty(self):
        assert parse_completed_auctions("<main><h1>Active Auctions</h1><table></table></main>") == []


class TestParseAuctionPage:
    def test_started_by_and_bids_highest_first(self):
        page = parse_auction_page(AUCTION_PAGE)
        assert page["started_by_team_name"] == "The Roseman Empire"
        assert [(b["team_id"], b["amount"]) for b in page["bids"]] == [(2629, 6), (2625, 5), (2628, 4)]
        assert page["bids"][0]["team_name"] == "Marin County Mountain Runners"

    def test_winner_is_the_top_bid(self):
        ridley = parse_completed_auctions(_auctions_page(False))[0]
        done = with_auction_page(ridley, parse_auction_page(AUCTION_PAGE))
        assert (done.winner_team_id, done.winner_team_name) == (2629, "Marin County Mountain Runners")
        assert done.salary == 3  # the table's price, not the top bid (second-price auction)
        assert done.started_by_team_name == "The Roseman Empire"

    def test_no_bids_means_no_winner(self):
        ridley = parse_completed_auctions(_auctions_page(False))[0]
        done = with_auction_page(ridley, parse_auction_page("<main><h3>Started by X</h3></main>"))
        assert done.winner_team_name is None and done.bids == []


class TestResultsToFetch:
    def test_recent_and_unstored_only(self):
        completed = parse_completed_auctions(_auctions_page(False))  # ended Oct 17 and Oct 15
        assert [c.auction_id for c in results_to_fetch(completed, set(), date(2026, 10, 18))] == [65463]
        assert results_to_fetch(completed, {65463}, date(2026, 10, 18)) == []
        assert len(results_to_fetch(completed, set(), date(2026, 10, 17))) == 2


class TestCarryOver:
    ROW = {"player_key": "nfl:7", "scraped_at": "2026-10-21T18:00:00+00:00", "market_id": None}

    def test_new_auction_is_first_seen_now(self):
        out = carry_over([self.ROW], {})
        assert out[0]["first_seen_at"] == "2026-10-21T18:00:00+00:00"

    def test_seen_auction_keeps_its_first_sighting_and_auction_id(self):
        prev = {"nfl:7": {"first_seen_at": "2026-10-21T09:00:00+00:00", "market_id": 65780}}
        out = carry_over([self.ROW], prev)
        assert out[0]["first_seen_at"] == "2026-10-21T09:00:00+00:00"
        assert out[0]["market_id"] == 65780  # a public scrape must not blank it

    def test_a_logged_in_auction_id_wins(self):
        prev = {"nfl:7": {"first_seen_at": "x", "market_id": 1}}
        assert carry_over([{**self.ROW, "market_id": 2}], prev)[0]["market_id"] == 2
