"""Tests for the trade-history scraper's parsing (scripts/scrape_trade_history.py).

Pure parsing over saved markup — no network. The rows below were lifted from the
live league's /trade_history and /view_trade pages, trimmed to what the parser
reads: a pending trade with a loan and a college player, a processed trade whose
player carries an injury badge and a news icon before his salary, and a side
that gives up nothing.
"""

from scripts.scrape_trade_history import (
    STATUS_PENDING,
    STATUS_PROCESSED,
    ParsedTrade,
    TradeSide,
    asset_rows,
    build_player_id_map,
    needs_detail,
    parse_ottoneu_datetime,
    parse_trade_detail,
    parse_trade_history,
    removed_trade_ids,
    trade_row,
)

BASE = "https://ottoneu.fangraphs.com/football/309"


def _player(level, oid, name, salary, extra=""):
    return (f'<br /><a href="{BASE}/player_card/{level}/{oid}">{name}</a>{extra} ${salary}')


INJURY = (' <span class="injury">Q</span> <a class="recent-news" target="_blank" '
          f'title="Rotowire.com: Sits out" href="{BASE}/player_card/nfl/7298">'
          '<i class="far fa-newspaper golden" aria-hidden="true"></i></a>')


def _row(trade_id, when, by, by_items, to, to_items, status):
    return f"""
      <tr>
        <td><a href="{BASE}/view_trade/{trade_id}">{when}</a></td>
        <td>
          <a href="{BASE}/team/{by[0]}">{by[1]}</a>          {by_items}        </td>
        <td>
          <a href="{BASE}/team/{to[0]}">{to[1]}</a>          {to_items}        </td>
        <td>
                      {status}
                    </td>
      </tr>"""


LIST_HTML = f"""
<main>
  <header class="page-header"><h1>The SOFA Trade History</h1></header>
  <header class="section-container-header"><h3>Accepted Trades</h3></header>
  <div class="table-container"><table class="sortable">
    <thead><tr><th>Date</th><th>Offered By</th><th>To</th><th>Status</th></tr></thead>
    <tbody>
    {_row(44322, "October 14, 2026 8:45 PM",
          (2531, "Tinseltown Little Gold Men"),
          _player("nfl", 2293, "Kirk Cousins", 14)
          + _player("college", 133832, "CJ Carr", 2),
          (2626, "Pacific Punt Masters"),
          _player("nfl", 10707, "Drake London", 73)
          + "            <br />Loan: $82                    ",
          "Awaiting League Approval")}
    {_row(44158, "October 8, 2026 10:27 PM",
          (2514, "The Witchcraft"),
          _player("nfl", 7298, "DJ Moore", 16, INJURY),
          (2623, "Irish Invasion"),
          _player("nfl", 10719, "Wan'Dale Robinson", 7),
          "Processed")}
    {_row(43371, "August 26, 2026 9:58 PM",
          (2625, "Ball So Hard University"),
          _player("nfl", 9999, "Baker Mayfield", 23),
          (2624, "The Trigeminal Thunderclaps"),
          "",
          "Processed")}
    </tbody>
  </table></div>
</main>
"""

DETAIL_PROCESSED = """
<main>
  <header class="section-container-header trade-status">
    <h2>Processed on October 14, 2026 6:32 AM</h2>
    <h4>
      0 vetoed
      2 approved
    </h4>
  </header>
  <section><header><h4><a href="/football/309/team/2540">The Triple Helix</a> gives up</h4></header>
    <table><tbody>
      <tr><td><a href="https://ottoneu.fangraphs.com/football/309/player_card/nfl/14304">Omarion Hampton</a> <span class="smaller">LAC RB</span></td><td>$54</td></tr>
      <tr><td>Loan</td><td>$18</td></tr>
    </tbody></table>
  </section>
</main>
"""

DETAIL_PENDING = """
<main>
  <header class="section-container-header trade-status">
      <h2>
      Accepted on October 14, 2026 8:45 PM    </h2>
    <h4>
      Will be processed on October 16, 2026 8:45 PM    </h4>
  </header>
  <table><tbody>
    <tr><td><a href="https://ottoneu.fangraphs.com/football/309/player_card/college/133832">CJ Carr</a> <span class="smaller">ND JR QB</span></td><td>$2</td></tr>
  </tbody></table>
</main>
"""


class TestParseTradeHistory:
    def test_parses_every_row(self):
        trades = parse_trade_history(LIST_HTML)
        assert [t.trade_id for t in trades] == [44322, 44158, 43371]

    def test_accepted_time_and_status(self):
        pending, processed, _ = parse_trade_history(LIST_HTML)
        assert pending.accepted_at == "2026-10-14T20:45:00"
        assert pending.status == STATUS_PENDING
        assert pending.status_label == "Awaiting League Approval"
        assert processed.status == STATUS_PROCESSED

    def test_each_side_lists_what_it_gives_up(self):
        pending = parse_trade_history(LIST_HTML)[0]
        assert pending.offered_by.team_id == 2531
        assert pending.offered_by.team_name == "Tinseltown Little Gold Men"
        gives = [(a.asset_type, a.player_name, a.amount) for a in pending.offered_by.gives]
        assert gives == [("player", "Kirk Cousins", 14), ("player", "CJ Carr", 2)]

    def test_loan_belongs_to_the_side_that_lists_it(self):
        pending = parse_trade_history(LIST_HTML)[0]
        loans = [a for a in pending.offered_to.gives if a.asset_type == "loan"]
        assert [(a.amount, a.asset_key) for a in loans] == [(82, "loan")]
        assert not [a for a in pending.offered_by.gives if a.asset_type == "loan"]

    def test_college_player_keeps_its_namespace(self):
        carr = parse_trade_history(LIST_HTML)[0].offered_by.gives[1]
        assert carr.is_college is True
        assert carr.asset_key == "college:133832"

    def test_injury_badge_and_news_icon_do_not_break_salary(self):
        moore = parse_trade_history(LIST_HTML)[1].offered_by.gives
        assert [(a.player_name, a.ottoneu_id, a.amount) for a in moore] == [
            ("DJ Moore", 7298, 16)]

    def test_side_that_gives_nothing(self):
        trade = parse_trade_history(LIST_HTML)[2]
        assert trade.offered_to.gives == []
        assert trade.offered_to.team_name == "The Trigeminal Thunderclaps"

    def test_empty_history_page_is_not_an_error(self):
        html = "<main><h1>The SOFA Trade History</h1><table><tbody></tbody></table></main>"
        assert parse_trade_history(html) == []


class TestParseTradeDetail:
    def test_processed_time_and_votes(self):
        detail = parse_trade_detail(DETAIL_PROCESSED)
        assert detail.processed_at == "2026-10-14T06:32:00"
        assert (detail.approve_votes, detail.veto_votes) == (2, 0)

    def test_player_team_and_position(self):
        detail = parse_trade_detail(DETAIL_PROCESSED)
        assert detail.player_info == {"nfl:14304": ("LAC", "RB")}

    def test_pending_trade_has_scheduled_processing_time(self):
        detail = parse_trade_detail(DETAIL_PENDING)
        assert detail.processed_at == "2026-10-16T20:45:00"
        assert detail.approve_votes is None
        # "ND JR QB": the school, then class, then position.
        assert detail.player_info == {"college:133832": ("ND", "QB")}


class TestShaping:
    def test_assets_flow_from_giver_to_receiver(self):
        trade = parse_trade_history(LIST_HTML)[0]
        player_ids = build_player_id_map([
            {"id": "uuid-cousins", "ottoneu_id": 2293, "is_college": False},
            {"id": "uuid-carr", "ottoneu_id": 133832, "is_college": True},
        ])
        rows = asset_rows(trade, 309, None, player_ids, "now")
        by_key = {r["asset_key"]: r for r in rows}
        assert by_key["nfl:2293"]["from_team_name"] == "Tinseltown Little Gold Men"
        assert by_key["nfl:2293"]["to_team_name"] == "Pacific Punt Masters"
        assert by_key["nfl:2293"]["player_id"] == "uuid-cousins"
        assert by_key["college:133832"]["player_id"] == "uuid-carr"
        assert by_key["loan"]["from_team_name"] == "Pacific Punt Masters"
        assert by_key["loan"]["amount"] == 82
        assert by_key["loan"]["player_id"] is None

    def test_player_id_lookup_respects_college_flag(self):
        ids = build_player_id_map([{"id": "nfl-row", "ottoneu_id": 5, "is_college": False}])
        assert ids.get((5, True)) is None
        assert ids[(5, False)] == "nfl-row"

    def test_trade_row_keeps_earlier_detail_when_not_refetched(self):
        trade = parse_trade_history(LIST_HTML)[1]
        existing = {"processed_at": "2026-10-10T22:27:00", "approve_votes": 3, "veto_votes": 1}
        row = trade_row(trade, 309, None, existing, "now")
        assert row["season"] == 2026
        assert row["processed_at"] == "2026-10-10T22:27:00"
        assert (row["approve_votes"], row["veto_votes"]) == (3, 1)


class TestRefreshPolicy:
    def _trade(self, status):
        side = TradeSide(1, "A")
        return ParsedTrade(1, "2026-10-01T00:00:00", status, status, side, side)

    def test_new_trade_fetches_detail(self):
        assert needs_detail(self._trade(STATUS_PROCESSED), None)

    def test_known_processed_trade_does_not(self):
        existing = {"processed_at": "2026-10-03T00:00:00"}
        assert not needs_detail(self._trade(STATUS_PROCESSED), existing)

    def test_pending_trade_always_refetches(self):
        assert needs_detail(self._trade(STATUS_PENDING), {"processed_at": "x"})

    def test_pending_trade_gone_from_list_is_removed(self):
        existing = {1: {"status": "pending"}, 2: {"status": "processed"}, 3: {"status": "pending"}}
        assert removed_trade_ids(existing, listed={3}) == [1]


def test_parse_ottoneu_datetime():
    assert parse_ottoneu_datetime("September 9, 2025 8:03 PM") == "2025-09-09T20:03:00"
    assert parse_ottoneu_datetime("not a date") is None
