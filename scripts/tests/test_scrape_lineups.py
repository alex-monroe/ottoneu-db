"""Tests for the box-score lineup scraper (scripts/scrape_lineups.py).

Pure parsing over markup lifted from the live 2026 Week 1 box score — no
network. The builder below reproduces the page's one structural trap on
purpose: its `<tr>`s are never closed, so html.parser nests every row inside the
one before it, and anything that walks rows (rather than keying on the
per-player classes) reads the wrong player's points.
"""

import pytest

from scripts.scrape_lineups import (
    BoxScoreParseError,
    derive_game_state,
    missing_team_ids,
    parse_box_score,
    to_db_rows,
)


def _cell(side, pid, name, team_pos, slot, slot_number, game_info, injury=""):
    injury_html = f'<span class="injury">{injury}</span>' if injury else ""
    return (
        f'<td class="{side}-team-position-player game-page-{side}-team-text" '
        f'data-player-id="{pid}" data-position="{slot}" data-slot-number="{slot_number}">'
        f'<span class="player-link-desktop"><a href="/football/309/player_card/nfl/{pid}">{name}</a>'
        f'<span class="smaller">{team_pos}</span>{injury_html}</span>'
        f'<span class="player-link-mobile"><a href="#">{name[0]}. X</a>{injury_html}</span><br/>'
        f'<span class="player-game-info smaller player-game-info-{pid}">'
        f'<span class="desktop-only">{game_info}</span><span class="mobile-only">{game_info}</span>'
        f"</span></td>"
    )


def _row(slot, slot_number, home, away):
    """One interleaved row: stats | home | proj | pts | pos | pts | proj | away | stats.

    `home`/`away` are (pid, name, team_pos, points_text, proj_text, game_info,
    stat_line, injury). Deliberately no closing </tr>, as on the real page.
    """
    hp, hn, ht, hpts, hproj, hinfo, hstat, hinj = home
    ap, an, at, apts, aproj, ainfo, astat, ainj = away
    return (
        f'<tr class="player-position-{slot}">'
        f'<td class="player-stat-details player-stat-details-{hp}">{hstat}</td>'
        + _cell("home", hp, hn, ht, slot, slot_number, hinfo, hinj)
        + f'<td class="game-page-proj-points player-proj-points-{hp}">{hproj}</td>'
        f'<td class="game-page-points player-points-{hp}">{hpts}</td>'
        f'<td class="game-details-position"><span class="position">{slot}</span></td>'
        f'<td class="game-page-points player-points-{ap}">{apts}</td>'
        f'<td class="game-page-proj-points player-proj-points-{ap}">{aproj}</td>'
        + _cell("away", ap, an, at, slot, slot_number, ainfo, ainj)
        + f'<td class="player-stat-details player-stat-details-{ap}">{astat}</td>'
    )


LAMAR = (7326, "Lamar Jackson", "BAL QB", "---", "19.40", "Sun 1:00pm @IND", "", "")
MAYE = (13095, "Drake Maye", "NE QB", "9.82", "9.82", "L 10-13 @SEA",
        "23-33 178yds 1TD 3INT<br/>7rush 47yds<br/>", "")
KYREN = (10643, "Kyren Williams", "LA RB", "---", "13.54", "Thu 8:35pm SF", "", "")
BOWERS = (13024, "Brock Bowers", "LV TE", "---", "0.00", "Sun 4:25pm MIA", "", "OUT")
BRISSETT = (5529, "Jacoby Brissett", "ARI QB", "---", "10.91", "Sun 4:25pm @LAC", "", "")
WINSTON = (4956, "Jameis Winston", "NYG QB", "---", "0.00", "Sun 8:20pm DAL", "", "")


def _page(rows_html, header="2026 Week 1"):
    # The per-team summary tables further down repeat player-points-{id}
    # spans with the SAME ids; a parser that searches the whole document
    # rather than the details table can pick those up instead.
    return f"""
    <main><h2>{header}</h2>
    <div class="table-container">
      <div class="team-scores">
        <div class="home-team-details"><a href="https://ottoneu.fangraphs.com/football/309/team/2623">Irish Invasion</a></div>
        <div class="away-team-details"><a href="https://ottoneu.fangraphs.com/football/309/team/2531">Tinseltown Little Gold Men</a></div>
      </div>
      <table class="game-details-table"><thead><tr><th>Stats</th></tr></thead>
      <tbody>{rows_html}</tbody></table>
    </div>
    <h3>Tinseltown Little Gold Men</h3>
    <table class="full-stats-table"><tbody><tr><td><span class="player-points-13095">99.99</span></td></tr></tbody></table>
    </main>
    """


PAGE = _page(
    _row("QB", 0, LAMAR, MAYE)
    + _row("RB", 0, KYREN, BOWERS)
    + _row("Bench", 0, BRISSETT, WINSTON)
)


def _by_id(parsed):
    return {p["ottoneu_id"]: p for p in parsed["players"]}


class TestParseBoxScore:
    def test_reads_both_teams_and_the_week(self):
        parsed = parse_box_score(PAGE)
        assert parsed["season"] == 2026 and parsed["week"] == 1
        assert parsed["home"] == {"team_id": 2623, "team_name": "Irish Invasion"}
        assert parsed["away"] == {"team_id": 2531, "team_name": "Tinseltown Little Gold Men"}

    def test_every_player_is_read_once_despite_nested_rows(self):
        parsed = parse_box_score(PAGE)
        assert sorted(_by_id(parsed)) == sorted([7326, 13095, 10643, 13024, 5529, 4956])
        assert len(parsed["players"]) == 6

    def test_sides_come_from_the_cell_class(self):
        players = _by_id(parse_box_score(PAGE))
        assert players[7326]["side"] == "home"
        assert players[13095]["side"] == "away"

    def test_points_are_read_from_the_details_table_not_the_summary(self):
        # The summary table below carries a decoy 99.99 for the same player.
        assert _by_id(parse_box_score(PAGE))[13095]["points"] == 9.82

    def test_unplayed_points_are_null_not_zero(self):
        assert _by_id(parse_box_score(PAGE))[7326]["points"] is None

    def test_slot_codes_and_starter_flag(self):
        players = _by_id(parse_box_score(PAGE))
        assert players[7326]["slot"] == "QB" and players[7326]["is_starter"]
        assert players[5529]["slot"] == "BN" and not players[5529]["is_starter"]

    def test_flex_and_superflex_are_shortened(self):
        page = _page(
            _row("Flex", 0, KYREN, BOWERS) + _row("Superflex", 0, LAMAR, MAYE)
        )
        players = _by_id(parse_box_score(page))
        assert players[10643]["slot"] == "FLEX"
        assert players[7326]["slot"] == "SFLX"

    def test_team_position_and_injury(self):
        bowers = _by_id(parse_box_score(PAGE))[13024]
        assert (bowers["nfl_team"], bowers["position"]) == ("LV", "TE")
        assert bowers["injury_status"] == "OUT"
        assert _by_id(parse_box_score(PAGE))[7326]["injury_status"] is None

    def test_game_line_and_stat_line(self):
        maye = _by_id(parse_box_score(PAGE))[13095]
        assert maye["game_info"] == "L 10-13 @SEA"
        assert maye["game_state"] == "final"
        assert maye["stat_line"] == "23-33 178yds 1TD 3INT, 7rush 47yds"

    def test_a_page_without_the_lineup_table_raises(self):
        with pytest.raises(BoxScoreParseError, match="game-details-table"):
            parse_box_score("<main><h1>Please log in</h1></main>")

    def test_a_lineup_table_with_no_players_raises(self):
        with pytest.raises(BoxScoreParseError, match="no players"):
            parse_box_score(_page(""))


class TestDeriveGameState:
    @pytest.mark.parametrize(
        "info, points, expected",
        [
            ("Sun 1:00pm @IND", None, "scheduled"),
            ("Thu 8:35pm SF", None, "scheduled"),
            ("Mon 8:15pm @KC", None, "scheduled"),
            ("L 10-13 @SEA", 9.82, "final"),
            ("W 13-10 NE", 0.0, "final"),
            ("T 20-20 NYG", 3.0, "final"),
            ("BYE", None, "bye"),
            # Anything that is neither a kickoff nor a result is a game under way.
            ("Q3 5:12 7-10 @LA", 4.5, "in_progress"),
            ("Half 14-3 SF", 2.0, "in_progress"),
            ("", 3.2, "in_progress"),
            ("", None, "scheduled"),
            (None, None, "scheduled"),
        ],
    )
    def test_states(self, info, points, expected):
        assert derive_game_state(info, points) == expected


class TestToDbRows:
    GAME = {
        "game_id": 7286890, "season": 2026, "week": 1,
        "home_team_id": 2623, "home_team_name": "Irish Invasion",
        "away_team_id": 2531, "away_team_name": "Tinseltown Little Gold Men",
    }

    def test_rows_carry_the_game_and_the_matched_player(self):
        rows = to_db_rows(parse_box_score(PAGE), self.GAME, {7326: "uuid-lamar"}, 309, "now")
        lamar = next(r for r in rows if r["ottoneu_id"] == 7326)
        assert lamar["player_id"] == "uuid-lamar"
        assert (lamar["league_id"], lamar["game_id"], lamar["season"], lamar["week"]) == (
            309, 7286890, 2026, 1,
        )
        assert (lamar["team_id"], lamar["team_name"]) == (2623, "Irish Invasion")

    def test_an_unknown_player_keeps_his_row_by_name(self):
        rows = to_db_rows(parse_box_score(PAGE), self.GAME, {}, 309, "now")
        assert all(r["player_id"] is None for r in rows)
        assert {r["player_name"] for r in rows} >= {"Lamar Jackson", "Drake Maye"}

    def test_team_ids_fall_back_to_the_page_header(self):
        rows = to_db_rows(parse_box_score(PAGE), {"game_id": 1}, {}, 309, "now")
        assert {r["team_id"] for r in rows} == {2623, 2531}
        assert rows[0]["season"] == 2026
        assert missing_team_ids(rows) == []

    def test_missing_team_ids_are_reported(self):
        page = PAGE.replace("/team/2531", "/nowhere")
        rows = to_db_rows(parse_box_score(page), {"game_id": 5}, {}, 309, "now")
        assert missing_team_ids(rows) == ["game 5 away"]
