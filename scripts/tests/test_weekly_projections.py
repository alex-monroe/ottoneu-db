"""Tests for the weekly-projection ingest path (scripts/weekly_projections/)."""

from __future__ import annotations

from datetime import date

import pytest

from scripts.weekly_projections.ingest import (
    apply_kickoff_freeze,
    build_records,
    partition_dropped_rows,
)
from scripts.weekly_projections.scoring import normalised_stats, score_stat_line
from scripts.weekly_projections.sources import sleeper
from scripts.weekly_projections.sources.base import WeeklyRow


def _sleeper_row(name, position, team, stats, week=1, season=2025, opponent="LAC"):
    """A row shaped like Sleeper's /projections payload."""
    return {
        "week": week,
        "season": str(season),
        "team": team,
        "opponent": opponent,
        "stats": stats,
        "player": {"full_name": name, "position": position, "team": team},
    }


class TestScoring:
    def test_qb_line(self):
        # 250*0.04 + 2*4 + 1*-2 + 50*0.1 + 1*6
        assert score_stat_line(
            {
                "passing_yards": 250,
                "passing_tds": 2,
                "interceptions": 1,
                "rushing_yards": 50,
                "rushing_tds": 1,
            }
        ) == 27.0

    def test_half_ppr_receiving(self):
        # 6*0.5 + 80*0.1 + 1*6 — half a point per reception, not full.
        assert score_stat_line(
            {"receptions": 6, "receiving_yards": 80, "receiving_tds": 1}
        ) == 17.0

    def test_kicker_uses_ottoneu_distance_tiers(self):
        # This is the reason we never take a source's own point total: Ottoneu
        # pays 3/4/5 by distance, where most sites pay a flat 3.
        assert score_stat_line(
            {"fg_made_0_39": 2, "fg_made_40_49": 1, "fg_made_50_plus": 1, "pat_made": 3}
        ) == 3 * 2 + 4 + 5 + 3

    def test_missing_and_garbage_values_are_zero(self):
        assert score_stat_line({}) == 0.0
        assert score_stat_line({"receptions": None, "receiving_yards": "x"}) == 0.0

    def test_unknown_keys_are_ignored(self):
        assert score_stat_line({"receptions": 2, "punt_return_yards": 500}) == 1.0

    def test_normalised_stats_drops_zero_and_unknown(self):
        got = normalised_stats(
            {"receptions": 6, "receiving_yards": 80, "receiving_tds": 0, "sacks": 3}
        )
        assert got == {"receptions": 6.0, "receiving_yards": 80.0}


class TestSleeperParsing:
    def test_maps_stat_keys_to_ottoneu_categories(self):
        payload = [
            _sleeper_row(
                "Josh Allen", "QB", "BUF",
                {"pass_yd": 250, "pass_td": 2, "pass_int": 1, "rush_yd": 50, "rush_td": 1},
            )
        ]
        rows = sleeper.parse(payload, 2025, 1)
        assert len(rows) == 1
        assert rows[0].stats == {
            "passing_yards": 250.0,
            "passing_tds": 2.0,
            "interceptions": 1.0,
            "rushing_yards": 50.0,
            "rushing_tds": 1.0,
        }
        assert score_stat_line(rows[0].stats) == 27.0

    def test_field_goal_bands_fold_into_ottoneu_buckets(self):
        # Sleeper reports finer distance bands than Ottoneu scores, so the short
        # ones must SUM into fg_made_0_39 rather than overwrite each other.
        payload = [
            _sleeper_row(
                "Kicker Guy", "K", "KC",
                {"fgm_0_19": 1, "fgm_20_29": 1, "fgm_30_39": 2, "fgm_40_49": 1, "fgm_50p": 1, "xpm": 3},
            )
        ]
        rows = sleeper.parse(payload, 2025, 1)
        assert rows[0].stats["fg_made_0_39"] == 4.0
        assert rows[0].stats["fg_made_40_49"] == 1.0
        assert rows[0].stats["fg_made_50_plus"] == 1.0
        assert rows[0].stats["pat_made"] == 3.0

    def test_carries_opponent_and_week(self):
        rows = sleeper.parse([_sleeper_row("A B", "WR", "SF", {"rec": 5}, week=7)], 2025, 7)
        assert rows[0].opponent == "LAC"
        assert rows[0].week == 7
        assert rows[0].season == 2025

    def test_skips_unrosterable_positions(self):
        # Sleeper carries DEF/IDP rows this league has no roster spot for.
        payload = [
            _sleeper_row("Some Defense", "DEF", "SF", {"rec": 0}),
            _sleeper_row("Linebacker Guy", "LB", "SF", {"rec": 0}),
            _sleeper_row("Real Receiver", "WR", "SF", {"rec": 5}),
        ]
        assert [r.name for r in sleeper.parse(payload, 2025, 1)] == ["Real Receiver"]

    def test_builds_name_from_first_and_last(self):
        entry = _sleeper_row("", "WR", "SF", {"rec": 5})
        entry["player"] = {"first_name": "Deebo", "last_name": "Samuel", "position": "WR"}
        assert sleeper.parse([entry], 2025, 1)[0].name == "Deebo Samuel"


class TestSleeperValidationFailsLoudly:
    """The endpoint is permitted but undocumented, so a shape change must crash.

    Silently upserting a week of zeroes is the dangerous failure: the zeroes look
    like real projections on the player card and in the MCP payload.
    """

    def test_empty_payload_raises(self):
        with pytest.raises(sleeper.SleeperSchemaError, match="zero rows"):
            sleeper.validate_payload([])

    def test_missing_stats_object_raises(self):
        with pytest.raises(sleeper.SleeperSchemaError, match="'stats' object"):
            sleeper.validate_payload([{"player": {"full_name": "X", "position": "WR"}}])

    def test_renamed_stat_keys_raise(self):
        payload = [_sleeper_row("X Y", "QB", "BUF", {"passing_yards_v2": 250})]
        with pytest.raises(sleeper.SleeperSchemaError, match="none of the expected stat keys"):
            sleeper.validate_payload(payload)

    def test_recognised_payload_passes(self):
        sleeper.validate_payload([_sleeper_row("X Y", "QB", "BUF", {"pass_yd": 250})])

    def test_non_list_payload_is_rejected(self):
        # A maintenance page or an error object rather than the expected array.
        import requests

        class FakeResponse:
            def raise_for_status(self):
                pass

            def json(self):
                return {"error": "not found"}

        original = requests.get
        requests.get = lambda *a, **k: FakeResponse()
        try:
            with pytest.raises(sleeper.SleeperSchemaError, match="expected a list"):
                sleeper.fetch_raw(2025, 1)
        finally:
            requests.get = original

    def test_rejects_bad_kind(self):
        with pytest.raises(ValueError, match="projections.*stats"):
            sleeper.fetch_raw(2025, 1, kind="guesses")


class TestBuildRecords:
    """Matching + shaping, using the shared player matcher."""

    PLAYER_INDEX = {
        "QB": [{"id": "uuid-qb", "name": "Josh Allen", "norm_name": "josh allen", "nfl_team": "BUF"}],
        "WR": [{"id": "uuid-wr", "name": "Ja'Marr Chase", "norm_name": "jamarr chase", "nfl_team": "CIN"}],
    }

    def _row(self, name, pos, team, stats):
        return WeeklyRow(name=name, position=pos, team=team, week=3, season=2025,
                         stats=stats, opponent="MIA")

    def test_projection_record_shape(self):
        rows = [self._row("Josh Allen", "QB", "BUF", {"passing_yards": 250, "passing_tds": 2})]
        records, unmatched = build_records(rows, self.PLAYER_INDEX, "sleeper", actuals=False)
        assert unmatched == []
        (record,) = records
        assert record["player_id"] == "uuid-qb"
        assert record["season"] == 2025 and record["week"] == 3
        assert record["source"] == "sleeper"
        assert record["projected_points"] == 18.0  # 250*.04 + 2*4
        assert record["projected_stats"] == {"passing_yards": 250.0, "passing_tds": 2.0}
        assert record["opponent"] == "MIA"
        # An actuals column must not be set by a projection run.
        assert "actual_points" not in record

    def test_actuals_record_writes_actual_columns_only(self):
        rows = [self._row("Josh Allen", "QB", "BUF", {"passing_yards": 300})]
        records, _ = build_records(rows, self.PLAYER_INDEX, "sleeper", actuals=True)
        (record,) = records
        assert record["actual_points"] == 12.0
        assert record["actual_stats"] == {"passing_yards": 300.0}
        # A projection must never be clobbered by the actuals pass — that pairing
        # is the whole point of keeping the played week on the card.
        assert "projected_points" not in record
        assert "projected_stats" not in record

    def test_timestamps_are_real_iso_not_sql_literals(self):
        # PostgREST sends JSON verbatim; a literal "now()" would be written as text.
        rows = [self._row("Josh Allen", "QB", "BUF", {"passing_yards": 1})]
        records, _ = build_records(rows, self.PLAYER_INDEX, "sleeper", actuals=False)
        from datetime import datetime

        for key in ("updated_at", "projected_at"):
            assert datetime.fromisoformat(records[0][key])

    def test_unmatched_players_are_reported_not_written(self):
        rows = [self._row("Nobody Here", "WR", "XXX", {"receptions": 5})]
        records, unmatched = build_records(rows, self.PLAYER_INDEX, "sleeper", actuals=False)
        assert records == []
        assert unmatched == ["Nobody Here (WR, XXX)"]

    def test_apostrophes_and_punctuation_match(self):
        rows = [self._row("Ja'Marr Chase", "WR", "CIN", {"receptions": 6, "receiving_yards": 80})]
        records, unmatched = build_records(rows, self.PLAYER_INDEX, "sleeper", actuals=False)
        assert unmatched == []
        assert records[0]["player_id"] == "uuid-wr"
        assert records[0]["projected_points"] == 11.0


class TestDedupeAndFiltering:
    """Regressions found verifying the first ingest against the live API."""

    PLAYER_INDEX = {
        "WR": [
            {"id": "uuid-wr", "name": "DeVonta Smith", "norm_name": "devonta smith", "nfl_team": "PHI"}
        ],
    }

    def _row(self, stats, name="DeVonta Smith"):
        return WeeklyRow(name=name, position="WR", team="PHI", week=1, season=2025,
                         stats=stats, opponent="DAL")

    def test_duplicate_matches_collapse_to_one_record(self):
        # Sleeper carries duplicate/retired/practice-squad records under the same
        # name, and the fuzzy matcher lands them on one player_id. PostgREST
        # rejects the whole batch with "ON CONFLICT DO UPDATE command cannot
        # affect row a second time", so the entire week fails to write.
        rows = [
            self._row({"receptions": 5, "receiving_yards": 65}),   # the real one
            self._row({"receptions": 0.0}),                        # inactive stub
        ]
        records, _ = build_records(rows, self.PLAYER_INDEX, "sleeper", actuals=False)
        assert len(records) == 1

    def test_dedupe_keeps_the_higher_scoring_row(self):
        rows = [
            self._row({"receptions": 1}),
            self._row({"receptions": 5, "receiving_yards": 65}),
        ]
        records, _ = build_records(rows, self.PLAYER_INDEX, "sleeper", actuals=False)
        assert records[0]["projected_points"] == 9.0  # 5*0.5 + 65*0.1

    def test_dedupe_uses_actual_points_on_the_actuals_pass(self):
        rows = [
            self._row({"receptions": 8, "receiving_yards": 100}),
            self._row({"receptions": 1}),
        ]
        records, _ = build_records(rows, self.PLAYER_INDEX, "sleeper", actuals=True)
        assert len(records) == 1
        assert records[0]["actual_points"] == 14.0

    def test_players_with_no_projected_stats_are_skipped(self):
        # On a real slate these split cleanly: every row with a scoring stat also
        # carries an opponent, and every row without one has neither. Writing
        # them would triple the table with 0.0 rows that read as real
        # projections, and break the "missing = bye or inactive" promise the UI
        # and the MCP note both make.
        records, unmatched = build_records(
            [self._row({})], self.PLAYER_INDEX, "sleeper", actuals=False
        )
        assert records == []
        # Skipped for having no projection, NOT reported as a matching failure.
        assert unmatched == []

    def test_a_tiny_but_real_projection_is_kept(self):
        records, _ = build_records(
            [self._row({"receptions": 0.86, "receiving_yards": 7.99})],
            self.PLAYER_INDEX, "sleeper", actuals=False,
        )
        assert len(records) == 1
        assert records[0]["projected_points"] == 1.23


class TestEmptyStatsIsNotAnError:
    """An unplayed week returns zero /stats rows — normal, not a schema break.

    Sleeper's /stats endpoint is empty for a week whose games have not been
    played, which is the state every day between the Tuesday rollover and Sunday
    kickoff. Raising there would put a red step on most scheduled runs and blur
    the line between "no games yet" and "the response shape changed".
    """

    def _patched_fetch_raw(self, monkeypatch, payload):
        monkeypatch.setattr(sleeper, "fetch_raw", lambda *a, **k: payload)

    def test_empty_stats_returns_no_rows(self, monkeypatch):
        self._patched_fetch_raw(monkeypatch, [])
        assert sleeper.fetch(2026, 1, kind="stats", delay=0) == []

    def test_empty_projections_still_raises(self, monkeypatch):
        # Sleeper always projects an upcoming week, so an empty projections
        # payload means something is genuinely wrong.
        self._patched_fetch_raw(monkeypatch, [])
        with pytest.raises(sleeper.SleeperSchemaError, match="zero rows"):
            sleeper.fetch(2026, 1, kind="projections", delay=0)

    def test_malformed_stats_payload_still_raises(self, monkeypatch):
        # Non-empty but unrecognised is a real schema break, even for stats.
        self._patched_fetch_raw(
            monkeypatch, [_sleeper_row("X Y", "QB", "BUF", {"totally_renamed": 1})]
        )
        with pytest.raises(sleeper.SleeperSchemaError, match="none of the expected stat keys"):
            sleeper.fetch(2026, 1, kind="stats", delay=0)

    def test_populated_stats_parse_normally(self, monkeypatch):
        self._patched_fetch_raw(
            monkeypatch, [_sleeper_row("Josh Allen", "QB", "BUF", {"pass_yd": 300, "pass_td": 3})]
        )
        rows = sleeper.fetch(2026, 1, kind="stats", delay=0)
        assert len(rows) == 1
        assert score_stat_line(rows[0].stats) == 24.0


TODAY = date(2026, 9, 11)  # a Friday: Wednesday's and Thursday's games are over


class TestRetiringDroppedPlayers:
    """A player the source stops projecting must not keep yesterday's number.

    The upsert only touches players in today's payload, so a player projected on
    Tuesday and then cut, waived or moved to IR used to keep Tuesday's projection
    on the board all week. That row is indistinguishable from a healthy
    starter's, which quietly breaks the promise the player card and the MCP tool
    both make: a missing week means a bye or an inactive.
    """

    def _row(self, player_id, actual=None, game_date="2026-09-13"):
        return {"player_id": player_id, "actual_points": actual, "game_date": game_date}

    def test_still_projected_players_are_left_alone(self):
        existing = [self._row("a"), self._row("b")]
        assert partition_dropped_rows(existing, {"a", "b"}, TODAY) == ([], [])

    def test_dropped_player_with_no_result_is_deleted(self):
        existing = [self._row("a"), self._row("gone")]
        delete, keep = partition_dropped_rows(existing, {"a"}, TODAY)
        assert delete == ["gone"]
        assert keep == []

    def test_dropped_player_who_already_played_keeps_the_row_and_projection(self):
        # A played game is the whole reason a week is retained, and its
        # projection is the pre-game forecast it is judged against. This used to
        # clear the projection, which erased exactly what projected-vs-actual needs.
        existing = [self._row("played", actual=18.4)]
        delete, keep = partition_dropped_rows(existing, set(), TODAY)
        assert delete == []
        assert keep == ["played"]

    def test_a_zero_actual_still_counts_as_having_played(self):
        # 0.0 is a real result — a player who suited up and did nothing. Truthiness
        # would misread it as "no actual" and delete the row.
        existing = [self._row("goose egg", actual=0)]
        assert partition_dropped_rows(existing, set(), TODAY) == ([], ["goose egg"])

    def test_a_started_game_with_no_actual_yet_is_kept(self):
        # Thursday's game is over by Friday morning, but the actuals pass runs
        # after the projections pass — so the row has no result yet. Its date
        # alone must protect it.
        existing = [self._row("thursday", game_date="2026-09-10")]
        assert partition_dropped_rows(existing, set(), TODAY) == ([], ["thursday"])

    def test_a_game_later_today_is_not_started(self):
        # Sunday morning: a player ruled out for the 1pm game drops off the
        # board, and "missing = inactive" should say so.
        existing = [self._row("ruled out", game_date="2026-09-13")]
        assert partition_dropped_rows(existing, set(), date(2026, 9, 13)) == (["ruled out"], [])

    def test_empty_table_is_a_no_op(self):
        assert partition_dropped_rows([], {"a"}, TODAY) == ([], [])

    def test_player_ids_are_compared_as_strings(self):
        # fetch_all_rows hands back whatever PostgREST decoded; the payload side
        # is built from matched player ids. Both must land in the same space or
        # every row would look dropped.
        existing = [{"player_id": "abc", "actual_points": None}]
        assert partition_dropped_rows(existing, {"abc"}, TODAY) == ([], [])


class TestKickoffFreeze:
    """A projection stops being a forecast at kickoff, so it stops being updated.

    Found on the 2026 opener: the morning after NE @ SEA, Sleeper returned every
    player in that finished game re-stamped with a revised number (Drake Maye
    19.0 -> 19.67). The daily upsert would have replaced the projection a lineup
    was set against with a post-game revision nobody could have seen.
    """

    def _record(self, player_id, game_date, points=10.0):
        return {"player_id": player_id, "game_date": game_date, "projected_points": points}

    def _stored(self, player_id, game_date=None, projected=12.0, actual=None):
        return {
            "player_id": player_id, "game_date": game_date,
            "projected_points": projected, "actual_points": actual,
        }

    def test_unstarted_games_are_refreshed(self):
        records = [self._record("sun", "2026-09-13"), self._record("mon", "2026-09-14")]
        existing = [self._stored("sun", "2026-09-13")]
        writable, frozen = apply_kickoff_freeze(records, existing, TODAY)
        assert [r["player_id"] for r in writable] == ["sun", "mon"]
        assert frozen == []

    def test_a_game_on_a_past_date_is_frozen(self):
        records = [self._record("thu", "2026-09-10", points=99.0)]
        existing = [self._stored("thu", "2026-09-10", projected=14.5)]
        writable, frozen = apply_kickoff_freeze(records, existing, TODAY)
        assert writable == []
        assert frozen == ["thu"]

    def test_todays_games_are_still_refreshed(self):
        # The Sunday-noon run exists to catch inactives ~90 minutes before the
        # 1pm window; freezing on the game date itself would defeat it.
        records = [self._record("sun", "2026-09-13")]
        existing = [self._stored("sun", "2026-09-13")]
        writable, _ = apply_kickoff_freeze(records, existing, date(2026, 9, 13))
        assert len(writable) == 1

    def test_a_stored_actual_freezes_a_row_with_no_game_date(self):
        # Rows written before game_date was stored carry no date, but an actual
        # means the game has been played.
        records = [self._record("legacy", "2026-09-09")]
        existing = [self._stored("legacy", game_date=None, actual=9.82)]
        _, frozen = apply_kickoff_freeze(records, existing, date(2026, 9, 9))
        assert frozen == ["legacy"]

    def test_a_first_projection_after_kickoff_is_refused(self):
        # A backup who only appears in the payload after his game is not a
        # pre-game forecast, and must not be presented as one.
        records = [self._record("late", "2026-09-10")]
        writable, frozen = apply_kickoff_freeze(records, [], TODAY)
        assert (writable, frozen) == ([], ["late"])

    def test_a_row_with_only_an_actual_is_not_given_a_post_hoc_projection(self):
        records = [self._record("lock", "2026-09-09")]
        existing = [self._stored("lock", projected=None, actual=12.78)]
        writable, frozen = apply_kickoff_freeze(records, existing, TODAY)
        assert (writable, frozen) == ([], ["lock"])

    def test_backfill_fills_gaps_but_never_overwrites(self):
        # Ingesting a past week: a post-hoc projection is the only one there will
        # ever be, so gaps may be filled — but a stored one is still the original.
        records = [self._record("gap", "2025-09-07"), self._record("kept", "2025-09-07")]
        existing = [self._stored("kept", "2025-09-07")]
        writable, frozen = apply_kickoff_freeze(
            records, existing, TODAY, allow_post_kickoff_fill=True
        )
        assert [r["player_id"] for r in writable] == ["gap"]
        assert frozen == ["kept"]

    def test_record_carries_the_game_date(self):
        row = WeeklyRow(name="Josh Allen", position="QB", team="BUF", week=1, season=2026,
                        stats={"passing_yards": 250}, opponent="BAL", game_date="2026-09-13")
        index = {"QB": [{"id": "uuid-qb", "name": "Josh Allen", "norm_name": "josh allen",
                         "nfl_team": "BUF"}]}
        (record,), _ = build_records([row], index, "sleeper", actuals=False)
        assert record["game_date"] == "2026-09-13"

    def test_sleeper_date_is_parsed(self):
        entry = _sleeper_row("Josh Allen", "QB", "BUF", {"pass_yd": 250})
        entry["date"] = "2026-09-13"
        (row,) = sleeper.parse([entry], 2026, 1)
        assert row.game_date == "2026-09-13"

    def test_missing_or_garbled_sleeper_date_is_none(self):
        for value in (None, "", "TBD", 20260913):
            entry = _sleeper_row("Josh Allen", "QB", "BUF", {"pass_yd": 250})
            entry["date"] = value
            (row,) = sleeper.parse([entry], 2026, 1)
            assert row.game_date is None
