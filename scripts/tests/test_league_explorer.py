"""Tests for the league explorer (scripts/league_explorer/).

Parser fixtures are compact excerpts of the real page markup (verified live
July 2026); store tests run against a temp SQLite file; fetcher tests use a
fake requests session (no network).
"""

import time

import pytest

from scripts.league_explorer import parsers, store
from scripts.league_explorer.fetcher import Fetcher

SETTINGS_HTML = """
<html><head>
<title>Ottoneu Fantasy Football - St Louis Metropolitan Football - Settings</title>
</head><body><table>
<tr><th>Setting</th><th></th></tr>
<tr><td>ID</td><td>33</td></tr>
<tr><td>Established</td><td>August 12, 2015</td></tr>
<tr><td>Tier</td><td>$100 Tier</td></tr>
<tr><td>Private League?</td><td>No</td></tr>
<tr><td>Number of Teams</td><td>12</td></tr>
<tr><td>Points System</td><td>0.5 PPR</td></tr>
<tr><td>Roster Settings</td><td>Two Flex</td></tr>
<tr><td>Playoff Settings</td><td>Six playoff teams</td></tr>
</table></body></html>
"""

STANDINGS_HTML = """
<html><body><table>
<tr><th>Team</th><th>Record (W-L-T)</th><th>Points For</th><th>Points Against</th></tr>
<tr><td>Csonka</td><td>Csonka</td><td>Csonka</td><td>Csonka</td></tr>
<tr><td><a href="/football/33/team/134">JTP</a></td><td>10-4-0</td>
    <td>1569.66</td><td>1337.42</td></tr>
<tr><td><a href="/football/33/team/216">Da Dolphins</a></td><td>6-8-0</td>
    <td>1246.64</td><td>1277.96</td></tr>
<tr><td>Nagurski</td><td>Nagurski</td><td>Nagurski</td><td>Nagurski</td></tr>
<tr><td><a href="/football/33/team/157">Juggernaut</a></td><td>9-5-0</td>
    <td>1672.78</td><td>1398.16</td></tr>
</table></body></html>
"""

TEAM_HTML = """
<html><head>
<title>Ottoneu Fantasy Football - St Louis Metropolitan Football - Team</title>
</head><body>
<h1 class="header-headline ottoneu-logo">ottoneu Football Logo</h1>
<h1>JTP</h1>
<h3>Manager</h3><h4><a href="/user/jpanaro">jpanaro</a></h4>
<span class="trophy-case">
  <i class="fa fa-trophy third-place" title="2017 Third Place"></i>
  <i class="fa fa-trophy runner-up" title="2021 Runner-Up"></i>
  <i class="fa fa-trophy champion" title="2025 Champion"></i>
  <i class="fa fa-trophy" title="not a trophy"></i>
</span>
</body></html>
"""

FINANCES_HTML = """
<html><body><table>
<tr><th>Team</th><th>Players</th><th>Spots</th><th>Salaries</th>
    <th>Cap Penalties</th><th>Incoming Loans</th><th>Outgoing Loans</th>
    <th>Free Cap Space</th></tr>
<tr><td>JTP</td><td>22</td><td>20</td><td>$497</td><td>$0</td>
    <td>$0</td><td>$0</td><td>$-97</td></tr>
<tr><td>Da Dolphins</td><td>15</td><td>20</td><td>$1,185</td><td>$0</td>
    <td>$0</td><td>$0</td><td>$215</td></tr>
</table></body></html>
"""

ROSTERS_CSV = '''"Team ID","Team Name","Player ID","Pro Player","Player Name","Pro Team",Position(s),Salary
134,JTP,8970,true,"Justin Jefferson",MIN,WR,$100
134,JTP,13095,true,"Drake Maye",NE,QB,$35
133,"Gently's Agency",12653,true,"Jake Bates",DET,K,$6
'''

PLAYER_CARD_HTML = """
<html><body>
<a href="/football/309/standings">Standings</a>
<a href="https://ottoneu.fangraphs.com/football/33/team/134">JTP</a>
<a href="https://ottoneu.fangraphs.com/football/33/view_trade/39466">trade</a>
<a href="https://ottoneu.fangraphs.com/football/205/team/2108">other</a>
<a href="https://www.fangraphs.com/policy.aspx">policy</a>
</body></html>
"""


class TestParsers:
    def test_parse_league_name(self):
        assert parsers.parse_league_name(SETTINGS_HTML) == "St Louis Metropolitan Football"

    def test_parse_league_name_handles_hyphenated_names(self):
        html = "<title>Ottoneu Fantasy Football - The A - Team League - Settings</title>"
        assert parsers.parse_league_name(html) == "The A - Team League"

    def test_parse_settings(self):
        s = parsers.parse_settings(SETTINGS_HTML)
        assert s["league_id"] == 33
        assert s["name"] == "St Louis Metropolitan Football"
        assert s["established_year"] == 2015
        assert s["tier"] == "$100 Tier"
        assert s["is_private"] is False
        assert s["num_teams"] == 12
        assert s["points_system"] == "0.5 PPR"
        assert s["roster_settings"] == "Two Flex"
        assert s["playoff_settings"] == "Six playoff teams"

    def test_parse_settings_missing_table(self):
        s = parsers.parse_settings("<html><body>login required</body></html>")
        assert s["league_id"] is None

    def test_parse_standings_divisions_and_records(self):
        rows = parsers.parse_standings(STANDINGS_HTML)
        assert len(rows) == 3
        jtp = rows[0]
        assert jtp["team_id"] == 134
        assert jtp["team_name"] == "JTP"
        assert jtp["division"] == "Csonka"
        assert (jtp["wins"], jtp["losses"], jtp["ties"]) == (10, 4, 0)
        assert jtp["points_for"] == pytest.approx(1569.66)
        assert rows[2]["division"] == "Nagurski"

    def test_parse_team_page(self):
        team = parsers.parse_team_page(TEAM_HTML)
        assert team["name"] == "JTP"  # skips the ottoneu-logo h1
        assert team["owner"] == "jpanaro"
        assert {"season": 2025, "place": "champion"} in team["trophies"]
        assert {"season": 2021, "place": "runner_up"} in team["trophies"]
        assert {"season": 2017, "place": "third_place"} in team["trophies"]
        assert len(team["trophies"]) == 3  # malformed title ignored

    def test_parse_finances(self):
        rows = parsers.parse_finances(FINANCES_HTML)
        assert len(rows) == 2
        assert rows[0]["team_name"] == "JTP"
        assert rows[0]["salaries"] == 497
        assert rows[0]["free_cap_space"] == -97
        assert rows[1]["salaries"] == 1185  # comma stripped

    def test_parse_rosters_csv(self):
        rows = parsers.parse_rosters_csv(ROSTERS_CSV)
        assert len(rows) == 3
        jj = rows[0]
        assert jj["team_id"] == 134
        assert jj["ottoneu_player_id"] == 8970
        assert jj["player_name"] == "Justin Jefferson"
        assert jj["positions"] == "WR"
        assert jj["salary"] == 100
        assert rows[2]["team_name"] == "Gently's Agency"

    def test_parse_league_ids_from_player_card(self):
        seed = 309
        ids = parsers.parse_league_ids_from_player_card(PLAYER_CARD_HTML, exclude=seed)
        assert ids == {33, 205}


class TestStore:
    def _settings(self, league_id=33):
        return {
            "league_id": league_id,
            "name": "Test League",
            "established": "August 12, 2015",
            "established_year": 2015,
            "tier": "$100 Tier",
            "is_private": False,
            "num_teams": 12,
            "points_system": "0.5 PPR",
            "roster_settings": "Two Flex",
            "playoff_settings": "Six playoff teams",
        }

    def test_upsert_league_idempotent(self, tmp_path):
        conn = store.connect(tmp_path / "t.db")
        store.upsert_league(conn, self._settings())
        store.upsert_league(conn, {**self._settings(), "name": "Renamed"})
        rows = conn.execute("SELECT name FROM leagues").fetchall()
        assert len(rows) == 1
        assert rows[0]["name"] == "Renamed"

    def test_trophies_replaced_not_duplicated(self, tmp_path):
        conn = store.connect(tmp_path / "t.db")
        trophies = [{"season": 2025, "place": "champion"}]
        store.replace_trophies(conn, 33, 134, trophies)
        store.replace_trophies(conn, 33, 134, trophies)
        assert conn.execute("SELECT COUNT(*) c FROM trophies").fetchone()["c"] == 1

    def test_standings_replaced_per_season(self, tmp_path):
        conn = store.connect(tmp_path / "t.db")
        row = {"team_id": 134, "team_name": "JTP", "division": "Csonka",
               "wins": 10, "losses": 4, "ties": 0,
               "points_for": 1569.66, "points_against": 1337.42}
        store.replace_standings(conn, 33, 2025, [row])
        store.replace_standings(conn, 33, 2025, [{**row, "wins": 11}])
        rows = conn.execute("SELECT * FROM standings").fetchall()
        assert len(rows) == 1
        assert rows[0]["wins"] == 11

    def test_roster_snapshots_accumulate_by_date(self, tmp_path):
        conn = store.connect(tmp_path / "t.db")
        slot = {"team_id": 134, "team_name": "JTP", "ottoneu_player_id": 8970,
                "player_name": "Justin Jefferson", "pro_team": "MIN",
                "positions": "WR", "salary": 100}
        store.snapshot_rosters(conn, 33, [slot], snapshot_date="2026-07-01")
        store.snapshot_rosters(conn, 33, [{**slot, "salary": 110}],
                               snapshot_date="2026-08-01")
        rows = conn.execute(
            "SELECT salary FROM roster_slots ORDER BY snapshot_date").fetchall()
        assert [r["salary"] for r in rows] == [100, 110]

    def test_discovered_leagues_dedupe(self, tmp_path):
        conn = store.connect(tmp_path / "t.db")
        store.record_discovered(conn, 33, "player_card:1")
        store.record_discovered(conn, 33, "player_card:2")
        store.record_discovered(conn, 205, "player_card:1")
        assert store.discovered_league_ids(conn) == [33, 205]


class _FakeResponse:
    def __init__(self, status_code=200, text="page"):
        self.status_code = status_code
        self.text = text

    def raise_for_status(self):
        pass


class _FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.headers = {}
        self.calls = 0

    def get(self, url, timeout=None):
        self.calls += 1
        return self.responses.pop(0)


class TestFetcher:
    def test_caches_successful_fetches(self, tmp_path):
        f = Fetcher(cache_dir=tmp_path, delay_seconds=0)
        f.session = _FakeSession([_FakeResponse(text="hello")])
        assert f.get("/football/33/settings", max_age_hours=12) == "hello"
        # Second call is served from cache — no new network call.
        assert f.get("/football/33/settings", max_age_hours=12) == "hello"
        assert f.session.calls == 1
        assert f.cache_hits == 1

    def test_404_returns_none_and_is_not_cached(self, tmp_path):
        f = Fetcher(cache_dir=tmp_path, delay_seconds=0)
        f.session = _FakeSession([_FakeResponse(status_code=404)])
        assert f.get("/football/33/standings/2010") is None
        assert not list(tmp_path.iterdir())

    def test_refresh_bypasses_mutable_cache_but_not_immutable(self, tmp_path):
        f = Fetcher(cache_dir=tmp_path, delay_seconds=0, refresh=True)
        f.session = _FakeSession([_FakeResponse(text="v1"), _FakeResponse(text="v2")])
        assert f.get("/a", max_age_hours=12) == "v1"
        assert f.get("/a", max_age_hours=12) == "v2"      # refresh refetches
        assert f.get("/a", max_age_hours=None) == "v2"    # immutable: cache trusted

    def test_stale_cache_refetched(self, tmp_path):
        f = Fetcher(cache_dir=tmp_path, delay_seconds=0)
        f.session = _FakeSession([_FakeResponse(text="new")])
        cache_file = f._cache_path("/a")
        cache_file.write_text("old")
        two_days_ago = time.time() - 48 * 3600
        import os
        os.utime(cache_file, (two_days_ago, two_days_ago))
        assert f.get("/a", max_age_hours=12) == "new"
