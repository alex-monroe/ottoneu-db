"""Tests for scripts/trade_exchange — the trade exchange-rate fit.

No network: trade sides and outlooks are synthetic; votes are passed in.
"""

from __future__ import annotations

import math
from datetime import date

import numpy as np
import pandas as pd
import pytest

from scripts.trade_exchange import features, fit, outlook


def book(rows):
    return outlook.OutlookBook(pd.DataFrame(rows, columns=["player_id", "season", "as_of_week", "value_quantiles", "own_weight"]))


def side(team, other, got, gave, season=2026, week=5, remaining=0.5, odds=None, key="th:1", tid=1):
    return {
        "trade_key": key, "ottoneu_trade_id": tid, "source": "trade_history", "season": season,
        "at": f"{season}-10-15T10:00", "as_of_week": week, "remaining": remaining,
        "team": team, "counterparty": other, "season_net": None, "cap_net": 0,
        "loan_out": 0, "loan_in": 0, "loans_known": True, "got": got, "gave": gave,
        "odds": None if odds is None else {"playoff_odds": odds, "rank": 1},
    }


def asset(pid, value, next_salary=10, next_value=None):
    return {"player_id": pid, "name": pid, "position": "RB", "salary": next_salary - 4,
            "next_salary": next_salary, "is_college": False, "value": value, "next_value": next_value}


def trade(vet_value=40.0, young_q=None, key="th:1", tid=1, odds=(0.8, 0.2), season=2026, week=5):
    """A buys the veteran (this-season value) from D for a young keeper."""
    vet, young = asset("vet", vet_value), asset("young", 2.0)
    return [
        side("A", "D", [vet], [young], season, week, 0.5, odds[0], key, tid),
        side("D", "A", [young], [vet], season, week, 0.5, odds[1], key, tid),
    ]


class TestCalendar:
    def test_week_one_ends_tuesday_after_opener(self):
        assert features.week_ends(2026)[0] == date(2026, 9, 15)  # matches league_matchups
        assert features.week_ends(2025)[0] == date(2025, 9, 9)
        assert len(features.week_ends(2025)) == features.REGULAR_SEASON_WEEKS

    def test_approx_week_counts_finished_weeks(self):
        assert features.approx_week("2025-08-20T00:00", 2025) == (0, 1.0)
        played, left = features.approx_week("2025-09-17T00:00", 2025)  # weeks 1-2 ended 9/9, 9/16
        assert played == 2 and left == pytest.approx(12 / 14)


class TestOutlookBook:
    def test_newest_snapshot_no_later_than_the_week(self):
        b = book([("p", 2026, 0, [1.0] * 20, 0.1), ("p", 2026, 3, [2.0] * 20, 0.5), ("p", 2026, 6, [3.0] * 20, 0.9)])
        assert b.as_of("p", 2026, 5)[0] == 2.0
        assert b.as_of("p", 2026, 0)[0] == 1.0
        assert b.as_of("p", 2025, 5) is None
        assert b.as_of(None, 2026, 5) is None

    def test_option_value_matches_ts(self):
        q = np.arange(20, dtype=float)  # 0..19
        assert outlook.option_value(q, 15) == pytest.approx((1 + 2 + 3 + 4) / 20)
        assert outlook.prob_keepable(q, 15) == pytest.approx(4 / 20)


class TestTradeRows:
    def test_orients_to_the_buyer_and_reads_the_option(self):
        b = book([("young", 2026, 3, [0.0] * 10 + [60.0] * 10, 0.5)])
        t = features.trade_rows(trade(), b, {1: (2, 1)})
        r = t.iloc[0]
        assert r.buyer == "A" and r.seller == "D"
        # (40 − 2) × half a season left.
        assert r.season_net == pytest.approx(19.0)
        # young: half the grid at 60 vs a 10 salary → 25 of option value given up;
        # vet: no outlook, point fallback max(0, value − next salary) = 30 received.
        assert r.keeper_net == pytest.approx(30 - 25)
        assert r.approve_votes == 2 and r.veto_votes == 1
        assert r.buyer_odds == 0.8

    def test_an_exchange_has_a_rate(self):
        b = book([("young", 2026, 3, [70.0] * 20, 0.5), ("vet", 2026, 3, [0.0] * 20, 0.5)])
        r = features.trade_rows(trade(), b).iloc[0]
        assert r.exchange
        assert r.rate == pytest.approx(60 / 19)

    def test_small_legs_are_not_exchanges(self):
        b = book([("young", 2026, 3, [12.0] * 20, 0.5), ("vet", 2026, 3, [0.0] * 20, 0.5)])
        r = features.trade_rows(trade(), b).iloc[0]
        assert not r.exchange and math.isnan(r.rate)

    def test_no_schedule_approximates_the_week_and_prorates(self):
        sides = trade(season=2025, week=None)
        for s in sides:
            s["remaining"] = None
            s["at"] = "2025-11-20T10:00"
        r = features.trade_rows(sides, book([])).iloc[0]
        assert r.week_approx
        played, left = features.approx_week("2025-11-20T10:00", 2025)
        assert r.as_of_week == played and r.season_net == pytest.approx(38 * left)


def frame(rates, buyers=None, sellers=None, odds=None, seasons=None):
    n = len(rates)
    s = np.full(n, 10.0)
    return pd.DataFrame({
        "trade_key": [f"t{i}" for i in range(n)],
        "season": seasons or [2025] * n,
        "at": pd.date_range("2025-09-10", periods=n, freq="20D").strftime("%Y-%m-%dT%H:%M"),
        "buyer": buyers or [f"B{i}" for i in range(n)],
        "seller": sellers or [f"S{i}" for i in range(n)],
        "season_net": s,
        "keeper_net": -s * np.asarray(rates),
        "exchange": True,
        "rate": rates,
        "buyer_odds": [o[0] for o in odds] if odds else np.nan,
        "seller_odds": [o[1] for o in odds] if odds else np.nan,
        "approve_votes": 2,
        "veto_votes": 0,
        "outlook_coverage": 1.0,
        "week_approx": False,
        "as_of_week": 5,
    })


class TestFit:
    def test_pooled_rate_recovers_a_constant(self):
        p = fit.pooled_rate(frame([2.0] * 6), np.random.default_rng(0))
        assert p.ratio_of_totals == pytest.approx(2.0)
        assert p.geo_mean == pytest.approx(2.0)
        assert p.geo_ci == pytest.approx((2.0, 2.0))

    def test_pooled_rate_needs_two_exchanges(self):
        assert fit.pooled_rate(frame([2.0]), np.random.default_rng(0)) is None

    def test_all_trades_lambda(self):
        lam, _ = fit.all_trades_lambda(frame([3.0] * 5), np.random.default_rng(0))
        assert lam == pytest.approx(3.0)

    def test_slope_recovered_when_enough_exchanges_have_odds(self):
        odds = [(o, o) for o in np.linspace(0.05, 0.95, 10)]
        rates = [math.exp(0.2 + 1.0 * o) for o, _ in odds]
        read = fit.odds_dependence(frame(rates, odds=odds), np.random.default_rng(0))
        assert read.slope == pytest.approx(1.0)

    def test_slope_withheld_below_the_minimum(self):
        odds = [(0.9, 0.1)] * 3
        read = fit.odds_dependence(frame([2.0] * 3, odds=odds), np.random.default_rng(0))
        assert read.slope is None
        assert read.buyer_higher == 3

    def test_no_team_spread_when_rates_are_noise(self):
        rng = np.random.default_rng(1)
        rates = list(np.exp(0.5 + 0.3 * rng.standard_normal(12)))
        te = fit.team_effects(frame(rates))
        assert te.tau < 0.3
        assert te.mu == pytest.approx(np.log(rates).mean(), abs=0.05)

    def test_team_spread_found_when_teams_differ(self):
        # X always clears high, Y always low: the crossed fit must see a team effect.
        buyers = ["X"] * 8 + ["Y"] * 8
        sellers = ["P", "Q"] * 8
        noise = np.exp(0.2 * np.random.default_rng(2).standard_normal(16))
        rates = list(np.r_[[4.0] * 8, [1.0] * 8] * noise)
        te = fit.team_effects(frame(rates, buyers=buyers, sellers=sellers))
        assert te.tau > 0.5
        assert te.shrunk["X"] > te.shrunk["Y"]

    def test_sample_needed_grows_with_noise(self):
        assert fit.slope_sample_needed(1.0, 0.2) > fit.slope_sample_needed(0.5, 0.2)
        assert fit.slope_sample_needed(1.0, 0.0) == math.inf

    def test_backtest_beats_one_to_one_on_a_constant_rate(self):
        bt = fit.backtest(frame([3.0] * 5, seasons=[2025] * 3 + [2026] * 2))
        assert bt.mae_pooled == pytest.approx(0.0)
        assert bt.mae_one == pytest.approx(math.log(3.0))
        assert "fit on 2025" in bt.temporal

    def test_report_renders_with_the_thin_sample(self):
        text = fit.report(frame([2.0, 1.0, 4.0]))
        assert "Pooled rate" in text and "Not estimable" in text
