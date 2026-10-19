"""Tests for scripts/keeper_value — the keeper outlook (option value) model.

No network: the model and evaluation are exercised on synthetic panels; the
nflverse loader is not called.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from scripts.config import MIN_PLAYER_SALARY, NUM_TEAMS, STARTING_LINEUP
from scripts.keeper_value import dataset, evaluate, model, publish
from scripts.keeper_value.market import Market, distributable_cap, replacement_levels
from scripts.name_utils import normalize_player_name


def ramp(n, top, step):
    return [top - i * step for i in range(n)]


def league_pool():
    """The same pool as web/__tests__/lib/replacement.test.ts `leaguePool`."""
    return {
        "QB": ramp(24, 400, 4) + ramp(16, 100, 2),
        "RB": ramp(60, 300, 4),
        "WR": ramp(70, 290, 3),
        "TE": ramp(30, 200, 5),
    }


class TestMarket:
    def test_replacement_matches_the_typescript_worked_example(self):
        level = replacement_levels(league_pool())
        assert level["QB"] == 400 - 23 * 4
        assert level["TE"] == 200 - 11 * 5

    def test_positive_value_sums_to_the_distributable_cap(self):
        pool = [(pos, v, 17) for pos, vals in league_pool().items() for v in vals]
        m = Market(pool)
        total = sum(m.latent_dollars(p, v) - MIN_PLAYER_SALARY for p, v, _ in pool
                    if v > m.replacement[p])
        assert total == pytest.approx(distributable_cap())

    def test_latent_goes_below_the_floor_but_dollars_do_not(self):
        m = Market([(pos, v, 17) for pos, vals in league_pool().items() for v in vals])
        assert m.latent_dollars("TE", 0) < MIN_PLAYER_SALARY
        assert m.dollars("TE", 0) == MIN_PLAYER_SALARY

    def test_kickers_and_short_seasons_are_left_out_of_the_pool(self):
        pool = [(pos, v, 17) for pos, vals in league_pool().items() for v in vals]
        base = Market(pool)
        noisy = Market(pool + [("K", 999, 17), ("WR", 999, 1)])
        assert noisy.replacement == base.replacement
        assert noisy.rate == pytest.approx(base.rate)

    def test_twelve_teams_start_one_te_each(self):
        assert NUM_TEAMS * STARTING_LINEUP["TE"] == 12


class TestBuckets:
    @pytest.mark.parametrize("years,bucket", [(0, "1"), (1, "1"), (4, "4"), (5, "5-6"), (6, "5-6"), (7, "7+")])
    def test_experience(self, years, bucket):
        assert dataset.experience_bucket(years) == bucket

    @pytest.mark.parametrize("rnd,bucket", [(1, "R1"), (3, "R3"), (4, "R4-5"), (7, "R6-7"), (None, "UDFA"), (np.nan, "UDFA")])
    def test_draft(self, rnd, bucket):
        assert dataset.draft_bucket(rnd) == bucket


def synthetic_panel(n_seasons=8, per_season=300, seed=0) -> pd.DataFrame:
    """Players whose next-season value tracks this season's pace, plus noise."""
    rng = np.random.default_rng(seed)
    rows = []
    for season in range(2013, 2013 + n_seasons):
        for i in range(per_season):
            pos = ["QB", "RB", "WR", "TE"][i % 4]
            years = int(rng.integers(1, 10))
            rnd = rng.choice([1, 2, 3, 4, 6, np.nan])
            talent = rng.normal(5, 25) + (15 if rnd == 1 else 0)
            games_now = int(rng.integers(0, 13))
            pace = talent + rng.normal(0, 30 / np.sqrt(games_now + 1)) if games_now else np.nan
            latent_next = max(dataset.LATENT_FLOOR, talent + rng.normal(0, 15))
            rows.append({
                "player_id": f"p{i}", "name": f"Player {i}", "position": pos, "season": season,
                "as_of_week": 12, "years": years, "exp_bucket": dataset.experience_bucket(years),
                "draft_bucket": dataset.draft_bucket(rnd), "age": 22 + years,
                "games_now": games_now, "team_games_now": 12, "latent_now": pace,
                "snap_now": 0.6 if games_now else np.nan, "opp_now": 0.15 if games_now else np.nan,
                "games_prev": 0, "latent_prev": np.nan, "snap_prev": np.nan, "opp_prev": np.nan,
                "career_games": games_now + 17 * (years - 1),
                "point_value": max(1.0, pace) if games_now else 1.0,
                "latent_next": latent_next, "value_next": max(1.0, latent_next),
            })
    return pd.DataFrame(rows)


class TestPrior:
    def test_thin_cells_borrow_up_to_the_pool_target(self):
        panel = synthetic_panel(n_seasons=3, per_season=200)
        prior = model.Prior.fit(panel)
        assert min(prior.n_eff.values()) >= model.POOL_TARGET - 1e-9

    def test_a_full_cell_is_left_alone(self):
        rows = [{"position": "WR", "exp_bucket": "1", "draft_bucket": "R1", "latent_next": 50.0}] * 100
        rows += [{"position": "WR", "exp_bucket": "2", "draft_bucket": "R1", "latent_next": -30.0}] * 100
        prior = model.Prior.fit(pd.DataFrame(rows))
        assert prior.mean[("WR", "1", "R1")] == pytest.approx(50.0)
        assert prior.n_eff[("WR", "1", "R1")] == pytest.approx(100)


class TestKeeperModel:
    @pytest.fixture(scope="class")
    def fitted(self):
        panel = synthetic_panel()
        train = panel[panel["season"] < 2020]
        test = panel[panel["season"] == 2020]
        return model.KeeperModel.fit(train), test

    def test_quantiles_are_sorted_and_floored(self, fitted):
        m, test = fitted
        q = m.predict_quantiles(test)
        assert q.shape == (len(test), len(model.GRID))
        assert (q >= MIN_PLAYER_SALARY).all()
        assert (np.diff(q, axis=1) >= -1e-9).all()

    def test_a_player_with_no_games_gets_the_prior(self, fitted):
        m, test = fitted
        rookies = test[test["career_games"] == 0]
        assert len(rookies) > 0
        np.testing.assert_allclose(m.predict_quantiles(rookies), m.predict_quantiles(rookies, shrink=False))
        assert (m.weights(rookies) == 0).all()

    def test_weight_grows_with_games(self, fitted):
        m, test = fitted
        w = m.weights(test.assign(position="WR", career_games=[5] * len(test)))
        w2 = m.weights(test.assign(position="WR", career_games=[50] * len(test)))
        assert (w2 > w).all()

    def test_the_adjustment_beats_the_prior_when_pace_is_informative(self, fitted):
        m, test = fitted
        y = test["value_next"].to_numpy(float)
        shrunk = model.crps(m.predict_quantiles(test), y).mean()
        prior = model.crps(m.predict_quantiles(test, shrink=False), y).mean()
        assert shrunk < prior


class TestReadingADistribution:
    def test_option_value_is_the_mean_payoff(self):
        q = np.array([[1.0, 10.0, 30.0, 59.0]])
        assert model.option_value(q, 20)[0] == pytest.approx((0 + 0 + 10 + 39) / 4)

    def test_option_value_beats_the_point_read_for_a_long_shot(self):
        # Median under the salary: the point read says $0, the option does not.
        q = np.array([[1, 1, 5, 8, 12, 15, 18, 40, 70, 120]], dtype=float)
        point = max(0.0, float(np.median(q)) - 20)
        assert point == 0
        assert model.option_value(q, 20)[0] > 0

    def test_prob_above(self):
        q = np.array([[1.0, 1.0, 10.0, 30.0]])
        assert model.prob_above(q, 5)[0] == pytest.approx(0.5)
        assert model.prob_above(q, 1)[0] == pytest.approx(0.5)  # $1 is not above $1

    def test_crps_of_a_point_mass_is_absolute_error(self):
        q = np.full((1, len(model.GRID)), 10.0)
        assert model.crps(q, np.array([25.0]))[0] == pytest.approx(15.0)


class TestEvaluate:
    def test_draws_from_the_forecast_are_covered(self):
        rng = np.random.default_rng(3)
        n = 4000
        q = np.tile(np.quantile(rng.normal(20, 10, 20000), model.GRID), (n, 1))
        y = rng.normal(20, 10, n)
        cov = evaluate.coverage(q, y)
        assert cov["p10"] == pytest.approx(0.10, abs=0.03)
        assert cov["p50"] == pytest.approx(0.50, abs=0.03)
        assert cov["p90"] == pytest.approx(0.90, abs=0.03)

    def test_ties_on_the_floor_are_spread(self):
        # Forecast: half the mass on $1. Outcome $1. PIT is uniform on [0, 0.5].
        q = np.array([[1.0] * 20 + list(np.linspace(2, 40, 20))])
        cov = evaluate.coverage(q, np.array([1.0]))
        assert cov["p10"] == pytest.approx(0.2)
        assert cov["p50"] == pytest.approx(1.0)

    def test_paired_bootstrap_clusters_by_player(self):
        a = np.array([1.0, 1.0, 1.0, 5.0])
        b = np.array([0.0, 0.0, 0.0, 5.0])
        d, lo, hi = evaluate.paired_bootstrap(a, b, np.array(["x", "x", "x", "y"]), n_boot=500)
        assert d == pytest.approx(0.75)
        assert lo <= d <= hi


class TestPublishMatching:
    def test_matches_by_name_and_position_then_unique_name(self):
        allen, puka = normalize_player_name("Josh Allen"), normalize_player_name("Puka Nacua")
        by_pos = {(allen, "QB"): "qb-id", (allen, "LB"): "lb-id"}
        by_name = {allen: ["qb-id", "lb-id"], puka: ["puka-id"]}
        assert publish.match("Josh Allen", "QB", by_pos, by_name) == "qb-id"
        assert publish.match("Puka Nacua", "WR", by_pos, by_name) == "puka-id"
        assert publish.match("Josh Allen", "WR", by_pos, by_name) is None
