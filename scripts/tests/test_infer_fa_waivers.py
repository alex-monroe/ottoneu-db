"""Tests for inferring waivers from the roster CSV (scripts/infer_fa_waivers.py).

Pure diffing over hand-built snapshots, plus one end-to-end `main --dry-run`
over a saved CSV file. No network, no DB.
"""

from datetime import datetime, timedelta, timezone

from scripts.infer_fa_waivers import (
    detect_cuts,
    load_snapshot,
    main,
    rows_to_remove,
    save_snapshot,
    snapshot_of,
    usable_baseline,
)
from scripts.reconcile_roster import RosterRow, parse_roster_csv

HEADER = '"Team ID","Team Name","Player ID","Pro Player","Player Name","Pro Team",Position(s),Salary\n'
# 9:50 AM EDT on Oct 17, 2026.
PREV_AT = datetime(2026, 10, 17, 13, 50, tzinfo=timezone.utc)
NOW = PREV_AT + timedelta(minutes=10)


def _row(pid, name, team="The Witchcraft", price=5, college=False, nfl="SF", pos="WR"):
    return RosterRow(ottoneu_id=pid, name=name, position=pos, nfl_team=nfl,
                     is_college=college, team=team, price=price)


PREV = snapshot_of([
    _row(13211, "Tyrone Tracy", price=3, nfl="NYG", pos="RB"),
    _row(7184, "Courtland Sutton", team="Ball So Hard University", price=11, nfl="DEN"),
    _row(139723, "Nate Frazier", price=1, college=True, nfl="UGA", pos="RB"),
    _row(8970, "Justin Jefferson", price=64, nfl="MIN"),
], PREV_AT)


class TestDetectCuts:
    def test_player_on_no_roster_now_is_cut_at_his_salary(self):
        current = {"nfl:7184", "college:139723", "nfl:8970"}
        (tracy,) = detect_cuts(PREV, current)
        assert (tracy.kind, tracy.player_key, tracy.player_name) == ("waiver", "nfl:13211", "Tyrone Tracy")
        assert (tracy.salary, tracy.nfl_team, tracy.position) == (3, "NYG", "RB")

    def test_cut_time_is_the_previous_poll_on_the_site_clock(self):
        (tracy,) = detect_cuts(PREV, {"nfl:7184", "college:139723", "nfl:8970"})
        assert tracy.cut_at_local == "2026-10-17T09:50:00"  # EDT
        # The claim deadline is 24 hours later on the Eastern clock.
        assert tracy.ends_at == "2026-10-18T13:50:00+00:00"

    def test_trade_is_not_a_cut(self):
        # Sutton moved team but is still rostered: the key is unchanged.
        assert detect_cuts(PREV, {"nfl:13211", "nfl:7184", "college:139723", "nfl:8970"}) == []

    def test_college_and_nfl_ids_are_separate_players(self):
        cuts = detect_cuts(PREV, {"nfl:13211", "nfl:7184", "nfl:139723", "nfl:8970"})
        assert [c.player_key for c in cuts] == ["college:139723"]
        assert cuts[0].is_college


class TestBaseline:
    def test_fresh_snapshot_is_usable(self):
        assert usable_baseline(PREV, NOW) == (True, "ok")

    def test_missing_or_stale_snapshot_only_rebaselines(self):
        assert usable_baseline(None, NOW)[0] is False
        ok, why = usable_baseline(PREV, PREV_AT + timedelta(hours=3))
        assert ok is False and "180 min old" in why

    def test_snapshot_round_trip(self, tmp_path):
        path = tmp_path / "a" / "snap.json"
        save_snapshot(path, PREV)
        assert load_snapshot(path) == PREV
        assert load_snapshot(tmp_path / "missing.json") is None


class TestRowsToRemove:
    def test_rostered_again_or_window_closed(self):
        stored = [
            {"player_key": "nfl:1", "ends_at": (NOW + timedelta(hours=5)).isoformat()},  # claimed
            {"player_key": "nfl:2", "ends_at": (NOW - timedelta(minutes=1)).isoformat()},  # expired
            {"player_key": "nfl:3", "ends_at": (NOW + timedelta(hours=5)).isoformat()},  # still open
        ]
        assert rows_to_remove(stored, {"nfl:1", "nfl:99"}, NOW) == ["nfl:1", "nfl:2"]


def _csv(rows):
    lines = [f'{2500 + i % 3},"Team {i % 3}",{pid},true,"P{pid}",SF,WR,${price}\n'
             for i, (pid, price) in enumerate(rows)]
    return HEADER + "".join(lines)


class TestMainDryRun:
    """`main` over a saved CSV: prints the inference and saves nothing."""

    def _setup(self, tmp_path, minutes_old):
        rows = [(1000 + i, 2) for i in range(60)]
        snap = tmp_path / "snap.json"
        prev_at = datetime.now(timezone.utc) - timedelta(minutes=minutes_old)
        save_snapshot(snap, snapshot_of(parse_roster_csv(_csv(rows)), prev_at))
        csv_file = tmp_path / "rosters.csv"
        return rows, snap, csv_file

    def test_reports_the_cut_and_leaves_the_snapshot(self, tmp_path, capsys):
        rows, snap, csv_file = self._setup(tmp_path, minutes_old=10)
        csv_file.write_text(_csv(rows[1:]))  # player 1000 was cut
        before = snap.read_text()
        assert main(["--dry-run", "--csv-file", str(csv_file), "--snapshot", str(snap)]) == 0
        out = capsys.readouterr().out
        assert "1 new cut(s)" in out and "P1000" in out
        assert snap.read_text() == before

    def test_mass_disappearance_infers_nothing(self, tmp_path, capsys):
        rows, snap, csv_file = self._setup(tmp_path, minutes_old=10)
        csv_file.write_text(_csv(rows[15:]))  # 15 gone in ten minutes: not real cuts
        assert main(["--dry-run", "--csv-file", str(csv_file), "--snapshot", str(snap)]) == 0
        assert "0 new cut(s)" in capsys.readouterr().out

    def test_truncated_csv_fails(self, tmp_path, capsys):
        rows, snap, csv_file = self._setup(tmp_path, minutes_old=10)
        csv_file.write_text(_csv(rows[:5]))
        assert main(["--dry-run", "--csv-file", str(csv_file), "--snapshot", str(snap)]) == 1
        assert "safety floor" in capsys.readouterr().out
