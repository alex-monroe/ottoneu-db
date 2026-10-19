"""Fit the exchange rate between this-season value and keeper value (``just trade-exchange``).

The quantity: **λ, keeper dollars a team gives up per dollar of this-season
value**. A trade the buyer accepted says λ_buyer ≥ r ≥ λ_seller, where
r = −keeper_net / season_net from the buyer's side (``features.py``). The
model is

    log r = μ + β·(odds_buyer + odds_seller)/2 + (u_buyer + u_seller)/2 + ε,
    u_team ~ N(0, τ²),  ε ~ N(0, σ²)

i.e. the trade clears at the midpoint of the two teams' log rates, each team's
rate is a pooled level plus a playoff-odds slope plus a team effect. What the
data can support is reported in tiers, smallest assumption first:

1. **Pooled rate** — exchange trades only, ratio of totals and geometric mean,
   trade-bootstrap intervals.
2. **Playoff-odds dependence** — β by least squares, only when at least
   ``MIN_FOR_SLOPE`` exchange trades have odds; otherwise a direction check on
   every in-season trade (does the higher-odds side take this-season value?).
3. **Team effects** — τ by marginal likelihood (Gaussian, crossed design),
   with shrunk team rates, and the sample a team-level rate would need.
4. **Veto votes** — rank correlation with how lopsided the trade is at the
   pooled rate; a weak, ordinal fairness signal.

The backtest is leave-one-trade-out: predict a held-out exchange's rate from
the rest, against the 1:1 rate that summing the two reads implicitly assumes.
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import optimize, stats

from scripts.trade_exchange import features, outlook

BOOTSTRAP = 4000
SEED = 20261018
MIN_FOR_SLOPE = 8
# A between-team spread worth detecting: ±0.35 in log rate ≈ teams differ by ~40%.
TAU_OF_INTEREST = 0.35
# An odds slope worth detecting: a sure contender's rate e^0.7 ≈ 2× a team out of it.
BETA_OF_INTEREST = 0.7
LOPSIDED = 20.0


def _ci(samples: np.ndarray, level: float = 0.9) -> tuple[float, float]:
    lo, hi = np.nanquantile(samples, [(1 - level) / 2, (1 + level) / 2])
    return float(lo), float(hi)


@dataclass
class Pooled:
    n: int
    ratio_of_totals: float
    ratio_ci: tuple[float, float]
    geo_mean: float
    geo_ci: tuple[float, float]
    log_sd: float
    median: float


def pooled_rate(trades: pd.DataFrame, rng: np.random.Generator) -> Pooled | None:
    ex = trades[trades["exchange"]]
    n = len(ex)
    if n < 2:
        return None
    k, s = -ex["keeper_net"].to_numpy(), ex["season_net"].to_numpy()
    logr = np.log(ex["rate"].to_numpy())
    idx = rng.integers(0, n, size=(BOOTSTRAP, n))
    return Pooled(
        n=n,
        ratio_of_totals=float(k.sum() / s.sum()),
        ratio_ci=_ci(k[idx].sum(1) / s[idx].sum(1)),
        geo_mean=float(np.exp(logr.mean())),
        geo_ci=_ci(np.exp(logr[idx].mean(1))),
        log_sd=float(logr.std(ddof=1)),
        median=float(np.median(ex["rate"])),
    )


def all_trades_lambda(trades: pd.DataFrame, rng: np.random.Generator) -> tuple[float, tuple[float, float]]:
    """λ minimising Σ(λ·S + K)² over every trade — 'every trade is roughly fair at λ'."""
    s, k = trades["season_net"].to_numpy(), trades["keeper_net"].to_numpy()
    n = len(s)
    idx = rng.integers(0, n, size=(BOOTSTRAP, n))
    boot = -(s[idx] * k[idx]).sum(1) / (s[idx] ** 2).sum(1)
    return float(-(s * k).sum() / (s * s).sum()), _ci(boot)


@dataclass
class OddsRead:
    n_with_odds: int
    n_exchanges_with_odds: int
    slope: float | None = None
    slope_ci: tuple[float, float] | None = None
    # Direction check, every in-season trade with odds.
    buyer_higher: int = 0
    direction_p: float | None = None
    spearman_keeper: float | None = None
    spearman_keeper_p: float | None = None


def odds_dependence(trades: pd.DataFrame, rng: np.random.Generator) -> OddsRead:
    with_odds = trades.dropna(subset=["buyer_odds", "seller_odds"])
    ex = with_odds[with_odds["exchange"]]
    read = OddsRead(n_with_odds=len(with_odds), n_exchanges_with_odds=len(ex))
    if len(ex) >= MIN_FOR_SLOPE:
        x = ((ex["buyer_odds"] + ex["seller_odds"]) / 2).to_numpy()
        y = np.log(ex["rate"].to_numpy())
        read.slope = float(np.polyfit(x, y, 1)[0])
        idx = rng.integers(0, len(x), size=(BOOTSTRAP, len(x)))
        boot = [np.polyfit(x[i], y[i], 1)[0] if np.ptp(x[i]) > 0 else np.nan for i in idx]
        read.slope_ci = _ci(np.asarray(boot))
    if len(with_odds) >= 3:
        diff = (with_odds["buyer_odds"] - with_odds["seller_odds"]).to_numpy()
        informative = diff != 0
        read.buyer_higher = int((diff > 0).sum())
        if informative.any():
            read.direction_p = float(stats.binomtest(read.buyer_higher, int(informative.sum()), 0.5).pvalue)
        rho = stats.spearmanr(diff, with_odds["keeper_net"])
        read.spearman_keeper, read.spearman_keeper_p = float(rho.statistic), float(rho.pvalue)
    return read


@dataclass
class TeamEffects:
    n: int
    teams: int
    mu: float
    sigma: float
    tau: float
    tau_upper: float
    shrunk: dict[str, float] = field(default_factory=dict)
    trades_per_team_needed: float = math.nan
    exchanges_per_year: float = math.nan


def _profile(rho: float, y: np.ndarray, z: np.ndarray) -> tuple[float, float, float]:
    """−2 log REML-free profile likelihood at ρ = τ²/σ²: returns (value, μ̂, σ̂²)."""
    n = len(y)
    v = np.eye(n) + rho * z @ z.T
    vinv = np.linalg.inv(v)
    one = np.ones(n)
    mu = float(one @ vinv @ y / (one @ vinv @ one))
    r = y - mu
    s2 = float(r @ vinv @ r / n)
    _, logdet = np.linalg.slogdet(v)
    return n * math.log(max(s2, 1e-12)) + logdet, mu, s2


def team_effects(trades: pd.DataFrame) -> TeamEffects | None:
    ex = trades[trades["exchange"]].reset_index(drop=True)
    if len(ex) < 3:
        return None
    teams = sorted(set(ex["buyer"]) | set(ex["seller"]))
    col = {t: i for i, t in enumerate(teams)}
    z = np.zeros((len(ex), len(teams)))
    for i, r in ex.iterrows():
        z[i, col[r["buyer"]]] += 0.5
        z[i, col[r["seller"]]] += 0.5
    y = np.log(ex["rate"].to_numpy())

    grid = np.concatenate([[0.0], np.logspace(-3, 4, 281)])
    prof = np.array([_profile(rho, y, z)[0] for rho in grid])
    best = int(prof.argmin())
    m2ll, mu, s2 = _profile(grid[best], y, z)
    tau = math.sqrt(grid[best] * s2)
    # Profile-likelihood 90% upper bound on τ (Δ(−2 log L) ≤ 2.71).
    ok = grid[prof - m2ll <= stats.chi2.ppf(0.90, 1)]
    tau_upper = math.sqrt(float(ok.max()) * s2)

    # Shrunk team effects (BLUP) at the fitted ρ.
    rho = grid[best]
    shrunk = {}
    if rho > 0:
        v = np.eye(len(y)) + rho * z @ z.T
        u = rho * z.T @ np.linalg.solve(v, y - mu)
        shrunk = {t: float(math.exp(mu + u[col[t]])) for t in teams}
    else:
        shrunk = {t: float(math.exp(mu)) for t in teams}

    # Each trade carries half of a team's effect, so n trades give n/4σ² of
    # information about it; reliability ≥ ½ needs n ≥ 4σ²/τ² at τ of interest.
    sigma = math.sqrt(s2)
    needed = 4 * s2 / TAU_OF_INTEREST ** 2
    days = (pd.to_datetime(trades["at"]).max() - pd.to_datetime(trades["at"]).min()).days or 1
    per_year = len(ex) / (days / 365.25)
    return TeamEffects(len(ex), len(teams), mu, sigma, tau, tau_upper, shrunk, needed, per_year)


ODDS_BUCKETS = ((0.0, 0.25, "< 25%"), (0.25, 0.75, "25–75%"), (0.75, 1.01, "> 75%"))


def by_odds_bucket(trades: pd.DataFrame, rng: np.random.Generator) -> list[tuple[str, int, int, float | None, tuple[float, float] | None]]:
    """(bucket, trades, exchanges, geometric-mean rate, 90% interval) by the buyer's odds."""
    out = []
    groups = [(label, trades[(trades["buyer_odds"] >= lo) & (trades["buyer_odds"] < hi)]) for lo, hi, label in ODDS_BUCKETS]
    groups.append(("unknown (no schedule, or offseason with no prior)", trades[trades["buyer_odds"].isna()]))
    for label, g in groups:
        p = pooled_rate(g, rng)
        out.append((label, len(g), int(g["exchange"].sum()), p.geo_mean if p else None, p.geo_ci if p else None))
    return out


def slope_sample_needed(sigma: float, odds_sd: float) -> float:
    """Exchange trades with odds for β = BETA_OF_INTEREST to sit 2 SE from zero."""
    if odds_sd <= 0:
        return math.inf
    return (2 * sigma / (odds_sd * BETA_OF_INTEREST)) ** 2


@dataclass
class Vetoes:
    n: int
    with_veto: int
    removed: int
    rho_lopsided: float | None
    p_lopsided: float | None
    rho_size: float | None
    p_size: float | None


def veto_signal(trades: pd.DataFrame, rate: float, removed: int = 0) -> Vetoes:
    v = trades.dropna(subset=["veto_votes"])
    lopsided = (rate * v["season_net"] + v["keeper_net"]).abs()
    size = rate * v["season_net"].abs() + v["keeper_net"].abs()
    out = Vetoes(len(v), int((v["veto_votes"] > 0).sum()), removed, None, None, None, None)
    if out.with_veto >= 1 and len(v) >= 5:
        a = stats.spearmanr(v["veto_votes"], lopsided)
        b = stats.spearmanr(v["veto_votes"], size)
        out.rho_lopsided, out.p_lopsided = float(a.statistic), float(a.pvalue)
        out.rho_size, out.p_size = float(b.statistic), float(b.pvalue)
    return out


@dataclass
class Backtest:
    n: int
    mae_pooled: float
    mae_one: float
    wins: int
    temporal: str
    lopsided_pooled: int
    lopsided_one: int
    total: int


def backtest(trades: pd.DataFrame) -> Backtest | None:
    """Leave-one-exchange-out log-rate error: pooled geometric mean vs 1:1."""
    ex = trades[trades["exchange"]].reset_index(drop=True)
    if len(ex) < 3:
        return None
    logr = np.log(ex["rate"].to_numpy())
    err_p, err_1 = [], []
    for i in range(len(ex)):
        rest = np.delete(logr, i)
        err_p.append(abs(logr[i] - rest.mean()))
        err_1.append(abs(logr[i]))
    err_p, err_1 = np.asarray(err_p), np.asarray(err_1)

    # Temporal: fit on the first season, score the later ones.
    first = ex["season"].min()
    train, test = logr[ex["season"] == first], logr[ex["season"] > first]
    if len(train) >= 2 and len(test) >= 1:
        m = train.mean()
        temporal = (f"fit on {first} ({len(train)} exchanges, rate {math.exp(m):.2f}); "
                    f"{len(test)} later exchange(s) at {', '.join(f'{math.exp(x):.2f}' for x in test)}: "
                    f"log error {np.abs(test - m).mean():.2f} vs {np.abs(test).mean():.2f} at 1:1")
    else:
        temporal = "not enough exchanges in both periods"

    rate = math.exp(logr.mean())
    lop = lambda r: int(((r * trades["season_net"] + trades["keeper_net"]).abs() > LOPSIDED).sum())
    return Backtest(len(ex), float(err_p.mean()), float(err_1.mean()), int((err_p < err_1).sum()),
                    temporal, lop(rate), lop(1.0), len(trades))


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def _f(x, nd=2):
    return "—" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.{nd}f}"


def report(trades: pd.DataFrame, removed: int = 0) -> str:
    rng = np.random.default_rng(SEED)
    pooled = pooled_rate(trades, rng)
    lam_all, lam_ci = all_trades_lambda(trades, rng)
    odds = odds_dependence(trades, rng)
    teams = team_effects(trades)
    rate = pooled.geo_mean if pooled else 1.0
    vetoes = veto_signal(trades, rate, removed)
    bt = backtest(trades)
    with_odds = trades.dropna(subset=["buyer_odds", "seller_odds"])
    odds_sd = float(((with_odds["buyer_odds"] + with_odds["seller_odds"]) / 2).std(ddof=1)) if len(with_odds) > 1 else 0.0
    sigma = teams.sigma if teams else (pooled.log_sd if pooled else math.nan)
    slope_n = slope_sample_needed(sigma, odds_sd)

    lines = [
        "# Trade exchange rate: generated report",
        "",
        "Generated by `just trade-exchange`; see "
        "[references/trade-exchange-rate.md](../references/trade-exchange-rate.md) for the method.",
        "",
        "## Sample",
        "",
        f"- **{len(trades)} trades** ({', '.join(f'{s}: {n}' for s, n in trades['season'].value_counts().sort_index().items())}), "
        f"all processed. {removed} `removed` (vetoed or withdrawn) trade(s) are on record"
        + (", so there is no accepted-vs-vetoed contrast." if removed == 0 else "."),
        f"- **{int(trades['exchange'].sum())} exchanges**: the buyer took ≥ ${features.MIN_LEG:.0f} of this-season value "
        f"and gave ≥ ${features.MIN_LEG:.0f} of keeper value. In the other "
        f"{len(trades) - int(trades['exchange'].sum())}, by our reads one side took both, or the trade was too small.",
        f"- **{len(with_odds)} trades have playoff odds** (in-season, with a stored schedule); "
        f"{odds.n_exchanges_with_odds} of them are exchanges. "
        f"{int(trades['week_approx'].sum())} trades have no stored schedule, so their week is approximated from the NFL calendar.",
        f"- Keeper outlook coverage: {trades['outlook_coverage'].mean():.0%} of traded players; the rest use the point fallback.",
        "",
        "## 1. Pooled rate (keeper $ given per this-season $ received)",
        "",
    ]
    if pooled:
        lines += [
            "| Estimator | Rate | 90% interval |",
            "|---|---|---|",
            f"| Ratio of totals, exchanges | {_f(pooled.ratio_of_totals)} | {_f(pooled.ratio_ci[0])}–{_f(pooled.ratio_ci[1])} |",
            f"| Geometric mean, exchanges | {_f(pooled.geo_mean)} | {_f(pooled.geo_ci[0])}–{_f(pooled.geo_ci[1])} |",
            f"| Median, exchanges | {_f(pooled.median)} | |",
            f"| Least squares, all trades | {_f(lam_all)} | {_f(lam_ci[0])}–{_f(lam_ci[1])} |",
            "",
            f"Spread between trades: log-rate SD {_f(pooled.log_sd)} (one SD ≈ ×{math.exp(pooled.log_sd):.1f}).",
            "",
        ]
    else:
        lines += ["Fewer than two exchanges: no pooled rate.", ""]

    lines += [
        "## 2. Playoff-odds dependence",
        "",
        "By the buyer's playoff odds on the trade day:",
        "",
        "| Buyer's odds | Trades | Exchanges | Rate (geo. mean) | 90% interval |",
        "|---|---|---|---|---|",
        *[f"| {label} | {n} | {nx} | {_f(r)} | {'—' if ci is None else f'{_f(ci[0])}–{_f(ci[1])}'} |"
          for label, n, nx, r, ci in by_odds_bucket(trades, rng)],
        "",
    ]
    if odds.slope is not None:
        lines += [f"Slope of log rate on mean odds: {_f(odds.slope)} (90% {_f(odds.slope_ci[0])} to {_f(odds.slope_ci[1])}).", ""]
    else:
        lines += [f"**Not estimable.** {odds.n_exchanges_with_odds} exchange(s) have odds; a slope needs {MIN_FOR_SLOPE}.", ""]
    if odds.spearman_keeper is not None:
        lines += [
            f"Direction check over the {odds.n_with_odds} in-season trades: the side with the higher odds took "
            f"this-season value in {odds.buyer_higher} (binomial p = {_f(odds.direction_p)}); Spearman of the odds gap "
            f"with the buyer's keeper net = {_f(odds.spearman_keeper)} (p = {_f(odds.spearman_keeper_p)}).",
            "",
        ]
    lines += [
        f"Sample needed: about **{slope_n:.0f} exchanges with odds** for a slope of {BETA_OF_INTEREST} "
        f"(a contender's rate ≈ ×{math.exp(BETA_OF_INTEREST):.1f} a no-hoper's) to sit two standard errors from zero, "
        f"at the observed spread (σ = {_f(sigma)}, SD of mean odds = {_f(odds_sd)}).",
        "",
        "## 3. Team-specific rates",
        "",
    ]
    if teams:
        lines += [
            f"Crossed random-effects fit over {teams.n} exchanges and {teams.teams} teams: "
            f"μ = {_f(teams.mu)} (rate {math.exp(teams.mu):.2f}), σ = {_f(teams.sigma)}, "
            f"**τ = {_f(teams.tau)}** (90% upper bound {_f(teams.tau_upper)}).",
            "",
            *(["| Team | Shrunk rate |", "|---|---|",
               *[f"| {t} | {_f(r)} |" for t, r in sorted(teams.shrunk.items(), key=lambda kv: -kv[1])], ""]
              if teams.tau > 0 else
              [f"With τ at zero every team shrinks fully to the pooled rate ({math.exp(teams.mu):.2f}): "
               "the data cannot tell the teams apart.", ""]),
            f"For a team effect of τ = {TAU_OF_INTEREST} to be half signal (reliability ≥ ½), a team needs about "
            f"**{teams.trades_per_team_needed:.0f} exchanges**. The league produces about "
            f"{teams.exchanges_per_year:.0f} exchanges a year in total.",
            "",
        ]
    else:
        lines += ["Fewer than three exchanges: no team-level fit.", ""]

    lines += [
        "## 4. Veto votes",
        "",
        f"{vetoes.with_veto} of {vetoes.n} trades with a vote count drew any veto; {vetoes.removed} were removed.",
    ]
    if vetoes.rho_lopsided is not None:
        lines += [
            f"Spearman of veto votes with lopsidedness |{rate:.2f}·S + K|: {_f(vetoes.rho_lopsided)} (p = {_f(vetoes.p_lopsided)}); "
            f"with trade size: {_f(vetoes.rho_size)} (p = {_f(vetoes.p_size)}).",
        ]
    lines += ["", "## 5. Backtest", ""]
    if bt:
        lines += [
            f"Leave-one-exchange-out, mean absolute log-rate error: **pooled {_f(bt.mae_pooled)}** vs "
            f"1:1 {_f(bt.mae_one)} (pooled closer on {bt.wins} of {bt.n}).",
            f"Temporal: {bt.temporal}.",
            f"Trades that read lopsided (> ${LOPSIDED:.0f} in keeper dollars) at the pooled rate: {bt.lopsided_pooled} of {bt.total}; "
            f"at 1:1: {bt.lopsided_one}.",
            "",
        ]
    lines += [
        "## Trades",
        "",
        "| Season | Wk | Buyer | Seller | This-season $ | Keeper $ | Rate | Odds b/s | Votes a/v |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in trades.sort_values("at").itertuples():
        wk = f"{r.as_of_week}{'~' if r.week_approx else ''}"
        o = "—" if pd.isna(r.buyer_odds) else f"{r.buyer_odds:.0%} / {r.seller_odds:.0%}"
        vv = "—" if pd.isna(r.approve_votes) else f"{int(r.approve_votes)} / {int(r.veto_votes)}"
        lines.append(f"| {r.season} | {wk} | {r.buyer} | {r.seller} | {r.season_net:.0f} | {r.keeper_net:.0f} | "
                     f"{_f(r.rate) if r.exchange else ''} | {o} | {vv} |")
    lines += ["", "`~` = week approximated from the NFL calendar (no stored schedule)."]
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rebuild-outlooks", action="store_true",
                    help="refit the keeper outlooks for the trade seasons (in memory, cached under .cache/)")
    ap.add_argument("--outlooks", choices=("cache", "db"), default="cache",
                    help="read outlooks from the local cache (default) or keeper_outlook")
    ap.add_argument("--output", type=Path, help="write the markdown report here (else print)")
    args = ap.parse_args()

    sides = features.load_sides()
    if args.rebuild_outlooks:
        from scripts.season import stats_season
        outlook.build_outlooks(sorted({s["season"] for s in sides}), stats_season())
    book = outlook.OutlookBook(outlook.load_outlooks(args.outlooks))
    trades = features.trade_rows(sides, book, features.fetch_votes())
    text = report(trades, features.count_removed())
    if args.output:
        args.output.write_text(text)
        print(f"Wrote {args.output}")
    else:
        print(text)


if __name__ == "__main__":
    main()
