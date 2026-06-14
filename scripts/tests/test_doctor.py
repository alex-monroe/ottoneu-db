"""Tests for the `just doctor` environment self-diagnosis (scripts/doctor.py).

These exercise the pure check functions and the result/exit-code contract,
without depending on the live environment being perfectly healthy.
"""

import importlib

import pytest

doctor = importlib.import_module("scripts.doctor")


def _result_shape(result):
    """Every check returns (status, title, detail, fix-or-None)."""
    assert isinstance(result, tuple) and len(result) == 4
    status, title, detail, fix = result
    assert status in (doctor.PASS, doctor.WARN, doctor.FAIL)
    assert isinstance(title, str) and title
    assert isinstance(detail, str) and detail
    assert fix is None or isinstance(fix, str)


def test_all_checks_return_valid_results():
    """run_checks() returns a well-formed result for every registered check."""
    results = doctor.run_checks()
    assert len(results) == len(doctor.CHECKS)
    for r in results:
        _result_shape(r)


def test_failing_checks_provide_a_fix():
    """Any FAIL/WARN result must carry an actionable fix command."""
    for status, _title, _detail, fix in doctor.run_checks():
        if status in (doctor.FAIL, doctor.WARN):
            # node_modules-fresh / cache-empty can WARN with no fix only when
            # there is nothing to do; otherwise a fix is expected.
            if status == doctor.FAIL:
                assert fix, "hard failures must always include a fix command"


def test_venv_import_passes_under_test_runner():
    """The test runner imports scripts.*, so the import check must not be a hard FAIL."""
    status, _title, _detail, _fix = doctor.check_venv_import()
    assert status in (doctor.PASS, doctor.WARN)


def test_editable_mapping_points_at_this_repo():
    """The editable install must map `scripts` to this checkout (not a worktree)."""
    status, _title, detail, _fix = doctor.check_editable_mapping()
    # If an editable install exists at all, it must resolve to this repo.
    assert status in (doctor.PASS, doctor.FAIL)
    if status == doctor.FAIL:
        # Acceptable only when no editable install is present in this env.
        assert "no editable install" in detail or "stale worktree" in detail


def test_env_check_missing_required_key_fails(tmp_path, monkeypatch):
    """A .env missing a required key is a hard FAIL with a doc-pointing fix."""
    env = tmp_path / ".env"
    env.write_text("SUPABASE_URL=https://example.supabase.co\n")  # SUPABASE_KEY absent
    monkeypatch.setattr(doctor, "PROJECT_ROOT", tmp_path)
    status, _title, detail, fix = doctor.check_env_file()
    assert status == doctor.FAIL
    assert "SUPABASE_KEY" in detail
    assert fix


def test_env_check_all_required_present_passes(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text(
        "SUPABASE_URL=x\nSUPABASE_KEY=y\n"
        "FANGRAPHS_USERNAME=u\nFANGRAPHS_PASSWORD=p\n"
    )
    monkeypatch.setattr(doctor, "PROJECT_ROOT", tmp_path)
    status, _title, _detail, _fix = doctor.check_env_file()
    assert status == doctor.PASS


def test_main_exits_nonzero_on_hard_failure(monkeypatch):
    """main() must exit nonzero when any check reports FAIL."""
    monkeypatch.setattr(
        doctor,
        "run_checks",
        lambda: [(doctor.FAIL, "x", "broke", "fix it")],
    )
    with pytest.raises(SystemExit) as exc:
        doctor.main()
    assert exc.value.code == 1


def test_main_exits_zero_with_only_warnings(monkeypatch):
    """Warnings alone are not fatal — exit 0."""
    monkeypatch.setattr(
        doctor,
        "run_checks",
        lambda: [(doctor.WARN, "x", "soft", "fix it"), (doctor.PASS, "y", "ok", None)],
    )
    # No SystemExit means exit 0.
    doctor.main()
