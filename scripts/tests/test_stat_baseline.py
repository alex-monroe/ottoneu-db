"""Tests for the Stage A Marcel-plus stat baseline and its per-stat eval."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from scripts.feature_projections import stat_baseline as sb
from scripts.feature_projections import stat_eval as se
from scripts.scoring import score_stats


def _row(pid, season, **stats):
    base = {c: 0 for c in sb._RAW_COLS}
    base.update({"player_id": pid, "season": season, "games_played": 16})
    base.update(stats)
    return base


def _seasons(rows, positions):
    return sb.prepare_seasons(pd.DataFrame(rows), positions)


def _wr_population(seed=0, n_players=60, first=2010, last=2020, noise=0.0, talent_sd=1.0):
    """WRs whose targets/game = talent + optional per-season noise."""
    rng = np.random.default_rng(seed)
    rows, positions = [], {}
    for i in range(n_players):
        pid = f"wr{i}"
        positions[pid] = "WR"
        talent = 6.0 + rng.normal(0, talent_sd)
        for s in range(first, last + 1):
            tpg = max(talent + rng.normal(0, noise), 0.1)
            rows.append(_row(pid, s, targets=round(tpg * 16), receptions=round(tpg * 10),
                             receiving_yards=round(tpg * 120)))
    return _seasons(rows, positions), positions


class TestPrepareSeasons:
    def test_drops_zero_game_rows_and_unknown_positions(self):
        df = _seasons(
            [_row("a", 2020), _row("b", 2020, games_played=0), _row("c", 2020)],
            {"a": "WR", "b": "WR", "c": "DST"},
        )
        assert list(df["player_id"]) == ["a"]

    def test_touches_and_games_derived(self):
        df = _seasons([_row("a", 2020, rushing_attempts=100, receptions=30)], {"a": "RB"})
        assert df.loc[0, "touches"] == 130
        assert df.loc[0, "games"] == 16


class TestShrinkage:
    def test_formula(self):
        # (num_w + k·μ) / (den_w + k)
        assert sb._shrunk(np.array([30.0]), np.array([10.0]), 10.0, 1.0)[0] == pytest.approx(2.0)
        assert sb._shrunk(np.array([30.0]), np.array([10.0]), 0.0, 1.0)[0] == pytest.approx(3.0)

    def test_history_weights_recent_season_most(self):
        rows = [_row("a", 2019, targets=160), _row("a", 2020, targets=80)]
        seasons = _seasons(rows, {"a": "WR"})
        spec = next(s for s in sb.CHAINS["WR"] if s.name == "targets_pg")
        h = sb._history_totals(seasons, spec, 2021).iloc[0]
        w = sb.VOLUME_WEIGHTS
        assert h["num_w"] == pytest.approx(80 * w[0] + 160 * w[1])
        assert h["den_w"] == pytest.approx(16 * w[0] + 16 * w[1])

    def test_history_ignores_target_and_later_seasons(self):
        rows = [_row("a", 2020, targets=80), _row("a", 2021, targets=999), _row("a", 2022, targets=999)]
        seasons = _seasons(rows, {"a": "WR"})
        spec = next(s for s in sb.CHAINS["WR"] if s.name == "targets_pg")
        assert sb._history_totals(seasons, spec, 2021).iloc[0]["num_w"] == pytest.approx(80)


class TestFitK:
    def test_stable_talent_gets_little_shrinkage(self):
        seasons, _ = _wr_population(noise=0.0, talent_sd=2.0)
        spec = next(s for s in sb.CHAINS["WR"] if s.name == "targets_pg")
        assert sb.fit_k(seasons, spec, 2021) < 1.0

    def test_pure_noise_gets_heavy_shrinkage(self):
        seasons, _ = _wr_population(noise=2.0, talent_sd=0.0)
        spec = next(s for s in sb.CHAINS["WR"] if s.name == "targets_pg")
        assert sb.fit_k(seasons, spec, 2021) > 50.0

    def test_too_few_pairs_falls_back(self):
        seasons, _ = _wr_population(n_players=3, first=2018, last=2020)
        spec = next(s for s in sb.CHAINS["WR"] if s.name == "targets_pg")
        assert sb.fit_k(seasons, spec, 2021) == sb.FALLBACK_K["volume"]


class TestFoldIsLeakageFree:
    def test_target_season_data_does_not_change_params_or_projection(self):
        seasons, _ = _wr_population(noise=1.0, last=2021, seed=3)
        params = sb.fit_fold(seasons, 2021)
        proj = sb.project_season(seasons, 2021, params)
        tampered = seasons.copy()
        tampered.loc[tampered["season"] == 2021, ["targets", "receptions"]] *= 10
        assert sb.fit_fold(tampered, 2021).k == params.k
        assert sb.project_season(tampered, 2021) == pytest.approx(proj)


class TestScoring:
    def test_wr_stat_line_composes_and_scores(self):
        rates = {"rush_att_pg": 0.0, "targets_pg": 8.0, "catch_rate": 0.625,
                 "yds_per_target": 9.0, "rec_td_rate": 0.05, "fumbles_per_touch": 0.0}
        line = sb.stat_line_per_game("WR", rates)
        assert line["receptions"] == pytest.approx(5.0)
        assert line["receiving_yards"] == pytest.approx(72.0)
        assert line["receiving_tds"] == pytest.approx(0.4)
        # 5 rec × 0.5 + 72 yds × 0.1 + 0.4 TD × 6
        assert sb.projected_ppg("WR", rates) == pytest.approx(2.5 + 7.2 + 2.4)

    def test_qb_line_uses_passing_chain(self):
        rates = {"pass_att_pg": 30.0, "ypa": 7.0, "pass_td_rate": 0.05, "int_rate": 0.02}
        line = sb.stat_line_per_game("QB", rates)
        assert line["passing_yards"] == pytest.approx(210.0)
        assert sb.projected_ppg("QB", rates) == pytest.approx(score_stats(line))

    def test_kicker_uses_ppg_directly(self):
        assert sb.projected_ppg("K", {"ppg": 8.25}) == 8.25


class TestStatEval:
    def test_eval_produces_all_comparators_and_ppg_rows(self):
        seasons, _ = _wr_population(noise=1.0, seed=5)
        long = se.eval_season(seasons, 2020)
        summary = se.summarise(long)
        assert set(summary["comparator"]) == set(se.COMPARATORS)
        assert {"targets_pg", "ppg"} <= set(summary["stat"])
        md = se.render(summary, [2020])
        assert "| WR | targets_pg |" in md and "| WR | ppg |" in md

    def test_parse_seasons(self):
        assert se._parse_seasons("2019-2021,2024") == [2019, 2020, 2021, 2024]
