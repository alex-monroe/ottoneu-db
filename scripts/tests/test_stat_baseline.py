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


class TestFrozenConfigs:
    """Iterations are frozen configs: an existing stat_* model must never change.

    If one of these fails, you changed what an existing config does. Revert that
    and add the behaviour as a new config field (default = old behaviour) used by
    a new stat_<stage><NN>_<slug> model instead (09-stat-model-ledger.md).
    """

    def test_a01_config_is_pinned(self):
        cfg = sb.get_stat_config("stat_a01_marcel")
        assert cfg.volume_weights == pytest.approx((1.0, 0.20 / 0.65, 0.15 / 0.65))
        assert cfg.rate_weights == pytest.approx((1.0, 0.32 / 0.45, 0.23 / 0.45))
        assert cfg.history_seasons == 3
        assert len(cfg.k_grid) == 91 and cfg.k_grid[0] == 0.0

    def test_a01_projection_is_pinned(self):
        seasons, _ = _wr_population(noise=1.0, seed=11, last=2021)
        cfg = sb.get_stat_config("stat_a01_marcel")
        proj = sb.project_season(seasons, 2021, cfg=cfg)
        assert proj["wr0"] == pytest.approx(6.399076, abs=1e-6)
        assert proj["wr7"] == pytest.approx(5.253275, abs=1e-6)
        assert sum(proj.values()) == pytest.approx(383.976854, abs=1e-5)

    def test_every_stat_model_has_a_config(self):
        from scripts.feature_projections.model_config import MODELS

        stat_models = [m for m, d in MODELS.items() if "stat_model" in d.features]
        assert stat_models, "expected at least one stat_* model"
        for name in stat_models:
            assert name.startswith("stat_"), name
            assert sb.get_stat_config(name).name == name

    def test_unknown_model_raises(self):
        with pytest.raises(KeyError):
            sb.get_stat_config("stat_z99_nope")


def _aging_population(seed=0, n_players=120, first=2010, last=2021, decline=0.04):
    """WRs whose true targets/game fall by `decline` per year past age 27."""
    rng = np.random.default_rng(seed)
    rows, positions, births = [], {}, {}
    for i in range(n_players):
        pid = f"wr{i}"
        positions[pid] = "WR"
        birth_year = int(rng.integers(first - 33, first - 21))
        births[pid] = f"{birth_year}-03-01"
        talent = 6.0 + rng.normal(0, 1.0)
        for s in range(first, last + 1):
            age = s - birth_year
            tpg = max(talent * (1 - decline * max(age - 27, 0)) + rng.normal(0, 0.3), 0.1)
            rows.append(_row(pid, s, targets=round(tpg * 16), receptions=round(tpg * 10),
                             receiving_yards=round(tpg * 120)))
    return sb.prepare_seasons(pd.DataFrame(rows), positions, births), positions


class TestAgeAdjustment:
    def test_age_column_from_birth_dates(self):
        df = sb.prepare_seasons(pd.DataFrame([_row("a", 2020), _row("b", 2020)]),
                                {"a": "WR", "b": "WR"}, {"a": "1995-09-01"})
        ages = dict(zip(df["player_id"], df["age"]))
        assert ages["a"] == pytest.approx(25.0, abs=0.01)
        assert np.isnan(ages["b"])

    def test_a01_ignores_ages(self):
        seasons, _ = _aging_population()
        no_age = seasons.assign(age=np.nan)
        a01 = sb.get_stat_config("stat_a01_marcel")
        assert sb.project_season(seasons, 2021, cfg=a01) == pytest.approx(
            sb.project_season(no_age, 2021, cfg=a01))

    def test_fitted_curve_recovers_decline(self):
        seasons, _ = _aging_population(decline=0.05)
        a02 = sb.get_stat_config("stat_a02_age")
        params = sb.fit_fold(seasons, 2021, a02)
        coef = params.age[("WR", "targets_pg")]
        young, old = sb.age_multiplier(np.array([24.0, 33.0]), coef, a02)
        assert old < 0.92 < young + 0.1
        assert old < young

    def test_a02_beats_a01_on_aging_data(self):
        seasons, _ = _aging_population(decline=0.05, last=2021, seed=2)
        actual = seasons[seasons["season"] == 2021].set_index("player_id")
        truth = actual["targets"] / actual["games"]
        err = {}
        for name in ("stat_a01_marcel", "stat_a02_age"):
            cfg = sb.get_stat_config(name)
            rates = sb.project_rates(seasons, sb.fit_fold(seasons, 2021, cfg)).set_index("player_id")
            common = truth.index.intersection(rates.index)
            err[name] = float((rates.loc[common, "targets_pg"] - truth[common]).abs().mean())
        assert err["stat_a02_age"] < err["stat_a01_marcel"]

    def test_unknown_age_gets_no_adjustment(self):
        cfg = sb.get_stat_config("stat_a02_age")
        m = sb.age_multiplier(np.array([np.nan, 35.0]), (-0.05, -0.01), cfg)
        assert m[0] == 1.0 and m[1] < 1.0

    def test_multiplier_is_clipped(self):
        cfg = sb.get_stat_config("stat_a02_age")
        assert sb.age_multiplier(np.array([36.0]), (-1.0, 0.0), cfg)[0] == sb.AGE_MULT_CLIP[0]


def _role_population(seed=0, n_players=150, first=2010, last=2021):
    """WRs where part-timers (few games) also see fewer targets per game."""
    rng = np.random.default_rng(seed)
    rows, positions = [], {}
    for i in range(n_players):
        pid = f"wr{i}"
        positions[pid] = "WR"
        starter = i % 3 != 0
        talent = (7.0 if starter else 2.0) + rng.normal(0, 1.0)
        for s in range(first, last + 1):
            games = int(rng.integers(13, 18)) if starter else int(rng.integers(1, 6))
            # Persistent talent plus per-game noise, averaged over the season.
            tpg = max(talent + rng.normal(0, 2.0 / np.sqrt(games)), 0.1)
            rows.append(_row(pid, s, games_played=games, targets=round(tpg * games),
                             receptions=round(tpg * games * 0.6),
                             receiving_yards=round(tpg * games * 7.5)))
    return sb.prepare_seasons(pd.DataFrame(rows), positions)


class TestRolePrior:
    def test_role_ratio_grows_with_history_and_is_clipped(self):
        r = sb.role_ratio(np.array([0.0, 4.0, 16.0, 1e9]), (0.2, 0.3))
        assert r[0] < r[1] < r[2]
        assert r[3] == sb.ROLE_RATIO_CLIP[1]

    def test_fit_recovers_part_timer_gap(self):
        seasons = _role_population()
        params = sb.fit_fold(seasons, 2021, sb.get_stat_config("stat_a03_role_prior"))
        coef = params.role[("WR", "targets_pg")]
        low, high = sb.role_ratio(np.array([3.0, 16.0]), coef)
        assert low < 0.7 < high

    def test_only_volume_stats_get_a_role_prior(self):
        seasons = _role_population()
        params = sb.fit_fold(seasons, 2021, sb.get_stat_config("stat_a03_role_prior"))
        kinds = {next(s for s in sb.CHAINS["WR"] if s.name == n).kind for (_, n) in params.role}
        assert kinds == {"volume"}

    def test_a03_beats_a02_on_part_timers(self):
        seasons = _role_population(seed=4)
        actual = seasons[seasons["season"] == 2021].set_index("player_id")
        truth = actual["targets"] / actual["games"]
        part = [p for p in truth.index if int(p[2:]) % 3 == 0]
        err = {}
        for name in ("stat_a02_age", "stat_a03_role_prior"):
            cfg = sb.get_stat_config(name)
            rates = sb.project_rates(seasons, sb.fit_fold(seasons, 2021, cfg)).set_index("player_id")
            err[name] = float((rates.loc[part, "targets_pg"] - truth[part]).abs().mean())
        assert err["stat_a03_role_prior"] < err["stat_a02_age"]

    def test_earlier_configs_have_no_role_prior(self):
        seasons = _role_population()
        for name in ("stat_a01_marcel", "stat_a02_age"):
            assert sb.fit_fold(seasons, 2021, sb.get_stat_config(name)).role == {}


class TestStatEval:
    def test_eval_produces_all_comparators_and_ppg_rows(self):
        seasons, _ = _wr_population(noise=1.0, seed=5)
        long = se.eval_season(seasons, 2020)
        summary = se.summarise(long)
        assert set(summary["comparator"]) == set(se.BASE_COMPARATORS)
        assert {"targets_pg", "ppg"} <= set(summary["stat"])
        md = se.render(summary, [2020])
        assert "| WR | targets_pg |" in md and "| WR | ppg |" in md

    def test_parent_comparator(self):
        seasons, _ = _wr_population(noise=1.0, seed=5)
        cfg = sb.get_stat_config("stat_a01_marcel")
        long = se.eval_season(seasons, 2020, cfg, parent_cfg=cfg)
        summary = se.summarise(long)
        assert "parent" in set(summary["comparator"])
        md = se.render(summary, [2020], "stat_a01_marcel", parent="stat_a01_marcel")
        assert "MAE parent" in md

    def test_parse_seasons(self):
        assert se._parse_seasons("2019-2021,2024") == [2019, 2020, 2021, 2024]
