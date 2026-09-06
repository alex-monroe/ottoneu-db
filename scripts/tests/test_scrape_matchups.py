"""Tests for the matchup scraper's parsing (scripts/scrape_matchups.py).

Pure parsing over saved markup — no network. The fixtures mirror the two shapes
the real schedule page takes: an unplayed slate (scores printed as 0.00, status
label a date) and a postseason week (badged playoff games sitting beside
unbadged consolation ones). Both were lifted from the live league pages.
"""

import pytest

from scripts.scrape_matchups import (
    _derive_status,
    merge,
    parse_schedule,
    parse_schedule_csv,
    ScheduleParseError,
)


def _game(game_id, home, home_score, away, away_score, status="Sep 9", icon=""):
    label = f'<i class="{icon}"></i>' if icon else ""
    return (
        f"<li id='game-{game_id}'>"
        f"<div class='game-status'>{label}{status}</div>"
        f"<div><a href='/football/309/game/{game_id}'>"
        f"<div class='other-game-home-team'>{home}"
        f"<span class='other-game-score home-score'>{home_score}</span></div>"
        f"<div class='other-game-away-team'>{away}"
        f"<span class='other-game-score away-score'>{away_score}</span></div>"
        f"</a></div></li>"
    )


SCHEDULE_HTML = f"""
<main>
  <header class="page-header"><div><div>
    <h1>The SOFA 2026 Schedule</h1>
    <h4><a href="/football/309/csv/schedule">Export as .csv</a></h4>
  </div></div></header>
  <div class="table-container">
    <header class="section-container-header">
      <h2>Week 1</h2>
      <h3>September 9 to September 15</h3>
    </header>
    <ul class="other-games">
      {_game(7286890, "Irish Invasion", "0.00", "Tinseltown Little Gold Men", "0.00")}
      {_game(7286891, "The Hard Eight ", "0.00", "The Roseman Empire", "0.00")}
    </ul>
  </div>
  <div class="table-container">
    <header class="section-container-header">
      <h2>Week 2</h2>
      <h3>September 16 to September 22</h3>
    </header>
    <ul class="other-games">
      {_game(7286896, "Irish Invasion", "112.40", "The Roseman Empire", "98.10",
             status="Final")}
      {_game(7286897, "The Hard Eight ", "51.02", "The Witchcraft", "44.90",
             status="Q3 4:12")}
    </ul>
  </div>
</main>
"""

# Weeks 15-17 as the league actually renders them: two badged bracket games and
# two unbadged consolation games sharing a week.
POSTSEASON_HTML = f"""
<main>
  <h1>The SOFA 2025 Schedule</h1>
  <div class="table-container">
    <header class="section-container-header"><h2>Week 15</h2>
      <h3>December 9 to December 15</h3></header>
    <ul class="other-games">
      {_game(7286544, "The Triple Helix", "140.78", "Ball So Hard University",
             "119.76", status="Final", icon="game-label-playoff fa fa-bell")}
      {_game(7286546, "The Trigeminal Thunderclaps", "100.34", "The Witchcraft",
             "118.50", status="Final")}
    </ul>
  </div>
  <div class="table-container">
    <header class="section-container-header"><h2>Week 17</h2>
      <h3>December 23 to December 29</h3></header>
    <ul class="other-games">
      {_game(7286798, "The Roseman Empire", "155.68", "The Triple Helix", "118.54",
             status="Final", icon="game-label-championship fa fa-trophy")}
      {_game(7286799, "Marin County Mountain Runners", "81.08", "The Golden Gouda",
             "93.12", status="Final", icon="game-label-third-place fa fa-trophy")}
    </ul>
  </div>
</main>
"""

SCHEDULE_CSV = (
    '"Game ID","Week ID","Home Team ID","Home Team Name","Home Team Score",'
    '"Away Team ID","Away Team Name","Away Team Score"\n'
    '7286890,1,2623,"Irish Invasion",0.00,2531,"Tinseltown Little Gold Men",0.00\n'
    '7286891,1,2627,"The Hard Eight ",0.00,2628,"The Roseman Empire",0.00\n'
    '7286896,2,2623,"Irish Invasion",112.40,2628,"The Roseman Empire",98.10\n'
    '7286897,2,2627,"The Hard Eight ",51.02,2514,"The Witchcraft",44.90\n'
)


class TestParseSchedule:
    def test_reads_the_season_off_the_header(self):
        season, _ = parse_schedule(SCHEDULE_HTML)
        assert season == 2026

    def test_finds_every_game_with_its_week(self):
        _, games = parse_schedule(SCHEDULE_HTML)
        assert [g["game_id"] for g in games] == [7286890, 7286891, 7286896, 7286897]
        assert [g["week"] for g in games] == [1, 1, 2, 2]

    def test_week_window_is_dated_from_the_season(self):
        _, games = parse_schedule(SCHEDULE_HTML)
        assert games[0]["starts_on"] == "2026-09-09"
        assert games[0]["ends_on"] == "2026-09-15"

    def test_team_name_excludes_the_score_span(self):
        """The score is nested inside the team div; a naive read yields
        'Irish Invasion0.00'."""
        _, games = parse_schedule(SCHEDULE_HTML)
        assert games[0]["home_team_name"] == "Irish Invasion"
        assert games[0]["home_score"] == 0.0

    def test_status_reflects_what_the_page_shows(self):
        _, games = parse_schedule(SCHEDULE_HTML)
        by_id = {g["game_id"]: g for g in games}
        assert by_id[7286890]["status"] == "scheduled"
        assert by_id[7286896]["status"] == "final"
        # An unrecognised in-week label plus points on the board reads as live.
        assert by_id[7286897]["status"] == "in_progress"
        assert by_id[7286897]["status_label"] == "Q3 4:12"

    def test_raises_when_the_header_is_missing(self):
        with pytest.raises(ScheduleParseError):
            parse_schedule("<main><p>Nothing here</p></main>")


class TestPostseason:
    def test_bracket_icons_become_game_types(self):
        _, games = parse_schedule(POSTSEASON_HTML)
        by_id = {g["game_id"]: g for g in games}
        assert by_id[7286544]["game_type"] == "playoff"
        assert by_id[7286798]["game_type"] == "championship"
        assert by_id[7286799]["game_type"] == "third_place"

    def test_unbadged_game_in_a_playoff_week_is_consolation(self):
        """Left as 'regular' it would count toward the standings — the whole
        reason game_type is stored."""
        _, games = parse_schedule(POSTSEASON_HTML)
        by_id = {g["game_id"]: g for g in games}
        assert by_id[7286546]["game_type"] == "consolation"

    def test_a_regular_week_stays_regular(self):
        _, games = parse_schedule(SCHEDULE_HTML)
        assert {g["game_type"] for g in games} == {"regular"}

    def test_a_january_week_rolls_into_the_next_year(self):
        html = POSTSEASON_HTML.replace(
            "<h3>December 23 to December 29</h3>", "<h3>January 6 to January 12</h3>"
        )
        _, games = parse_schedule(html)
        january = [g for g in games if g["game_id"] == 7286798][0]
        assert january["starts_on"] == "2026-01-06"


class TestParseCsv:
    def test_reads_team_ids(self):
        rows = parse_schedule_csv(SCHEDULE_CSV)
        assert len(rows) == 4
        assert rows[0]["home_team_id"] == 2623
        assert rows[0]["away_team_id"] == 2531

    def test_ignores_a_malformed_line(self):
        rows = parse_schedule_csv(SCHEDULE_CSV + "not,a,game\n")
        assert len(rows) == 4


class TestMerge:
    def test_attaches_team_ids_to_the_html_games(self):
        _, games = parse_schedule(SCHEDULE_HTML)
        rows, warnings = merge(games, parse_schedule_csv(SCHEDULE_CSV))
        assert warnings == []
        assert len(rows) == 4
        assert rows[0]["home_team_id"] == 2623
        # The HTML page still owns week structure and status.
        assert rows[0]["starts_on"] == "2026-09-09"

    def test_resolves_a_team_id_by_name_when_the_csv_lags(self):
        """A game the page lists but the CSV export has not caught up on still
        gets its ids, because a team id seen in any other game identifies that
        team in every game."""
        _, games = parse_schedule(SCHEDULE_HTML)
        # Both of this game's teams play elsewhere in the export, so their ids
        # are known even though this row is absent.
        partial = [r for r in parse_schedule_csv(SCHEDULE_CSV) if r["game_id"] != 7286896]
        rows, warnings = merge(games, partial)
        assert warnings == []
        missing = [r for r in rows if r["game_id"] == 7286896][0]
        assert (missing["home_team_id"], missing["away_team_id"]) == (2623, 2628)

    def test_skips_only_the_game_whose_teams_never_appear(self):
        """A team the CSV has never named anywhere cannot be resolved — that one
        game is dropped with a warning, and the rest of the slate still writes."""
        _, games = parse_schedule(SCHEDULE_HTML)
        partial = [r for r in parse_schedule_csv(SCHEDULE_CSV) if r["week"] == 1]
        rows, warnings = merge(games, partial)
        assert 7286897 not in {r["game_id"] for r in rows}
        assert any("The Witchcraft" in w and "skipped" in w for w in warnings)
        assert 7286896 in {r["game_id"] for r in rows}

    def test_skips_a_game_whose_teams_are_unknown(self):
        _, games = parse_schedule(SCHEDULE_HTML)
        rows, warnings = merge(games, [])
        assert rows == []
        assert len(warnings) == 4

    def test_carries_over_a_game_the_page_omits(self):
        _, games = parse_schedule(SCHEDULE_HTML)
        keep = [g for g in games if g["week"] == 1]
        rows, warnings = merge(keep, parse_schedule_csv(SCHEDULE_CSV))
        assert len(rows) == 4
        assert any("not on the schedule page" in w for w in warnings)


class TestDeriveStatus:
    def test_final_wins_over_the_scores(self):
        assert _derive_status("Final", 0.0, 0.0) == "final"

    def test_points_on_the_board_mean_live(self):
        assert _derive_status("Sun 4:25", 12.5, 0.0) == "in_progress"

    def test_no_label_and_no_points_is_scheduled(self):
        assert _derive_status(None, 0.0, 0.0) == "scheduled"
        assert _derive_status("Sep 9", None, None) == "scheduled"
