"""Tests for the roster-status state machine and the log contradictions it finds."""

from datetime import date

import scripts.transaction_state_machine as sm
from scripts.transaction_dedupe import INFERRED_MARKER, LEGACY_INFERRED_MARKERS
from scripts.transaction_state_machine import (
    FA,
    UNKNOWN,
    Move,
    audit,
    find_violations,
    ownership_from_log,
    parse_clock,
    parse_move,
    replay,
    would_violate,
)

TEAM_A = "Tinseltown Little Gold Men"
TEAM_B = "The Witchcraft"


def _penalty(salary):
    """What a card cut row actually records: the cap penalty, ceil(salary/2)."""
    return -(-salary // 2)


def _label(day):
    """The card's own date format — "Aug 24, 2025" — which is what the parser reads."""
    d = date.fromisoformat(day)
    return f"{d:%b} {d.day}, {d.year}"


def _card(pid, ttype, salary, team, day, clock="9:26 PM", rid=None):
    """A player-card row: testimony, with Ottoneu's wall clock in the description."""
    stamp = f"{_label(day)} {clock} | " if clock else f"{_label(day)} | "
    return {"id": rid or f"card-{pid}-{ttype}-{day}", "player_id": pid,
            "transaction_type": ttype, "salary": salary, "team_name": team,
            "transaction_date": day,
            "raw_description": f"{stamp}{team} | {ttype} | ${salary}"}


def _inferred(pid, ttype, salary, team, day, rid=None, marker=INFERRED_MARKER):
    """A reconcile_roster row: a guess, dated the run day, with no clock."""
    return {"id": rid or f"inf-{pid}-{ttype}-{day}", "player_id": pid,
            "transaction_type": ttype, "salary": salary, "team_name": team,
            "transaction_date": day,
            "raw_description": f"{_label(day)} | {team} | {ttype} | ${salary} | "
                               f"{marker} {day}"}


def _moves(*rows):
    return [parse_move(r) for r in rows]


# --- the legal edges -------------------------------------------------------

def test_a_full_legal_career_produces_no_violations():
    """FA → add → increase → trade → cut → re-add: every edge the machine allows."""
    rows = [
        _card("p", "add", 6, TEAM_A, "2025-08-24"),
        _card("p", "increase", 7, TEAM_A, "2026-01-05"),
        _card("p", f"move (from {TEAM_A})", 7, TEAM_B, "2026-03-01"),
        _card("p", "increase", 11, TEAM_B, "2026-04-01"),
        _card("p", "cut", _penalty(11), TEAM_B, "2026-07-28"),
        _card("p", "add", 3, TEAM_A, "2026-08-22"),
    ]
    state, violations = replay(_moves(*rows))
    assert violations == []
    assert state == TEAM_A


def test_add_after_a_cut_is_legal():
    """The cut is exactly what makes a second add possible."""
    rows = [_card("p", "add", 1, TEAM_A, "2025-08-24"),
            _card("p", "cut", 1, TEAM_A, "2026-07-28"),
            _card("p", "add", 1, TEAM_A, "2026-08-01")]
    assert replay(_moves(*rows))[1] == []


# --- the illegal edges -----------------------------------------------------

def test_add_while_owned_is_the_jonathon_brooks_bug():
    """Added 2025-08-24, never cut, 'added' again by the same team 11 months later."""
    rows = [_card("p", "add", 1, TEAM_A, "2025-08-24"),
            _card("p", "increase", 2, TEAM_A, "2026-01-05"),
            _inferred("p", "add", 2, TEAM_A, "2026-07-31")]
    violations = replay(_moves(*rows))[1]
    assert [v.rule for v in violations] == ["add_while_owned"]
    assert violations[0].state_before == TEAM_A
    assert violations[0].repairable


def test_cut_while_free_agent_is_reported():
    rows = [_card("p", "add", 1, TEAM_A, "2025-08-24"),
            _card("p", "cut", 1, TEAM_A, "2026-07-31"),
            _inferred("p", "cut", 5, TEAM_A, "2026-08-01")]
    assert [v.rule for v in replay(_moves(*rows))[1]] == ["cut_while_free_agent"]


def test_cut_by_a_team_that_does_not_own_him():
    rows = [_card("p", "add", 1, TEAM_A, "2025-08-24"),
            _inferred("p", "cut", 1, TEAM_B, "2026-07-31")]
    assert [v.rule for v in replay(_moves(*rows))[1]] == ["cut_by_wrong_team"]


def test_trade_out_of_the_wrong_team():
    rows = [_card("p", "add", 1, TEAM_A, "2025-08-24"),
            _inferred("p", f"move (from {TEAM_B})", 1, "Irish Invasion", "2026-07-31")]
    assert [v.rule for v in replay(_moves(*rows))[1]] == ["move_from_wrong_team"]


def test_increase_while_free_agent_and_by_the_wrong_team():
    fa = [_card("p", "add", 1, TEAM_A, "2025-08-24"),
          _card("p", "cut", 1, TEAM_A, "2026-07-31"),
          _inferred("p", "increase", 5, TEAM_A, "2026-08-01")]
    assert [v.rule for v in replay(_moves(*fa))[1]] == ["increase_while_free_agent"]

    wrong = [_card("p", "add", 1, TEAM_A, "2025-08-24"),
             _inferred("p", "increase", 5, TEAM_B, "2026-01-05")]
    assert [v.rule for v in replay(_moves(*wrong))[1]] == ["increase_by_wrong_team"]


# --- truncated history must never manufacture a bug ------------------------

def test_first_event_establishes_state_rather_than_being_judged():
    """A card lists recent moves, not the league's whole past — history begins mid-stream."""
    for first in ("cut", "increase", f"move (from {TEAM_B})"):
        rows = [_card("p", first, 5, TEAM_A, "2026-07-31")]
        assert replay(_moves(*rows))[1] == [], first


def test_rows_without_a_date_are_dropped_not_guessed_at():
    """An event with no place in the sequence would fabricate violations around it."""
    assert parse_move({"id": "x", "player_id": "p", "transaction_type": "add",
                       "team_name": TEAM_A, "salary": 1, "transaction_date": None,
                       "raw_description": ""}) is None


def test_unrecognised_transaction_types_are_ignored():
    assert parse_move(_card("p", "arbitration", 5, TEAM_A, "2026-04-01")) is None


# --- ordering: the thing that decides who is at fault ----------------------

def test_the_card_clock_orders_moves_within_a_day():
    """Traded at 9:26 AM, cut by the new team at 11:04 PM — order makes both legal."""
    rows = [_card("p", "add", 1, TEAM_A, "2025-08-24"),
            _card("p", "cut", 1, TEAM_B, "2026-07-31", clock="11:04 PM"),
            _card("p", f"move (from {TEAM_A})", 1, TEAM_B, "2026-07-31", clock="9:26 AM")]
    assert replay(_moves(*rows))[1] == []


def test_a_same_day_inference_sorts_after_the_card_row_it_contradicts():
    """The inference is dated the run, so what it describes had already happened."""
    rows = [_card("p", "add", 1, TEAM_A, "2025-08-24"),
            _inferred("p", "cut", 1, TEAM_A, "2026-07-31"),
            _card("p", "cut", 1, TEAM_A, "2026-07-31")]
    violations = replay(_moves(*rows))[1]
    assert [v.rule for v in violations] == ["cut_while_free_agent"]
    assert violations[0].inferred, "the card row must be the one that survives"


def test_parse_clock_reads_the_card_stamp_and_tolerates_its_absence():
    assert parse_clock("Aug 22, 2026 9:26 PM | x") == "21:26"
    assert parse_clock("Aug 22, 2026 12:05 AM | x") == "00:05"
    assert parse_clock("Aug 22, 2026 | x") is None
    assert parse_clock(None) is None


# --- repair is one-directional --------------------------------------------

def test_only_inferred_rows_are_repairable():
    """Testimony that breaks the machine is a real defect, not a bad guess to delete."""
    rows = [_card("p", "add", 1, TEAM_A, "2025-08-24"),
            _card("p", "add", 1, TEAM_A, "2026-07-31")]
    violations = find_violations(rows)
    assert [v.rule for v in violations] == ["add_while_owned"]
    assert not violations[0].repairable


def test_legacy_marker_rows_are_recognised_as_inferred():
    """80 rows carry the pre-rename wording; a reader that misses them sees testimony."""
    rows = [_card("p", "add", 1, TEAM_A, "2025-08-24"),
            _inferred("p", "add", 2, TEAM_A, "2026-07-31",
                      marker=LEGACY_INFERRED_MARKERS[0])]
    violations = find_violations(rows)
    assert [v.repairable for v in violations] == [True]


# --- the write-time guard shares the auditor's rulebook --------------------

def test_ownership_from_log_ignores_inferences():
    """A guess must never vouch for the next guess."""
    rows = [_card("p", "add", 1, TEAM_A, "2025-08-24"),
            _inferred("p", f"move (from {TEAM_A})", 1, TEAM_B, "2026-07-31")]
    assert ownership_from_log(rows) == {"p": TEAM_A}
    assert ownership_from_log(rows, testimony_only=False) == {"p": TEAM_B}


def test_ownership_from_log_omits_players_with_no_usable_history():
    """'The log does not know' must stay distinguishable from 'he is a free agent'."""
    assert ownership_from_log([]) == {}


def test_would_violate_permits_anything_from_unknown():
    mv = parse_move(_card("p", "cut", 1, TEAM_A, "2026-07-31"))
    assert would_violate(UNKNOWN, mv) is None


def test_would_violate_matches_replay_on_the_same_transition():
    """The guard and the audit must not be able to disagree."""
    mv = parse_move(_inferred("p", "add", 2, TEAM_A, "2026-07-31"))
    assert would_violate(TEAM_A, mv)[0] == "add_while_owned"
    assert would_violate(FA, mv) is None


# --- audit / repair plumbing ----------------------------------------------

class _FakeTable:
    def __init__(self, rows, deleted):
        self._rows, self._deleted = rows, deleted
        self._pending = None

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a):
        return self

    def gte(self, *_a):
        return self

    def range(self, start, end):
        self._slice = (start, end)
        return self

    def delete(self):
        self._pending = "delete"
        return self

    def in_(self, _col, ids):
        self._deleted.extend(ids)
        return self

    def execute(self):
        if self._pending == "delete":
            self._pending = None
            return type("R", (), {"data": []})()
        start, end = self._slice
        return type("R", (), {"data": self._rows[start:end + 1]})()


class _FakeSB:
    def __init__(self, rows):
        self.rows, self.deleted = rows, []

    def table(self, name):
        return _FakeTable(self.rows if name == "transactions" else [], self.deleted)


def _brooks_rows():
    return [_card("p", "add", 1, TEAM_A, "2025-08-24"),
            _card("p", "increase", 2, TEAM_A, "2026-01-05"),
            _inferred("p", "add", 2, TEAM_A, "2026-07-31", rid="bad")]


def test_audit_dry_run_deletes_nothing():
    sb = _FakeSB(_brooks_rows())
    summary = audit(sb, 309, apply=False)
    assert len(summary["repairable"]) == 1
    assert summary["deleted"] == 0
    assert sb.deleted == []


def test_audit_apply_deletes_only_the_violating_inferred_row():
    sb = _FakeSB(_brooks_rows())
    summary = audit(sb, 309, apply=True)
    assert sb.deleted == ["bad"]
    assert summary["deleted"] == 1


def test_audit_leaves_a_clean_log_untouched():
    sb = _FakeSB([_card("p", "add", 1, TEAM_A, "2025-08-24"),
                  _card("p", "cut", 1, TEAM_A, "2026-07-28")])
    summary = audit(sb, 309, apply=True)
    assert summary["violations"] == []
    assert sb.deleted == []


# --- repair converges ------------------------------------------------------

def test_resolve_repairs_to_a_fixpoint():
    """A bad row can hide the next one — the D'Andre Swift case.

    Cut for real on 07-31, so he is a free agent. A phantom trade that same day
    puts him back on a roster, which makes the phantom cut filed on 08-01 look
    legal. Remove the trade and that second cut is exposed; one pass would miss it.
    """
    rows = [
        _card("swift", "add", 24, TEAM_A, "2025-08-24"),
        _card("swift", "cut", _penalty(24), TEAM_A, "2026-07-31", clock="9:26 AM"),
        _inferred("swift", f"move (from {TEAM_B})", 32, TEAM_A, "2026-07-31", rid="bad1"),
        _inferred("swift", "cut", 32, TEAM_A, "2026-08-01", rid="bad2"),
    ]
    assert len(find_violations(rows)) == 1, "one pass sees only the trade"
    repairable, unrepairable = sm.resolve(rows)
    assert sorted(v.row_id for v in repairable) == ["bad1", "bad2"]
    assert unrepairable == []


def test_resolve_leaves_a_clean_log_alone():
    rows = [_card("p", "add", 1, TEAM_A, "2025-08-24"),
            _card("p", "cut", 1, TEAM_A, "2026-07-28")]
    assert sm.resolve(rows) == ([], [])


def test_audit_deletes_everything_the_fixpoint_finds():
    sb = _FakeSB([
        _card("swift", "add", 24, TEAM_A, "2025-08-24"),
        _card("swift", "cut", _penalty(24), TEAM_A, "2026-07-31", clock="9:26 AM"),
        _inferred("swift", f"move (from {TEAM_B})", 32, TEAM_A, "2026-07-31", rid="bad1"),
        _inferred("swift", "cut", 32, TEAM_A, "2026-08-01", rid="bad2"),
    ])
    summary = audit(sb, 309, apply=True)
    assert sorted(sb.deleted) == ["bad1", "bad2"]
    assert summary["deleted"] == 2
    assert summary["unrepairable"] == []


# --- the salary axis: trades, increases, and the cut-penalty checksum -------

def test_a_trade_carries_the_salary_unchanged():
    """114 real trades, not one changed the salary — it moves with the contract."""
    rows = [_card("p", "add", 24, TEAM_A, "2025-08-24"),
            _card("p", f"move (from {TEAM_A})", 24, TEAM_B, "2025-11-17")]
    assert replay(_moves(*rows))[1] == []


def test_a_trade_that_changed_the_salary_is_reported():
    rows = [_card("p", "add", 24, TEAM_A, "2025-08-24"),
            _card("p", f"move (from {TEAM_A})", 32, TEAM_B, "2025-11-17")]
    violations = replay(_moves(*rows))[1]
    assert [v.rule for v in violations] == ["trade_changed_salary"]


def test_a_team_cannot_trade_a_player_to_itself():
    rows = [_card("p", "add", 5, TEAM_A, "2025-08-24"),
            _card("p", f"move (from {TEAM_A})", 5, TEAM_A, "2026-03-01")]
    assert [v.rule for v in replay(_moves(*rows))[1]] == ["trade_to_same_team"]


def test_an_increase_must_actually_increase():
    up = [_card("p", "add", 6, TEAM_A, "2025-08-24"),
          _card("p", "increase", 7, TEAM_A, "2026-01-05")]
    assert replay(_moves(*up))[1] == []

    for bad_salary in (6, 4):  # unchanged, and a cut disguised as a raise
        rows = [_card("p", "add", 6, TEAM_A, "2025-08-24"),
                _card("p", "increase", bad_salary, TEAM_A, "2026-01-05")]
        assert [v.rule for v in replay(_moves(*rows))[1]] == ["increase_did_not_increase"]


def test_a_cut_forfeits_half_the_salary_rounded_up():
    """Holds on all 317 card cuts in the league's history — including the $1 floor."""
    for salary, penalty in ((109, 55), (5, 3), (4, 2), (1, 1)):
        rows = [_card("p", "add", salary, TEAM_A, "2025-08-24"),
                _card("p", "cut", penalty, TEAM_A, "2026-07-28")]
        assert replay(_moves(*rows))[1] == [], f"${salary} should forfeit ${penalty}"


def test_a_cut_penalty_that_does_not_add_up_means_a_missing_raise():
    """The checksum's real job: catching a row the log never got, not a bad row.

    He was raised to $109 in arbitration; the log only ever saw $86. The cut says
    $55, which is half of a salary the log does not know about.
    """
    rows = [_card("p", "add", 86, TEAM_A, "2025-08-24"),
            _card("p", "cut", 55, TEAM_A, "2026-07-31")]
    violations = replay(_moves(*rows))[1]
    assert [v.rule for v in violations] == ["cut_penalty_mismatch"]
    assert "$43" in violations[0].detail  # what $86 should have forfeited


def test_an_inferred_cut_is_exempt_from_the_penalty_checksum():
    """reconcile_roster writes the salary there — it has no penalty to observe."""
    rows = [_card("p", "add", 86, TEAM_A, "2025-08-24"),
            _inferred("p", "cut", 86, TEAM_A, "2026-07-31")]
    assert replay(_moves(*rows))[1] == []


def test_salary_rules_are_reported_but_never_auto_repaired():
    """A salary that does not add up usually means a row is *missing*.

    Deleting the row that exposes the gap would hide the problem, so these are
    report-only even when the offending row is an inference.
    """
    rows = [_card("p", "add", 24, TEAM_A, "2025-08-24"),
            _inferred("p", f"move (from {TEAM_A})", 32, TEAM_B, "2026-07-31")]
    violations = find_violations(rows)
    assert [v.rule for v in violations] == ["trade_changed_salary"]
    assert not violations[0].repairable, "must not be deleted — the fix is a re-scrape"


def test_ownership_rules_stay_repairable():
    rows = [_card("p", "add", 2, TEAM_A, "2025-08-24"),
            _inferred("p", "add", 2, TEAM_A, "2026-07-31")]
    assert find_violations(rows)[0].repairable


def test_a_cut_resets_the_salary_to_unknown():
    """He is a free agent; whatever he next signs for is set by that signing."""
    rows = [_card("p", "add", 40, TEAM_A, "2025-08-24"),
            _card("p", "cut", 20, TEAM_A, "2026-07-28"),
            _card("p", "add", 3, TEAM_B, "2026-08-22"),
            _card("p", "cut", 2, TEAM_B, "2026-09-01")]
    assert replay(_moves(*rows))[1] == []


def test_salary_rules_do_not_fire_on_a_truncated_history():
    """No known salary means nothing to check against — same discipline as UNKNOWN."""
    rows = [_card("p", "increase", 7, TEAM_A, "2026-01-05"),
            _card("p", f"move (from {TEAM_A})", 9, TEAM_B, "2026-03-01")]
    assert [v.rule for v in replay(_moves(*rows))[1]] == ["trade_changed_salary"]
    # ...but with no prior row at all, the trade's own salary is the first thing known.
    solo = [_card("p", f"move (from {TEAM_A})", 9, TEAM_B, "2026-03-01")]
    assert replay(_moves(*solo))[1] == []


def test_would_violate_without_a_salary_skips_the_salary_rules():
    """reconcile_roster cannot know the salary, so its guard checks ownership only."""
    mv = parse_move(_card("p", f"move (from {TEAM_A})", 32, TEAM_B, "2026-07-31"))
    assert would_violate(TEAM_A, mv) is None
    assert would_violate(TEAM_A, mv, salary=24)[0] == "trade_changed_salary"
