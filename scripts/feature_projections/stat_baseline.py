"""Stage A of the stat-level projection redesign: the Marcel-plus stat baseline.

Projects each player's next-season **stat line per game**, then scores it
through ``scripts/scoring.py`` into PPG. Design: docs/exec-plans/stat-projections/
00-synthesis.md §4 (Stage A); parameters: 08-stability-study.md.

For every (position, stat) the projection is a recency-weighted, sample-size-
shrunk estimate:

    num_w = Σ_i w_i · num_i      den_w = Σ_i w_i · den_i      (lags i = 1..3)
    rate  = (num_w + k · μ) / (den_w + k)

- ``num``/``den`` are season totals: e.g. passing yards / passing attempts for
  ``ypa``, or rushing attempts / games for the per-game volume ``rush_att_pg``.
- ``w`` are recency weights normalised so the most recent season is 1.0, so
  ``den_w`` is in "most-recent-season-equivalent" opportunities. Volume and
  ppg use [.65, .20, .15]; per-opportunity rates use flatter Marcel-like
  [.45, .32, .23] (08 §3.2).
- ``μ`` is the position's opportunity-pooled rate over the same three seasons
  (tracks era drift: league-wide rates move, the prior moves with them).
- ``k`` is the pseudo-count, **fitted per (position, stat) inside each fold** by
  minimising the opportunity-weighted squared error of next-season rate on the
  training seasons only (every season strictly before the target). Fitting k by
  predictive loss rather than a within-season variance decomposition absorbs
  year-to-year drift, which the stability study found makes the within-season k
  2–8x too small for volume (08 §1.5).

Kickers are out of scope for the stat chain (00-synthesis §4 Stage B): they get
the same machinery on ppg directly.

Everything here is pure (DataFrames in, dicts out) so the runner, the per-stat
eval (``stat_eval.py``) and the tests share one implementation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

import numpy as np
import pandas as pd

from scripts.scoring import score_stats

# First season of usable nfl_stats; earlier seasons are not loaded.
MIN_DATA_SEASON = 2010

# Recency weights for lags 1..3, normalised to lag 1 = 1.0 (08 §3.2).
VOLUME_WEIGHTS: tuple[float, ...] = (1.0, 0.20 / 0.65, 0.15 / 0.65)
RATE_WEIGHTS: tuple[float, ...] = (1.0, 0.32 / 0.45, 0.23 / 0.45)
HISTORY_SEASONS = 3

# Candidate pseudo-counts for the in-fold grid search. Spans "no shrinkage" to
# "effectively the prior mean" for every opportunity unit used (games ≈ 1–17,
# attempts/targets up to several hundred per season).
K_GRID: np.ndarray = np.concatenate([[0.0], np.geomspace(0.05, 1e5, 90)])

# Minimum training pairs to fit k; below this the stat falls back to FALLBACK_K.
MIN_FIT_PAIRS = 30
FALLBACK_K = {"volume": 3.0, "rate": 200.0}


@dataclass(frozen=True)
class StatSpec:
    """One link of a position's stat chain.

    ``num`` / ``den`` name derived season-total columns (see ``_derive``).
    ``den == "games"`` marks a per-game volume stat; otherwise ``den`` is the
    opportunity the rate is per, and its projected per-game value must come from
    an earlier link in the chain.
    """

    name: str
    num: str
    den: str

    @property
    def kind(self) -> str:
        return "volume" if self.den == "games" else "rate"


_RUSH = [
    StatSpec("rush_att_pg", "rushing_attempts", "games"),
    StatSpec("ypc", "rushing_yards", "rushing_attempts"),
    StatSpec("rush_td_rate", "rushing_tds", "rushing_attempts"),
]
_REC = [
    StatSpec("targets_pg", "targets", "games"),
    StatSpec("catch_rate", "receptions", "targets"),
    StatSpec("yds_per_target", "receiving_yards", "targets"),
    StatSpec("rec_td_rate", "receiving_tds", "targets"),
]
_SKILL = _RUSH + _REC + [
    StatSpec("fumbles_per_touch", "fumbles_lost", "touches"),
    StatSpec("two_pt_rr_pg", "two_point_rush_rec", "games"),
]

CHAINS: dict[str, list[StatSpec]] = {
    "QB": [
        StatSpec("pass_att_pg", "passing_attempts", "games"),
        StatSpec("ypa", "passing_yards", "passing_attempts"),
        StatSpec("pass_td_rate", "passing_tds", "passing_attempts"),
        StatSpec("int_rate", "interceptions", "passing_attempts"),
        *_RUSH,
        StatSpec("fumbles_pg", "fumbles_lost", "games"),
        StatSpec("two_pt_pass_pg", "two_point_pass", "games"),
        StatSpec("two_pt_rr_pg", "two_point_rush_rec", "games"),
    ],
    "RB": _SKILL,
    "WR": _SKILL,
    "TE": _SKILL,
    "K": [StatSpec("ppg", "total_points", "games")],
}

_RAW_COLS = [
    "games_played", "passing_attempts", "passing_yards", "passing_tds", "interceptions",
    "rushing_attempts", "rushing_yards", "rushing_tds", "targets", "receptions",
    "receiving_yards", "receiving_tds", "fumbles_lost", "two_point_pass",
    "two_point_rush_rec", "total_points",
]


def prepare_seasons(nfl_stats: pd.DataFrame, positions: dict[str, str]) -> pd.DataFrame:
    """Season-total frame keyed by (player_id, season) with position and derived columns.

    ``nfl_stats`` is raw ``nfl_stats`` rows; ``positions`` maps player_id → position.
    Rows with no games, or a position outside ``CHAINS``, are dropped.
    """
    df = nfl_stats.copy()
    df["player_id"] = df["player_id"].astype(str)
    df["position"] = df["player_id"].map(positions)
    df = df[df["position"].isin(CHAINS.keys())]
    for col in _RAW_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0) if col in df.columns else 0.0
    df["season"] = pd.to_numeric(df["season"], errors="coerce").astype("Int64")
    df["games"] = df["games_played"]
    df["touches"] = df["rushing_attempts"] + df["receptions"]
    df = df[df["games"] > 0].dropna(subset=["season"])
    df["season"] = df["season"].astype(int)
    return df[["player_id", "season", "position", "games", "touches", *_RAW_COLS]].reset_index(drop=True)


def _weights(spec: StatSpec) -> tuple[float, ...]:
    return VOLUME_WEIGHTS if spec.kind == "volume" else RATE_WEIGHTS


def _history_totals(
    seasons: pd.DataFrame, spec: StatSpec, target: int
) -> pd.DataFrame:
    """Per player: recency-weighted num/den over lags 1..3 before ``target``."""
    w = _weights(spec)
    window = seasons[(seasons["season"] < target) & (seasons["season"] >= target - HISTORY_SEASONS)]
    if window.empty:
        return pd.DataFrame(columns=["player_id", "num_w", "den_w"])
    lag_w = (target - window["season"]).map(lambda lag: w[lag - 1])
    out = pd.DataFrame({
        "player_id": window["player_id"].values,
        "num_w": (window[spec.num] * lag_w).values,
        "den_w": (window[spec.den] * lag_w).values,
    })
    return out.groupby("player_id", as_index=False)[["num_w", "den_w"]].sum()


def _prior_mean(seasons: pd.DataFrame, spec: StatSpec, target: int) -> Optional[float]:
    """Position's opportunity-pooled rate over the three seasons before ``target``."""
    window = seasons[(seasons["season"] < target) & (seasons["season"] >= target - HISTORY_SEASONS)]
    den = float(window[spec.den].sum())
    return float(window[spec.num].sum()) / den if den > 0 else None


def _shrunk(num_w: np.ndarray, den_w: np.ndarray, k: float, mu: float) -> np.ndarray:
    return (num_w + k * mu) / (den_w + k)


def fit_k(seasons: pd.DataFrame, spec: StatSpec, target: int) -> float:
    """Pseudo-count minimising next-season weighted squared error, seasons < target only.

    Training pairs: for every season ``s`` with ``MIN_DATA_SEASON < s < target``,
    predict each player's season-``s`` rate from their seasons ``s-3..s-1``. The
    loss is weighted by the season-``s`` opportunity count, the natural weight
    for a rate whose sampling variance shrinks as 1/n.
    """
    nums, dens, ys, wts, mus = [], [], [], [], []
    for s in range(MIN_DATA_SEASON + 1, target):
        mu = _prior_mean(seasons, spec, s)
        if mu is None:
            continue
        hist = _history_totals(seasons, spec, s)
        hist = hist[hist["den_w"] > 0]
        actual = seasons[(seasons["season"] == s) & (seasons[spec.den] > 0)]
        pairs = hist.merge(actual[["player_id", spec.num, spec.den]], on="player_id")
        if pairs.empty:
            continue
        nums.append(pairs["num_w"].to_numpy(float))
        dens.append(pairs["den_w"].to_numpy(float))
        ys.append((pairs[spec.num] / pairs[spec.den]).to_numpy(float))
        wts.append(pairs[spec.den].to_numpy(float))
        mus.append(np.full(len(pairs), mu))
    if not nums or sum(len(a) for a in nums) < MIN_FIT_PAIRS:
        return FALLBACK_K[spec.kind]
    num, den, y, wt, mu = (np.concatenate(a) for a in (nums, dens, ys, wts, mus))
    losses = [float(np.sum(wt * (_shrunk(num, den, k, mu) - y) ** 2)) for k in K_GRID]
    return float(K_GRID[int(np.argmin(losses))])


@dataclass
class FoldParams:
    """Fitted Stage A parameters for one target season: (position, stat) → (k, μ)."""

    target_season: int
    k: dict[tuple[str, str], float]
    mu: dict[tuple[str, str], float]


def fit_fold(seasons: pd.DataFrame, target: int) -> FoldParams:
    """Fit k and μ for every (position, stat), using only seasons before ``target``."""
    train = seasons[seasons["season"] < target]
    ks: dict[tuple[str, str], float] = {}
    mus: dict[tuple[str, str], float] = {}
    for position, chain in CHAINS.items():
        pos_rows = train[train["position"] == position]
        for spec in chain:
            mu = _prior_mean(pos_rows, spec, target)
            if mu is None:
                continue
            mus[(position, spec.name)] = mu
            ks[(position, spec.name)] = fit_k(pos_rows, spec, target)
    return FoldParams(target, ks, mus)


def project_rates(
    seasons: pd.DataFrame, params: FoldParams, k_scale: float | None = 1.0
) -> pd.DataFrame:
    """Shrunk per-stat rates for every player with history before the target.

    Returns one row per (player_id, position) with a column per stat name.
    ``k_scale`` multiplies every fitted k (1.0 = the model; 0 = raw weighted rate;
    ``None`` = the prior mean itself), which the per-stat eval uses for its
    no-shrinkage and position-mean comparators.
    """
    target = params.target_season
    frames = []
    for position, chain in CHAINS.items():
        pos_rows = seasons[(seasons["position"] == position) & (seasons["season"] < target)]
        players = pos_rows[pos_rows["season"] >= target - HISTORY_SEASONS]["player_id"].unique()
        if len(players) == 0:
            continue
        out = pd.DataFrame({"player_id": players, "position": position})
        for spec in chain:
            key = (position, spec.name)
            if key not in params.mu:
                continue
            mu = params.mu[key]
            hist = _history_totals(pos_rows, spec, target).set_index("player_id")
            num_w = hist["num_w"].reindex(players).fillna(0.0).to_numpy(float)
            den_w = hist["den_w"].reindex(players).fillna(0.0).to_numpy(float)
            if k_scale is None:
                vals = np.full(len(players), mu)
            else:
                k = params.k[key] * k_scale
                with np.errstate(invalid="ignore", divide="ignore"):
                    vals = _shrunk(num_w, den_w, k, mu)
                vals = np.where(den_w + k > 0, vals, mu)
            out[spec.name] = vals
        frames.append(out)
    if not frames:
        return pd.DataFrame(columns=["player_id", "position"])
    return pd.concat(frames, ignore_index=True)


def stat_line_per_game(position: str, r: dict) -> dict[str, float]:
    """Compose a position's per-game stat line (scoring keys) from its shrunk rates."""
    g = lambda name: float(r.get(name) or 0.0)  # noqa: E731
    if position == "K":
        return {}
    line: dict[str, float] = {}
    rush = g("rush_att_pg")
    line["rushing_yards"] = rush * g("ypc")
    line["rushing_tds"] = rush * g("rush_td_rate")
    line["two_point_rush_rec"] = g("two_pt_rr_pg")
    if position == "QB":
        att = g("pass_att_pg")
        line["passing_yards"] = att * g("ypa")
        line["passing_tds"] = att * g("pass_td_rate")
        line["interceptions"] = att * g("int_rate")
        line["fumbles_lost"] = g("fumbles_pg")
        line["two_point_pass"] = g("two_pt_pass_pg")
        return line
    targets = g("targets_pg")
    line["receptions"] = targets * g("catch_rate")
    line["receiving_yards"] = targets * g("yds_per_target")
    line["receiving_tds"] = targets * g("rec_td_rate")
    line["fumbles_lost"] = (rush + line["receptions"]) * g("fumbles_per_touch")
    return line


def projected_ppg(position: str, r: dict) -> float:
    """Scored PPG for one player's shrunk rates (kickers: the shrunk ppg itself)."""
    if position == "K":
        return float(r.get("ppg") or 0.0)
    return float(score_stats(stat_line_per_game(position, r)))


def project_season(
    seasons: pd.DataFrame, target: int, params: FoldParams | None = None
) -> dict[str, float]:
    """player_id → Stage A projected PPG for ``target`` (fits the fold if not given)."""
    params = params or fit_fold(seasons, target)
    rates = project_rates(seasons, params)
    return {
        row["player_id"]: projected_ppg(row["position"], row)
        for row in rates.to_dict("records")
    }


def stat_names(positions: Iterable[str] | None = None) -> list[tuple[str, str]]:
    """(position, stat) pairs in chain order, for reports."""
    return [(p, s.name) for p in (positions or CHAINS) for s in CHAINS[p]]
